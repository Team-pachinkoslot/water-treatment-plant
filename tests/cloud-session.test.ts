import { commandFlows } from "./command-flows";
import { blueAnswers, blueReport } from "./blue-answers";
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
    const hint = await browser.call("blue-hints", { action: "ACKNOWLEDGE_ANOMALY", index: 0 });
    expect(hint.data.hint).toContain("0.20");
    const check = await browser.call("blue-check", { action: "ACKNOWLEDGE_ANOMALY", answers: { ...blueAnswers.ACKNOWLEDGE_ANOMALY, start: "14:01" } });
    expect(check.data.result.ok).toBe(false);
    expect(check.data.session.blueState).toBe("anomaly_detected");
    for (const action of ["ACKNOWLEDGE_ANOMALY", "ISOLATE_TRAINING_FEED", "ENTER_SIMULATED_SAFE_MODE"] as const) expect((await browser.call("blue-actions", { action, answers: blueAnswers[action] })).response.status).toBe(200);
    expect((await browser.call("blue-actions", { action: "VERIFY_STABLE", answers: { ...blueAnswers.VERIFY_STABLE, confirmed: ["14:10", "14:11"] } })).data.error.code).toBe("VERIFICATION_REQUIRED");
    expect((await browser.call("blue-actions", { action: "VERIFY_STABLE", answers: blueAnswers.VERIFY_STABLE })).response.status).toBe(200);
    expect((await browser.call("blue-actions", { action: "RESTORE_SIMULATED_MONITORING", answers: blueAnswers.RESTORE_SIMULATED_MONITORING })).response.status).toBe(200);
    const completed = await browser.call("report", { track: "blue", report: blueReport });
    expect(completed.data.session).toMatchObject({ complete: true, score: { total: 100 } });
    const restored = await browser.call("restore", {}, "current");
    expect(restored.data.session).toEqual(completed.data.session);
    const oldId = browser.id; const oldState = browser.cloudState;
    expect((await browser.call("reset")).response.status).toBe(201);
    expect(browser.id).not.toBe(oldId);
    expect((await browser.call("restore", {}, oldId)).response.status).toBe(404);
    browser.cloudState = oldState;
    expect((await browser.call("restore")).data.error.code).toBe("STALE_CLOUD_STATE");
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
  it("rejects malformed and oversized bodies", async () => {
    expect((await handleSessionRequest(req({ value: "a".repeat(513_000) }))).status).toBe(413);
    expect((await handleSessionRequest(new Request("https://aqua.vercel.app/api/lab-sessions", { method: "POST", headers: { origin: "https://aqua.vercel.app", "content-type": "application/json" }, body: "{" }))).status).toBe(400);
  });
});
