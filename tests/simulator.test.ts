import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SimulatorScenarioRuntime } from "../src/lib/scenarios/simulator.server";
import * as runtimes from "../src/lib/scenarios/runtime.server";
import { handleSessionRequest } from "../src/lib/scenarios/http.server";
import type { SessionAccess } from "../src/lib/scenarios/session-types";

const report = { observations: "仮想水位の表示とモデルの不一致を確認した。", evidence: "指定された教材とログを照合して根拠を記録した。", timeline: "UTCの時系列に沿って調査と隔離と正常性確認を行った。", improvements: "公開情報を分離し連続した正常値を確認して復旧する。" };
const anomaly = ["2026-11-02T01:00:10Z", "2026-11-02T01:00:20Z", "2026-11-02T01:00:30Z"];
const recovery = ["2026-11-02T01:02:00Z", "2026-11-02T01:02:10Z", "2026-11-02T01:02:20Z"];
let dir: string;
let runtime: SimulatorScenarioRuntime;
let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "aqua-test-")); path = join(dir, "aqua.sqlite"); runtime = new SimulatorScenarioRuntime(path); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
async function started() { const s = await runtime.start("water-01"); return { sessionId: s.sessionId, token: s.token }; }
async function solveRed(access: SessionAccess) {
  for (const stage of ["S01", "S02", "S03", "S04", "S05"]) {
    const material = await runtime.getMaterials(access, stage);
    let flag: string;
    if (stage === "S05") flag = (await runtime.stage5Evidence(access, { sourceIp: "198.51.100.23", firstEventTimestampUtc: "2026-11-02T00:03:00Z" })).flag;
    else flag = material.files.map(f => f.content).join("\n").match(/AQUA\{[^}]+\}/)![0];
    await runtime.submitFlag(access, stage, flag, { ports: "22,8080", risk: "公開メモから学習用アカウント情報が露出するリスク。", permission: "0444" });
  }
  await runtime.submitReport(access, "red", report);
}

describe("persistent browser simulator", () => {
  it("issues unique session-specific material and excludes secrets from status", async () => {
    const a = await started(); const b = await started();
    const one = await runtime.getMaterials(a, "S01"); const two = await runtime.getMaterials(b, "S01");
    expect(one).not.toEqual(two);
    const flag = JSON.parse(one.files[0].content).flag;
    expect(JSON.stringify(await runtime.getSession(a))).not.toContain(flag);
    expect(JSON.stringify(await runtime.getSession(a))).not.toContain(a.token);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(runtime.getSession({ sessionId: a.sessionId, token: b.token })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    await expect(runtime.getMaterials(a, "S02")).rejects.toMatchObject({ code: "STAGE_LOCKED" });
    await expect(runtime.submitFlag(a, "S01", JSON.parse(two.files[0].content).flag)).rejects.toMatchObject({ code: "FLAG_INCORRECT" });
  });
  it("completes all five flags, evidence, reports and ordered recovery for 100 points", async () => {
    const access = await started();
    await expect(runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY")).rejects.toMatchObject({ code: "BLUE_LOCKED" });
    await solveRed(access);
    expect((await runtime.getSession(access)).score.total).toBe(50);
    await expect(runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY", { timestamps: [] })).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    await runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY", { timestamps: anomaly, explanation: report.evidence });
    await runtime.performBlueAction(access, "ISOLATE_TRAINING_FEED");
    await runtime.performBlueAction(access, "ENTER_SIMULATED_SAFE_MODE");
    await expect(runtime.performBlueAction(access, "VERIFY_STABLE", { timestamps: anomaly })).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    expect((await runtime.getSession(access)).blueState).toBe("safe_mode");
    await runtime.performBlueAction(access, "VERIFY_STABLE", { timestamps: recovery });
    await runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING");
    expect((await runtime.getSession(access)).complete).toBe(false);
    const final = await runtime.submitReport(access, "blue", report);
    expect(final).toMatchObject({ complete: true, score: { total: 100, redFlags: 40, redReport: 10, blueActions: 42, blueEvidence: 8 } });
    // A new adapter instance reopens the same SQLite file and restores progress.
    expect(await new SimulatorScenarioRuntime(path).getSession(access)).toEqual(final);
  });
  it("requires stage-specific evidence and does not advance on rejected submissions", async () => {
    const access = await started();
    const flag = JSON.parse((await runtime.getMaterials(access, "S01")).files[0].content).flag;
    await expect(runtime.submitFlag(access, "S01", flag, { ports: "80,443" })).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    expect((await runtime.getSession(access)).completedStages).toEqual([]);
    await expect(runtime.stage5Evidence(access, { sourceIp: "bad", firstEventTimestampUtc: "bad" })).rejects.toMatchObject({ code: "STAGE_LOCKED" });
    await expect(runtime.submitReport(access, "red", report)).rejects.toMatchObject({ code: "REPORT_LOCKED" });
  });
  it("persists rate limits and hint audit without submitted FLAG values", async () => {
    const access = await started();
    await runtime.getHint(access, "S01", 1);
    for (let i = 0; i < 10; i++) await expect(runtime.submitFlag(access, "S01", "wrong-flag-value")).rejects.toMatchObject({ code: "FLAG_INCORRECT" });
    await expect(new SimulatorScenarioRuntime(path).submitFlag(access, "S01", "wrong-flag-value")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const view = await runtime.getSession(access);
    expect(view.events.some(e => e.type === "HINT_2_VIEWED")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("wrong-flag-value");
  });
  it("invalidates old sessions and tokens when resetting", async () => {
    const access = await started(); const before = await runtime.getMaterials(access, "S01");
    const reset = await runtime.reset(access);
    await expect(runtime.getSession(access)).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    expect(reset.session.completedStages).toEqual([]);
    expect(reset.sessionId).not.toBe(access.sessionId);
    expect(await runtime.getMaterials(reset, "S01")).not.toEqual(before);
  });
  it("rejects expired sessions and invalid report bodies", async () => {
    const access = await started(); await solveRed(access);
    await expect(runtime.submitReport(access, "red", { ...report, evidence: "" })).rejects.toMatchObject({ code: "REPORT_INCOMPLETE" });
    const db = new DatabaseSync(path);
    db.prepare("UPDATE sessions SET data = json_set(data, '$.expiresAt', ?) WHERE id = ?").run("2000-01-01T00:00:00Z", access.sessionId); db.close();
    await expect(runtime.getSession(access)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});

describe("HTTP ownership and disabled boundary", () => {
  function req(method = "GET", payload?: unknown, headers: Record<string, string> = {}, url = "http://localhost:3000/api/lab-sessions") {
    return new Request(url, { method, headers: { host: new URL(url).host, ...(method === "POST" ? { origin: new URL(url).origin, "content-type": "application/json" } : {}), ...headers }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  }
  it("refuses API access in disabled and unknown modes", async () => {
    for (const mode of ["disabled", "local", "enabled"]) {
      vi.stubEnv("LAB_RUNTIME_MODE", mode);
      const result = await handleSessionRequest(req("POST", { labId: "water-01" }));
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ error: { code: "RUNTIME_NOT_CONFIGURED" } });
    }
  });
  it("uses HttpOnly cookies and rejects cross-origin, anonymous and mismatched sessions", async () => {
    vi.stubEnv("LAB_RUNTIME_MODE", "simulator");
    vi.spyOn(runtimes, "getScenarioRuntime").mockReturnValue(runtime);
    const response = await handleSessionRequest(req("POST", { labId: "water-01" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    const json = await response.json();
    expect(json.token).toBeUndefined();
    expect(json.session.flags).toBeUndefined();
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect((await handleSessionRequest(req(), "current")).status).toBe(401);
    expect((await handleSessionRequest(req("GET", undefined, { cookie }), "current")).status).toBe(200);
    expect((await handleSessionRequest(req("GET", undefined, { cookie }), "not-owned")).status).toBe(404);
    expect((await handleSessionRequest(req("POST", {}, { cookie, origin: "https://other.test" }), json.session.id, "reset")).status).toBe(403);
    expect((await handleSessionRequest(req("POST", { labId: "water-01" }, {}, "http://external.test/api/lab-sessions"))).status).toBe(403);
    expect((await handleSessionRequest(req("POST", { labId: "water-01" }, { origin: "" }))).status).toBe(403);
  });
  it("limits actual body length and rejects malformed JSON", async () => {
    vi.stubEnv("LAB_RUNTIME_MODE", "simulator");
    const large = await handleSessionRequest(req("POST", { labId: "a".repeat(25_000) }));
    expect(large.status).toBe(413);
    const invalid = new Request("http://localhost:3000/api/lab-sessions", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{" });
    expect((await handleSessionRequest(invalid)).status).toBe(400);
  });
});
