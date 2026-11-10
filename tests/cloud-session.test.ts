import { commandFlows } from "./command-flows";
import { blueReport, judgmentAnswers, solveBlue, type BlueDriver } from "./blue-answers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { handleSessionRequest } from "../src/lib/scenarios/http.server";
import { getScenarioMode } from "../src/lib/scenarios/runtime.server";
import { checkpointCookie, restoreCloudState } from "../src/lib/scenarios/cloud-state.server";

beforeEach(() => {
  vi.stubEnv("LAB_RUNTIME_MODE", "simulator");
  vi.stubEnv("AQUA_SESSION_KEY", randomBytes(32).toString("hex"));
});
afterEach(() => vi.unstubAllEnvs());
function req(payload: unknown, headers: Record<string, string> = {}, origin = "https://aqua.vercel.app", pathname = "/api/lab-sessions") {
  return new Request(origin + pathname, { method: "POST", headers: { host: new URL(origin).host, origin, "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });
}
class Browser {
  cookies = new Map<string, string>();
  cloudState = "";
  id = "";
  async call(operation = "", payload: Record<string, unknown> = {}, id = this.id) {
    const response = await handleSessionRequest(req({ ...payload, ...(this.cloudState ? { cloudState: this.cloudState } : {}) }, { cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join("; ") }), operation ? id : undefined, operation || undefined);
    const data = await response.json();
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";")[0]; const split = first.indexOf("=");
      this.cookies.set(first.slice(0, split), first.slice(split + 1));
    }
    if (data.cloudState) this.cloudState = data.cloudState;
    if (data.session) this.id = data.session.id;
    return { response, data };
  }
}
function httpDriver(browser: Browser): BlueDriver {
  const ok = async (operation: string, payload: Record<string, unknown>) => {
    const r = await browser.call(operation, payload);
    expect(r.response.status, JSON.stringify(r.data.error)).toBe(200);
    return r.data;
  };
  return {
    check: async (judgmentId, answer) => (await ok("blue-check", { judgmentId, answer })).result,
    observe: () => ok("blue-observe", {}),
    act: action => ok("blue-actions", { action }),
  };
}
const report = { observations: "公開サービスとWebページの手掛かりを確認した。", evidence: "模擬ログと独立した観測値を比較して証拠を記録した。", timeline: "UTCの順番で調査、隔離、安全モード、正常確認を行った。", improvements: "公開情報を分離し復旧条件を確認してから正常監視へ戻す。" };
async function solveRed(browser: Browser) {
  for (const stageId of ["S01", "S02", "S03", "S04", "S05"]) {
    let output = "";
    for (const command of commandFlows[stageId]) {
      const executed = await browser.call("commands", { stageId, command });
      expect(executed.response.status).toBe(200);
      expect(executed.data.result.exitCode).toBe(0);
      output += executed.data.result.output + "\n";
    }
    let flag;
    if (stageId === "S05") {
      const evidence = await browser.call("stage5-evidence", { sourceIp: "198.51.100.23", firstEventTimestampUtc: "2026-11-02T00:03:00Z" });
      expect(evidence.response.status).toBe(200); flag = evidence.data.flag;
    } else flag = output.match(/AQUA\{[^}]+\}/)![0];
    const result = await browser.call("flags", { stageId, flag, evidence: { ports: "22,8080", risk: report.improvements, permission: "0444" } });
    expect(result.response.status).toBe(200);
  }
  expect((await browser.call("report", { track: "red", report })).response.status).toBe(200);
}

describe("Vercel-only exercise transport", () => {
  it("is enabled by default while respecting an explicit stop", () => {
    expect(getScenarioMode("")).toBe("simulator");
    expect(getScenarioMode("disabled")).toBe("disabled");
    expect(getScenarioMode("unknown")).toBe("disabled");
  });
  it("starts on an HTTPS Vercel origin with secure cookies and encrypted browser state", async () => {
    const browser = new Browser();
    const { response, data } = await browser.call("", { labId: "water-01" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) expect(cookie).toContain("HttpOnly; SameSite=Strict; Max-Age=86400; Secure");
    expect(data.session.flags).toBeUndefined(); expect(data.token).toBeUndefined();
    expect(browser.cloudState).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(browser.cloudState).not.toMatch(/AQUA|ownerHash|198\.51/);
    expect((await browser.call("restore", {}, "current")).response.status).toBe(200);
  });
  it("completes and restores 100 points across independent stateless requests", async () => {
    const browser = new Browser();
    await browser.call("", { labId: "water-01" });
    expect((await browser.call("materials", { stageId: "S05" })).response.status).toBe(409);
    await solveRed(browser);
    expect((await browser.call("blue-actions", { action: "RESTORE_SIMULATED_MONITORING" })).data.error.code).toBe("INVALID_STATE_TRANSITION");
    const hint = await browser.call("blue-hints", { judgmentId: "1-1", index: 0 });
    expect(hint.data.hint).toContain("0.20");
    const check = await browser.call("blue-check", { judgmentId: "1-1", answer: "14:01" });
    expect(check.data.result).toMatchObject({ ok: false, kind: "wrong" });
    expect(check.data.session.blueState).toBe("anomaly_detected");
    expect((await browser.call("blue-actions", { action: "ACKNOWLEDGE_ANOMALY" })).data.error.code).toBe("STEP_INCOMPLETE");
    expect((await browser.call("blue-check", { judgmentId: "1-1", answer: judgmentAnswers["1-1"] })).data.result.ok).toBe(true);
    // 再読み込み相当(restore)でも判断の進捗が残る
    expect((await browser.call("restore", {}, "current")).data.session.blueProgress.judgments["1-1"]).toMatchObject({ solved: true, points: 2, wrongAttempts: 1 });
    await solveBlue(httpDriver(browser));
    expect((await browser.call("restore", {}, "current")).data.session).toMatchObject({ blueState: "recovered", score: { blueActions: 41 } });
    const completed = await browser.call("report", { track: "blue", report: blueReport });
    expect(completed.data.session).toMatchObject({ complete: true, score: { total: 99 } });
    expect((await browser.call("report", { track: "blue", report: blueReport })).data.error.code).toBe("REPORT_ALREADY_SUBMITTED");
    const restored = await browser.call("restore", {}, "current");
    // 再提出の拒否は監査履歴にだけ残る。進捗・得点・レポートは提出時のまま
    expect({ ...restored.data.session, events: [] }).toEqual({ ...completed.data.session, events: [] });
    expect(restored.data.session.events.at(-1).type).toBe("REJECTED_REPORT_ALREADY_SUBMITTED");
    const oldId = browser.id; const oldState = browser.cloudState;
    expect((await browser.call("reset")).response.status).toBe(201);
    expect(browser.id).not.toBe(oldId);
    expect((await browser.call("restore", {}, oldId)).response.status).toBe(404);
    browser.cloudState = oldState;
    expect((await browser.call("restore")).data.error.code).toBe("STALE_CLOUD_STATE");
  });
  it("keeps Blue-only practice in its own cookies and storage, separate from the normal exercise", async () => {
    const browser = new Browser();
    await browser.call("", { labId: "water-01" });
    const normal = { id: browser.id, cloudState: browser.cloudState };
    const practice = new Browser(); practice.cookies = new Map(browser.cookies);
    const call = (operation = "", payload: Record<string, unknown> = {}) => practice.call(operation, { ...payload, slot: "practice" });
    const started = await call("", { labId: "water-01" });
    expect(started.response.status).toBe(201);
    expect(started.response.headers.getSetCookie().map(c => c.split("=")[0]).sort()).toEqual(["aqua_practice_checkpoint", "aqua_practice_session"]);
    expect(started.data.session).toMatchObject({ exerciseMode: "practice" });
    const p: BlueDriver = {
      check: async (judgmentId, answer) => (await call("blue-check", { judgmentId, answer })).data.result,
      observe: () => call("blue-observe"),
      act: action => call("blue-actions", { action }),
    };
    await solveBlue(p);
    const done = await call("report", { track: "blue", report: blueReport });
    expect(done.data.session).toMatchObject({ exerciseMode: "practice", complete: false, score: { blueActions: 42, total: 0 } });
    // 通常の演習は影響を受けない
    browser.cookies = new Map([...practice.cookies].filter(([k]) => !k.startsWith("aqua_practice"))); browser.cloudState = normal.cloudState; browser.id = normal.id;
    const restored = await browser.call("restore", {}, "current");
    expect(restored.data.session).toMatchObject({ exerciseMode: "normal", blueState: "anomaly_detected", score: { total: 0 } });
    // 練習の保存データを通常のスロットへ持ち込んでも受け付けない
    browser.cloudState = practice.cloudState;
    expect((await browser.call("restore", {}, "current")).response.status).toBe(409);
  });
  it("refuses modified state, another browser, and stale checkpoints", async () => {
    const browser = new Browser(); await browser.call("", { labId: "water-01" });
    const original = browser.cloudState;
    browser.cloudState = original.slice(0, 40) + (original[40] === "A" ? "B" : "A") + original.slice(41);
    expect((await browser.call("restore")).response.status).toBe(409);
    const stranger = new Browser(); stranger.cloudState = original; stranger.id = browser.id;
    expect((await stranger.call("restore")).response.status).toBe(401);
    browser.cloudState = original;
    await browser.call("hints", { stageId: "S01", index: 0 });
    browser.cloudState = original;
    expect((await browser.call("restore")).data.error.code).toBe("STALE_CLOUD_STATE");
  });
  it("requires terminal commands instead of direct material reads and generates the next hint", async () => {
    const browser = new Browser(); await browser.call("", { labId: "water-01" });
    expect((await browser.call("materials", { stageId: "S01" })).data.error.code).toBe("COMMAND_REQUIRED");
    const first = await browser.call("hints", { stageId: "S01", index: 2 });
    expect(first.data.command).toContain("nmap");
    const executed = await browser.call("commands", { stageId: "S01", command: first.data.command });
    expect(executed.data.result.scene).toBe("recon");
    expect(executed.data.session.terminal.observations).toContain("S01:services");
    const next = await browser.call("hints", { stageId: "S01", index: 2 });
    expect(next.data.command).toContain("/training/discovery");
    const rejected = await browser.call("commands", { stageId: "S01", command: "curl https://outside.test" });
    expect(rejected.data.result.exitCode).toBe(1);
    expect(rejected.data.result.scene).toBe("blocked");
    const contextual = await browser.call("hints", { stageId: "S01", index: 0 });
    expect(contextual.data.hint).toContain("aqua.lab.test");
    const restored = await browser.call("restore");
    expect(restored.data.session.terminal.observations).toContain("S01:services");
    expect(JSON.stringify(restored.data.session.events)).not.toContain("outside.test");
  });
  it("authenticates the encrypted payload even with a valid checkpoint digest", async () => {
    const browser = new Browser(); await browser.call("", { labId: "water-01" });
    const modified = browser.cloudState.slice(0,40) + (browser.cloudState[40] === "A" ? "B" : "A") + browser.cloudState.slice(41);
    const proof = checkpointCookie(modified, [], true).split(";")[0];
    expect(() => restoreCloudState(new Request("https://aqua.vercel.app", { headers: { cookie: proof } }), modified)).toThrowError();
  });
  it("preserves failed-attempt limits inside the refreshed encrypted state", async () => {
    const browser = new Browser(); await browser.call("", { labId: "water-01" });
    for (let i = 0; i < 10; i++) expect((await browser.call("flags", { stageId: "S01", flag: "wrong-flag" })).data.error.code).toBe("FLAG_INCORRECT");
    expect((await browser.call("flags", { stageId: "S01", flag: "wrong-flag" })).response.status).toBe(429);
    expect(JSON.stringify((await browser.call("restore")).data.session)).not.toContain("wrong-flag");
  });
  it("rejects cross-origin requests and accepts normalized localhost URLs", async () => {
    expect((await handleSessionRequest(req({ labId: "water-01" }, { origin: "https://other.test" }))).status).toBe(403);
    expect((await handleSessionRequest(req({ labId: "water-01" }, { host: "other.test" }))).status).toBe(403);
    expect((await handleSessionRequest(req({ labId: "water-01" }, {}, "http://aqua.vercel.app"))).status).toBe(403);
    expect((await handleSessionRequest(req({ labId: "water-01" }, { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }, "http://localhost:3000"))).status).toBe(201);
  });
  it("does not enable exercise operations in disabled or unknown modes", async () => {
    for (const mode of ["disabled", "local", "enabled"]) {
      vi.stubEnv("LAB_RUNTIME_MODE", mode);
      const result = await handleSessionRequest(req({ labId: "water-01" }));
      expect(result.status).toBe(503); expect((await result.json()).error.code).toBe("RUNTIME_NOT_CONFIGURED");
    }
  });
  it("keeps saved answers across an update that rotates the key via AQUA_SESSION_KEY_PREVIOUS", async () => {
    const browser = new Browser();
    await browser.call("", { labId: "water-01" });
    await solveRed(browser);
    const before = (await browser.call("restore", {}, "current")).data.session;
    const oldKey = process.env.AQUA_SESSION_KEY!;
    vi.stubEnv("AQUA_SESSION_KEY", randomBytes(32).toString("hex"));
    // 旧鍵を残さなければ読めない(従来どおり)
    expect((await browser.call("restore", {}, "current")).response.status).toBe(409);
    vi.stubEnv("AQUA_SESSION_KEY_PREVIOUS", oldKey);
    const restored = await browser.call("restore", {}, "current");
    expect(restored.response.status).toBe(200);
    expect(restored.data.session).toMatchObject({ completedStages: before.completedStages, reports: before.reports, score: before.score });
    // 読み込んだ時点で新しい鍵で暗号化し直されるので、旧鍵を外しても続けられる
    vi.stubEnv("AQUA_SESSION_KEY_PREVIOUS", "");
    expect((await browser.call("restore", {}, "current")).data.session.completedStages).toEqual(before.completedStages);
  });
  it("rejects malformed and oversized bodies", async () => {
    expect((await handleSessionRequest(req({ value: "a".repeat(513_000) }))).status).toBe(413);
    expect((await handleSessionRequest(new Request("https://aqua.vercel.app/api/lab-sessions", { method: "POST", headers: { origin: "https://aqua.vercel.app", "content-type": "application/json" }, body: "{" }))).status).toBe(400);
  });
});
