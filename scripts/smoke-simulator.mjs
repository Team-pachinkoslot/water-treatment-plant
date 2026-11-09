import assert from "node:assert/strict";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
assert(base.protocol === "https:" || ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use HTTPS or a loopback server");
const disabled = process.argv.includes("--disabled");
let cookie = "";
let cloudState = "";
const cookies = new Map();
let session;
async function api(path = "", payload, expected = 200, useCookie = true) {
  const [pathname, query] = path.split("?");
  const stageId = query ? new URLSearchParams(query).get("stageId") : undefined;
  const normalized = pathname && pathname.split("/").filter(Boolean).length === 1 ? `${pathname}/restore` : pathname;
  const response = await fetch(`${base.origin}/api/lab-sessions${normalized}`, {
    method: "POST",
    headers: { ...(useCookie && cookie ? { cookie } : {}), origin: base.origin, "content-type": "application/json" },
    body: JSON.stringify({ ...(payload ?? {}), ...(stageId ? { stageId } : {}), ...(cloudState ? { cloudState } : {}) }),
  });
  assert.equal(response.status, expected, `Unexpected status for ${path}`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json();
  for (const entry of response.headers.getSetCookie()) {
    const first = entry.split(";")[0]; const split = first.indexOf("=");
    cookies.set(first.slice(0, split), first.slice(split + 1));
  }
  cookie = [...cookies].map(([k,v]) => `${k}=${v}`).join("; ");
  if (data.cloudState) cloudState = data.cloudState;
  if (data.session) session = data.session;
  return data;
}
for (const path of ["/", "/labs", "/labs/water-treatment", "/labs/water-treatment/practice", "/labs/power-substation", "/labs/railway-operations"]) {
  const response = await fetch(`${base.origin}${path}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(!/AQUA\{S\d\d_[a-f0-9]+\}/.test(html), "Session flags leaked into page HTML");
  if (path === "/labs/water-treatment" && !disabled) {
    assert(html.includes('href="/labs/water-treatment/practice?start=1"'), "Start link is missing");
    assert(html.includes("ブラウザで演習を始める"), "Available exercise panel is missing");
  }
}
const health = await (await fetch(`${base.origin}/api/health`)).json();
assert.equal(health.runtime.connected, false);
if (disabled) {
  for (const [path,payload] of [["", { labId: "water-01" }], ["/current", undefined], ["/current/flags", { stageId: "S01", flag: "wrong" }], ["/current/blue-actions", { action: "ACKNOWLEDGE_ANOMALY" }], ["/current/commands", { stageId: "S01", command: "help" }]]) {
    assert.equal((await api(path, payload, 503)).error.code, "RUNTIME_NOT_CONFIGURED");
  }
  console.log("Disabled mode: pages, health and all mutation rejections passed.");
  process.exit(0);
}
assert.equal(health.scenarioRuntime.mode, "simulator");
await api("/current", undefined, 401);
await api("", { labId: "water-01" }, 201);
const id = session.id;
assert.equal(session.mode, "simulator");
assert.equal(session.flags, undefined);
await api(`/${id}/materials?stageId=S05`, undefined, 409);
await api(`/${id}/blue-actions`, { action: "RESTORE_SIMULATED_MONITORING" }, 409);
const report = { observations: "仮想データの不一致と公開情報の問題を確認した。", evidence: "教材とアクセスログおよび水位サンプルを照合した。", timeline: "UTCで時系列を整理し隔離から正常確認まで順番に対応した。", improvements: "秘密情報を公開領域から分離し連続正常サンプルを確認する。" };
for (const stageId of ["S01", "S02", "S03", "S04", "S05"]) {
  const flows = {
    S01: ["nmap -sT -p 22,8080 aqua.lab.test", "curl http://aqua.lab.test:8080/training/discovery"],
    S02: ["curl http://aqua.lab.test:8080/", "curl http://aqua.lab.test:8080/training/inspection"],
    S03: ["curl http://aqua.lab.test:8080/public/maintenance-note.txt"],
    S04: ["ssh aquareader@aqua.lab.test", "pwd", "cd casefiles", "ls -l", "cat README.txt"],
    S05: ["cat /srv/aqua-lab/readonly/logs/aqua-access.log", "grep 401 /srv/aqua-lab/readonly/logs/aqua-access.log | head -n 3"],
  };
  let output = "";
  for (const command of flows[stageId]) {
    const executed = await api(`/${id}/commands`, { stageId, command });
    assert.equal(executed.result.exitCode, 0);
    output += executed.result.output + "\n";
  }
  let flag;
  if (stageId === "S05") {
    await api(`/${id}/stage5-evidence`, { sourceIp: "wrong", firstEventTimestampUtc: "wrong" }, 400);
    const rows = output.trim().split("\n").map(row => row.split(/\s+/));
    const first401 = rows.find(row => row[4] === "401");
    flag = (await api(`/${id}/stage5-evidence`, { sourceIp: first401[1], firstEventTimestampUtc: first401[0] })).flag;
  } else flag = output.match(/AQUA\{[^}]+\}/)[0];
  if (stageId === "S01") {
    await api(`/${id}/flags`, { stageId, flag: "incorrect" }, 400);
    const hint = await api(`/${id}/hints`, { stageId, index: 0 });
    assert.equal(typeof hint.hint, "string");
  }
  await api(`/${id}/flags`, { stageId, flag, evidence: { ports: "22,8080", risk: "公開メモに訓練用情報が露出しているため情報漏えいのリスク。", permission: "0444" } });
  assert.equal(session.completedStages.length, Number(stageId.slice(1)));
  assert(!JSON.stringify(session).includes(flag));
}
await api(`/${id}/report`, { track: "red", report });
assert.equal(session.score.total, 50);
await api(`/${id}/blue-actions`, { action: "RESTORE_SIMULATED_MONITORING" }, 409);
await api(`/${id}/blue-actions`, { action: "ACKNOWLEDGE_ANOMALY", timestamps: [], explanation: report.evidence }, 400);
await api(`/${id}/blue-actions`, { action: "ACKNOWLEDGE_ANOMALY", timestamps: ["2026-11-02T01:00:10Z", "2026-11-02T01:00:20Z", "2026-11-02T01:00:30Z"], explanation: report.evidence });
await api(`/${id}/blue-actions`, { action: "ISOLATE_TRAINING_FEED" });
await api(`/${id}/blue-actions`, { action: "ENTER_SIMULATED_SAFE_MODE" });
await api(`/${id}/blue-actions`, { action: "VERIFY_STABLE", timestamps: [] }, 409);
await api(`/${id}/blue-actions`, { action: "VERIFY_STABLE", timestamps: ["2026-11-02T01:02:00Z", "2026-11-02T01:02:10Z", "2026-11-02T01:02:20Z"] });
await api(`/${id}/blue-actions`, { action: "RESTORE_SIMULATED_MONITORING" });
await api(`/${id}/report`, { track: "blue", report });
assert.equal(session.complete, true);
assert.equal(session.score.total, 100);
const completed = session;
await api("/current");
assert.deepEqual(session, completed);
await api(`/${id}/reset`, {}, 201);
assert.notEqual(session.id, id);
assert.equal(session.score.total, 0);
await api(`/${id}`, undefined, 404);
await api("/current");
assert.equal(session.complete, false);
console.log("Simulator: terminal commands, 5 flags, reports, ordered recovery, 100 points, reload and reset passed. No VM actions performed.");
