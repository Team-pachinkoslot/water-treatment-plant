import assert from "node:assert/strict";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Smoke tests must target a loopback server");
const disabled = process.argv.includes("--disabled");
let cookie = "";
let session;
async function api(path = "", payload, expected = 200, useCookie = true) {
  const response = await fetch(`${base.origin}/api/lab-sessions${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: { ...(useCookie && cookie ? { cookie } : {}), ...(payload === undefined ? {} : { origin: base.origin, "content-type": "application/json" }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  assert.equal(response.status, expected, `Unexpected status for ${path}`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json();
  if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  if (data.session) session = data.session;
  return data;
}
for (const path of ["/", "/labs", "/labs/water-treatment", "/labs/water-treatment/practice", "/labs/power-substation", "/labs/railway-operations"]) {
  const response = await fetch(`${base.origin}${path}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(!/AQUA\{S\d\d_[a-f0-9]+\}/.test(html), "Session flags leaked into page HTML");
}
const health = await (await fetch(`${base.origin}/api/health`)).json();
assert.equal(health.runtime.connected, false);
if (disabled) {
  for (const [path,payload] of [["", { labId: "water-01" }], ["/current", undefined], ["/current/flags", { stageId: "S01", flag: "wrong" }], ["/current/blue-actions", { action: "ACKNOWLEDGE_ANOMALY" }]]) {
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
  const material = await api(`/${id}/materials?stageId=${stageId}`);
  assert.equal(material.stageId, stageId);
  let flag;
  if (stageId === "S05") {
    await api(`/${id}/stage5-evidence`, { sourceIp: "wrong", firstEventTimestampUtc: "wrong" }, 400);
    const rows = material.files[0].content.trim().split("\n").map(row => row.split(/\s+/));
    const first401 = rows.find(row => row[4] === "401");
    flag = (await api(`/${id}/stage5-evidence`, { sourceIp: first401[1], firstEventTimestampUtc: first401[0] })).flag;
  } else flag = material.files.map(file => file.content).join("\n").match(/AQUA\{[^}]+\}/)[0];
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
const oldCookie = cookie;
await api(`/${id}/reset`, {}, 201);
assert.notEqual(session.id, id);
assert.equal(session.score.total, 0);
const freshCookie = cookie;
cookie = oldCookie;
await api(`/${id}`, undefined, 404);
cookie = freshCookie;
await api("/current");
assert.equal(session.complete, false);
console.log("Simulator: 5 flags, reports, ordered recovery, 100 points, reload and reset passed. No VM actions performed.");
