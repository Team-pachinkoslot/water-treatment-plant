import { commandFlows } from "./command-flows";
import { RECOVERY_RECORDS, blueOrder, blueReport, judgmentAnswers, solveBlue, solveBlueStep, type BlueDriver } from "./blue-answers";
import { JUDGMENT_IDS } from "../src/lib/scenarios/blue-steps";
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
const driver = (access: SessionAccess): BlueDriver => ({
  check: async (id, answer) => (await runtime.checkBlueJudgment(access, id, answer)).result,
  observe: () => runtime.observeRecovery(access),
  act: code => runtime.performBlueAction(access, code),
});
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
    // POSIX のファイル権限は Windows では反映されない
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(runtime.getSession({ sessionId: a.sessionId, token: b.token })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    await expect(runtime.getMaterials(a, "S02")).rejects.toMatchObject({ code: "STAGE_LOCKED" });
    await expect(runtime.submitFlag(a, "S01", JSON.parse(two.files[0].content).flag)).rejects.toMatchObject({ code: "FLAG_INCORRECT" });
  });
  it("completes all five flags, 16 judgments in order, reports and recovery for 100 points (E2E)", async () => {
    const access = await started();
    await expect(runtime.checkBlueJudgment(access, "1-1", "14:03")).rejects.toMatchObject({ code: "BLUE_LOCKED" });
    await expect(runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY")).rejects.toMatchObject({ code: "BLUE_LOCKED" });
    await solveRed(access);
    expect((await runtime.getSession(access)).score.total).toBe(50);
    // 未着手の STEP は判断できない(資料の閲覧のみ)。遷移は判断がそろうまで不可。
    await expect(runtime.checkBlueJudgment(access, "2-1", judgmentAnswers["2-1"])).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY")).rejects.toMatchObject({ code: "STEP_INCOMPLETE" });
    await expect(runtime.checkBlueJudgment(access, "9-9", "x")).rejects.toMatchObject({ code: "INVALID_JUDGMENT" });
    // 1-2 は 1-1 の正解まで入力できない(誤答として数えない)
    const blocked = await runtime.checkBlueJudgment(access, "1-2", "14:05");
    expect(blocked.result).toMatchObject({ ok: false, kind: "info" });
    expect(blocked.session.blueProgress.judgments["1-2"]).toMatchObject({ solved: false, wrongAttempts: 0 });
    const spike = await runtime.checkBlueJudgment(access, "1-1", "14:01");
    expect(spike.result.feedback).toContain("14:02");
    expect(spike.session.blueState).toBe("anomaly_detected");

    let view = await runtime.getSession(access);
    const d = driver(access);
    for (const code of blueOrder) {
      await solveBlueStep(d, code);
      view = await runtime.getSession(access);
      expect(view.blueProgress.steps[code]).toMatchObject({ completed: true, solved: view.blueProgress.steps[code].total });
    }
    expect(view.blueState).toBe("recovered");
    // 1-1 で1回誤答したので 42 − 1
    expect(view.score.blueActions).toBe(41);
    expect(view.blueProgress.judgments["1-1"]).toMatchObject({ points: 2, wrongAttempts: 1 });
    expect(view.blueProgress.recoveryObserved).toBe(RECOVERY_RECORDS);
    expect(view.complete).toBe(false);
    await expect(runtime.submitReport(access, "blue", report)).rejects.toMatchObject({ code: "REPORT_INCOMPLETE" });
    const final = await runtime.submitReport(access, "blue", blueReport);
    expect(final).toMatchObject({ complete: true, score: { total: 99, redFlags: 40, redReport: 10, blueActions: 41, blueEvidence: 8 } });
    // 提出済みの防御レポートは再提出できない
    await expect(runtime.submitReport(access, "blue", blueReport)).rejects.toMatchObject({ code: "REPORT_ALREADY_SUBMITTED" });
    // A new adapter instance reopens the same SQLite file and restores progress, score and state.
    expect(await new SimulatorScenarioRuntime(path).getSession(access)).toEqual(await runtime.getSession(access));
    // リセットで初期状態(anomaly_detected、0/42)へ
    const reset = await runtime.reset(access);
    expect(reset.session).toMatchObject({ blueState: "anomaly_detected", score: { total: 0, blueActions: 0 }, reports: { red: null, blue: null } });
    expect(Object.values(reset.session.blueProgress.judgments).every(j => !j.solved && j.points === 0)).toBe(true);
  });
  it("reaches the full 42 points with first-try answers and keeps transitions/judgments idempotent", async () => {
    const access = await started(); await solveRed(access);
    await solveBlue(driver(access));
    const done = await runtime.getSession(access);
    expect(done.score.blueActions).toBe(42);
    // 同じ遷移・同じ判断を重ねても、得点は二重に加算されない
    for (const code of blueOrder) expect((await runtime.performBlueAction(access, code)).score.blueActions).toBe(42);
    const again = await runtime.checkBlueJudgment(access, "1-1", "14:01");
    expect(again.result.ok).toBe(true);
    expect(again.session.blueProgress.judgments["1-1"]).toMatchObject({ wrongAttempts: 0, points: 3 });
    expect(again.session.score.blueActions).toBe(42);
    expect((await runtime.submitReport(access, "blue", blueReport)).score.total).toBe(100);
  });
  it("protects the order inside STEP 04 and STEP 05", async () => {
    const access = await started(); await solveRed(access);
    const d = driver(access);
    for (const code of blueOrder.slice(0, 3)) await solveBlueStep(d, code);
    await expect(runtime.observeRecovery(access)).rejects.toMatchObject({ code: "ORDER_REQUIRED" });
    expect((await runtime.checkBlueJudgment(access, "4-3", true)).result).toMatchObject({ ok: false, kind: "info" });
    // 上長承認(4-1)は誤った値では確定しない
    expect((await runtime.checkBlueJudgment(access, "4-1", "0.40")).result.ok).toBe(false);
    expect((await runtime.getSession(access)).blueProgress.judgments["4-1"]).toMatchObject({ solved: false, wrongAttempts: 1 });
    await runtime.checkBlueJudgment(access, "4-1", "1.2");
    await runtime.checkBlueJudgment(access, "4-2", "maint_tmp");
    await runtime.checkBlueJudgment(access, "4-3", true);
    await runtime.observeRecovery(access);
    expect((await runtime.checkBlueJudgment(access, "4-4", "normal")).result.feedback).toContain("切替直後の1回だけ");
    await runtime.observeRecovery(access); await runtime.observeRecovery(access);
    expect((await runtime.checkBlueJudgment(access, "4-4", "normal")).result.feedback).toContain("あと1回必要");
    await expect(runtime.performBlueAction(access, "VERIFY_STABLE")).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    await runtime.observeRecovery(access);
    await expect(runtime.observeRecovery(access)).rejects.toMatchObject({ code: "NO_MORE_RECORDS" });
    expect((await runtime.checkBlueJudgment(access, "4-4", "normal")).result.ok).toBe(true);
    await runtime.checkBlueJudgment(access, "4-5", "consistent");
    let view = await runtime.performBlueAction(access, "VERIFY_STABLE");
    expect(view.blueState).toBe("verified");
    // 4-4 は 2回誤答 → 2−2 だが下限 1点。4-1 は1回誤答 → 1点
    expect(view.blueProgress.steps.VERIFY_STABLE.points).toBe(10 - 1 - 1);
    // STEP 05: AUTO の前に隔離を解除しようとしても実行しない(誤答にも数えない)
    const early = await runtime.checkBlueJudgment(access, "5-2", true);
    expect(early.result).toMatchObject({ ok: false, kind: "info", feedback: "先に運転を自動に戻し、安定を確認してから隔離を解除します。" });
    expect(early.session.blueProgress.judgments["5-2"]).toMatchObject({ solved: false, wrongAttempts: 0 });
    await runtime.checkBlueJudgment(access, "5-1", "AUTO");
    await runtime.checkBlueJudgment(access, "5-2", true);
    await expect(runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING")).rejects.toMatchObject({ code: "STEP_INCOMPLETE" });
    await runtime.checkBlueJudgment(access, "5-3", judgmentAnswers["5-3"]);
    view = await runtime.performBlueAction(access, "RESTORE_SIMULATED_MONITORING");
    expect(view.blueState).toBe("recovered");
    expect(view.blueProgress.finishedAt).not.toBeNull();
  });
  it("deducts wrong answers and the example hint per judgment, never below half", async () => {
    const access = await started(); await solveRed(access);
    await runtime.getBlueHint(access, "1-1", 0);
    await runtime.getBlueHint(access, "1-1", 1);
    await runtime.getBlueHint(access, "1-2", 2);
    const hint = await runtime.getBlueHint(access, "1-3", 2);
    expect(hint).toMatchObject({ judgmentId: "1-3", level: 2 });
    expect(hint.hint).toContain("14:01");
    for (const t of ["14:00", "14:01", "14:02", "14:04"]) await runtime.checkBlueJudgment(access, "1-1", t);
    await runtime.checkBlueJudgment(access, "1-3", "短い");
    for (const id of ["1-1", "1-2", "1-3"] as const) expect((await runtime.checkBlueJudgment(access, id, judgmentAnswers[id])).result.ok).toBe(true);
    const view = await runtime.performBlueAction(access, "ACKNOWLEDGE_ANOMALY");
    expect(view.blueProgress.startedAt).not.toBeNull();
    expect(view.blueProgress.judgments["1-1"]).toMatchObject({ points: 2, wrongAttempts: 4, hintLevelUsed: 2 });
    expect(view.blueProgress.judgments["1-2"]).toMatchObject({ points: 2, wrongAttempts: 0, hintLevelUsed: 3 });
    expect(view.blueProgress.judgments["1-3"]).toMatchObject({ points: 1, wrongAttempts: 0, hintLevelUsed: 3 });
    expect(view.score.blueActions).toBe(5);
    // 正解後に実行例を見ても得点は変わらない
    await runtime.getBlueHint(access, "1-1", 2);
    expect((await runtime.getSession(access)).blueProgress.judgments["1-1"]).toMatchObject({ points: 2, hintLevelUsed: 2 });
    for (const id of ["2-2", "2-2", "2-2", "2-2"] as const) await runtime.checkBlueJudgment(access, id, ["sensor-fault"]);
    await runtime.checkBlueJudgment(access, "2-2", judgmentAnswers["2-2"]);
    expect((await runtime.getSession(access)).blueProgress.judgments["2-2"]).toMatchObject({ points: 2, wrongAttempts: 4 });
    expect(JUDGMENT_IDS).toHaveLength(16);
  });
  it("runs a Blue-only practice session that never counts toward the 100-point total", async () => {
    const practice = await runtime.start("water-01", "practice");
    const access = { sessionId: practice.sessionId, token: practice.token };
    expect(practice.session).toMatchObject({ exerciseMode: "practice", blueState: "anomaly_detected" });
    await expect(runtime.executeCommand(access, "S01", "help")).rejects.toMatchObject({ code: "PRACTICE_BLUE_ONLY" });
    await expect(runtime.submitReport(access, "red", report)).rejects.toMatchObject({ code: "PRACTICE_BLUE_ONLY" });
    await solveBlue(driver(access));
    const done = await runtime.submitReport(access, "blue", blueReport);
    expect(done).toMatchObject({ exerciseMode: "practice", complete: false, blueState: "recovered", score: { blueActions: 42, blueEvidence: 8, total: 0 } });
    expect((await runtime.reset(access)).session).toMatchObject({ exerciseMode: "practice", blueState: "anomaly_detected" });
  });
  it("migrates a saved step-based Blue progress to judgment records", async () => {
    const access = await started(); await solveRed(access);
    const db = new DatabaseSync(path);
    db.prepare("UPDATE sessions SET data = json_set(data, '$.blueState', 'safe_mode', '$.blue', json(?)) WHERE id = ?").run(JSON.stringify({ startedAt: new Date().toISOString(), steps: { ACKNOWLEDGE_ANOMALY: { mistakes: 0, hintLevel: 0 } } }), access.sessionId); db.close();
    const view = await runtime.getSession(access);
    expect(view.blueProgress.steps.ENTER_SIMULATED_SAFE_MODE).toMatchObject({ completed: true, points: 6 });
    expect(view.blueProgress.steps.VERIFY_STABLE).toMatchObject({ completed: false, solved: 0 });
    expect(view.score.blueActions).toBe(8 + 12 + 6);
    expect((await runtime.checkBlueJudgment(access, "4-1", "1.20")).result.ok).toBe(true);
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
