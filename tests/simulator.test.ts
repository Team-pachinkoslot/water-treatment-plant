import { commandFlows } from "./command-flows";
import { blueAnswers, blueOrder, blueReport } from "./blue-answers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SimulatorScenarioRuntime } from "../src/lib/scenarios/simulator.server";
import type { SessionAccess } from "../src/lib/scenarios/session-types";

const report = { observations: "公開サービスとWeb教材の調査結果を確認した。", evidence: "指定された教材とログを照合して根拠を記録した。", timeline: "UTCの時系列に沿って調査と隔離と正常性確認を行った。", improvements: "公開情報を分離し連続した正常値を確認して復旧する。" };
let dir: string;
let runtime: SimulatorScenarioRuntime;
let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "aqua-test-")); path = join(dir, "aqua.sqlite"); runtime = new SimulatorScenarioRuntime(path); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
async function started() { const s = await runtime.start("water-01"); return { sessionId: s.sessionId, token: s.token }; }
async function solveRed(access: SessionAccess) {
  for (const stage of ["S01", "S02", "S03", "S04", "S05"]) {
    let output = "";
    for (const command of commandFlows[stage]) {
      const response = await runtime.executeCommand(access, stage, command);
      expect(response.result.exitCode).toBe(0);
      output += response.result.output + "\n";
    }
    let flag: string;
    if (stage === "S05") flag = (await runtime.stage5Evidence(access, { sourceIp: "198.51.100.23", firstEventTimestampUtc: "2026-11-02T00:03:00Z" })).flag;
    else flag = output.match(/AQUA\{[^}]+\}/)![0];
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
    await expect(runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY", { start: "14:01", confirmed: "14:03" })).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    expect((await runtime.getSession(access)).blueState).toBe("anomaly_detected");
    await runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY", blueAnswers.ACKNOWLEDGE_ANOMALY);
    await expect(runtime.performBlueAction(access, "ENTER_SIMULATED_SAFE_MODE", blueAnswers.ENTER_SIMULATED_SAFE_MODE)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await runtime.performBlueAction(access, "ISOLATE_TRAINING_FEED", blueAnswers.ISOLATE_TRAINING_FEED);
    await runtime.performBlueAction(access, "ENTER_SIMULATED_SAFE_MODE", blueAnswers.ENTER_SIMULATED_SAFE_MODE);
    for (const confirmed of [["14:10"], ["14:10", "14:11"]]) await expect(runtime.performBlueAction(access, "VERIFY_STABLE", { ...blueAnswers.VERIFY_STABLE, confirmed })).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    expect((await runtime.getSession(access)).blueState).toBe("safe_mode");
    await runtime.performBlueAction(access, "VERIFY_STABLE", blueAnswers.VERIFY_STABLE);
    await runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING", blueAnswers.RESTORE_SIMULATED_MONITORING);
    expect((await runtime.getSession(access)).complete).toBe(false);
    await expect(runtime.submitReport(access, "blue", report)).rejects.toMatchObject({ code: "REPORT_INCOMPLETE" });
    const final = await runtime.submitReport(access, "blue", blueReport);
    expect(final).toMatchObject({ complete: true, score: { total: 100, redFlags: 40, redReport: 10, blueActions: 42, blueEvidence: 8 } });
    // A new adapter instance reopens the same SQLite file and restores progress.
    expect(await new SimulatorScenarioRuntime(path).getSession(access)).toEqual(final);
  });
  it("deducts inappropriate choices and deeper hints within the step, never below half", async () => {
    const access = await started(); await solveRed(access);
    await runtime.getBlueHint(access, "ACKNOWLEDGE_ANOMALY", 0);
    await runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY", blueAnswers.ACKNOWLEDGE_ANOMALY);
    const wrong = { ...blueAnswers.ISOLATE_TRAINING_FEED, decision: "stop-plc" };
    const checked = await runtime.checkBlueStep(access, "ISOLATE_TRAINING_FEED", wrong);
    expect(checked.result.ok).toBe(false);
    expect(checked.result.feedback.some(f => f.message.includes("消毒不足"))).toBe(true);
    expect(checked.session.blueState).toBe("investigating");
    await runtime.getBlueHint(access, "ISOLATE_TRAINING_FEED", 2);
    expect((await runtime.checkBlueStep(access, "ISOLATE_TRAINING_FEED", blueAnswers.ISOLATE_TRAINING_FEED)).result.ok).toBe(true);
    await runtime.performBlueAction(access, "ISOLATE_TRAINING_FEED", blueAnswers.ISOLATE_TRAINING_FEED);
    for (let i = 0; i < 8; i++) await runtime.checkBlueStep(access, "ENTER_SIMULATED_SAFE_MODE", { actions: ["stop"] });
    await runtime.performBlueAction(access, "ENTER_SIMULATED_SAFE_MODE", blueAnswers.ENTER_SIMULATED_SAFE_MODE);
    const view = await runtime.getSession(access);
    expect(view.blueProgress.startedAt).not.toBeNull();
    expect(view.blueProgress.steps.ACKNOWLEDGE_ANOMALY).toMatchObject({ points: 9, hintLevel: 1 });
    expect(view.blueProgress.steps.ISOLATE_TRAINING_FEED).toMatchObject({ points: 9 - 1 - 2, mistakes: 1, hintLevel: 3 });
    expect(view.blueProgress.steps.ENTER_SIMULATED_SAFE_MODE).toMatchObject({ points: 5, mistakes: 8 });
    expect(view.score.blueActions).toBe(9 + 6 + 5);
    await expect(runtime.getBlueHint(access, "ACKNOWLEDGE_ANOMALY", 0)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(blueOrder).toHaveLength(5);
  });
  it("requires stage-specific evidence and does not advance on rejected submissions", async () => {
    const access = await started();
    const flag = JSON.parse((await runtime.getMaterials(access, "S01")).files[0].content).flag;
    for (const command of commandFlows.S01) await runtime.executeCommand(access, "S01", command);
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
