import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aquaScenario, type BlueState } from "../src/lib/scenarios/aqua";
import { BLUE_SCORING, chlorineScenario, createStepRules, stepScore, toTrendRows } from "../src/lib/scenarios/blue-steps";
import { INCIDENT, glossary } from "../src/lib/scenarios/incident";
import { readTelemetry } from "../src/lib/scenarios/telemetry.server";
import { BlueProcessDiagram } from "../src/components/blue-process-diagram";
import { blueAnswers } from "./blue-answers";

const trend = toTrendRows(readTelemetry());
const recovery = toTrendRows(readTelemetry(true));
const rules = createStepRules(chlorineScenario, { trend, recovery });
const rule = (code: string) => rules.find(r => r.code === code)!;
const messages = (code: string, answers: Record<string, unknown>) => rule(code).evaluate(answers).feedback.map(f => f.message).join("\n");

describe("Blue StepRule definitions", () => {
  it("keeps the existing five state IDs in order and aggregates transitions in StepRule", () => {
    expect(rules.map(r => [r.code, r.from, r.to])).toEqual(aquaScenario.blueActions.map(a => [a.code, a.from, a.to]));
    for (const r of rules) {
      expect(r.canAdvance(blueAnswers[r.code])).toBe(true);
      expect(r.canAdvance({})).toBe(false);
      expect(r.hints).toHaveLength(3);
      expect(r.hints.every(h => h.length > 10)).toBe(true);
    }
  });
  it("STEP 01: start 14:03 / confirmed 14:05; choosing the single spike at 14:01 is rejected with a hint", () => {
    const step = rule("ACKNOWLEDGE_ANOMALY");
    expect(step.canAdvance(blueAnswers.ACKNOWLEDGE_ANOMALY)).toBe(true);
    const spike = { ...blueAnswers.ACKNOWLEDGE_ANOMALY, start: "14:01" };
    expect(step.canAdvance(spike)).toBe(false);
    expect(messages("ACKNOWLEDGE_ANOMALY", spike)).toContain("連続していますか");
    expect(step.canAdvance({ ...blueAnswers.ACKNOWLEDGE_ANOMALY, confirmed: "14:04" })).toBe(false);
    expect(step.canAdvance({ ...blueAnswers.ACKNOWLEDGE_ANOMALY, reason: "短い" })).toBe(false);
  });
  it("STEP 02: identifies PLC-03 CL2_DOSE_SP and explains why other PLCs are normal variation", () => {
    const step = rule("ISOLATE_TRAINING_FEED");
    const other = { ...blueAnswers.ISOLATE_TRAINING_FEED, target: "PLC-02:PAC_DOSE_SP" };
    const result = step.evaluate(other);
    expect(result.ok).toBe(false);
    expect(result.inappropriate).toBe(true);
    expect(messages("ISOLATE_TRAINING_FEED", other)).toContain("ベースラインとの差が許容範囲内です");
    // 原因は根拠付きで選ぶ: 誤った候補・足りない候補・誤った引用・誤った判断はすべて遷移不可
    expect(messages("ISOLATE_TRAINING_FEED", { ...blueAnswers.ISOLATE_TRAINING_FEED, causes: ["sensor-fault", "unauthorized-change", "display-stale"] })).toContain("自己診断は正常");
    expect(step.canAdvance({ ...blueAnswers.ISOLATE_TRAINING_FEED, causes: ["unauthorized-change"] })).toBe(false);
    expect(step.canAdvance({ ...blueAnswers.ISOLATE_TRAINING_FEED, citeUser: "operator_day" })).toBe(false);
    expect(step.canAdvance({ ...blueAnswers.ISOLATE_TRAINING_FEED, citeTicket: "exists" })).toBe(false);
    for (const decision of ["watch", "stop-plc"]) {
      const r = step.evaluate({ ...blueAnswers.ISOLATE_TRAINING_FEED, decision });
      expect(r.ok).toBe(false); expect(r.inappropriate).toBe(true);
      expect(r.feedback.some(f => f.kind === "wrong" && f.message.length > 20)).toBe(true);
    }
  });
  it("STEP 03: inappropriate actions (stop / max / continue) are explained and block the transition", () => {
    const step = rule("ENTER_SIMULATED_SAFE_MODE");
    for (const bad of ["stop", "max", "continue"]) {
      const answers = { actions: [...(blueAnswers.ENTER_SIMULATED_SAFE_MODE.actions as string[]), bad] };
      const r = step.evaluate(answers);
      expect(r.ok).toBe(false); expect(r.inappropriate).toBe(true);
      expect(r.feedback.find(f => f.kind === "wrong")!.message).toMatch(/不適切です: .+/);
    }
    expect(step.canAdvance({ actions: ["man", "block-remote", "field-test"] })).toBe(false);
  });
  it("STEP 04: needs three consecutive normal samples (1 or 2 are not enough) and the field check", () => {
    const step = rule("VERIFY_STABLE");
    for (const confirmed of [[], ["14:10"], ["14:10", "14:11"]]) {
      const r = step.evaluate({ ...blueAnswers.VERIFY_STABLE, confirmed });
      expect(r.ok).toBe(false);
      expect(r.feedback.map(f => f.message).join()).toContain(`${INCIDENT.consecutiveRequired}回連続が必要`);
    }
    expect(step.canAdvance({ ...blueAnswers.VERIFY_STABLE, confirmed: ["14:11", "14:10", "14:12"] })).toBe(false);
    expect(step.canAdvance({ ...blueAnswers.VERIFY_STABLE, fieldCheck: "inconsistent" })).toBe(false);
    expect(step.canAdvance({ ...blueAnswers.VERIFY_STABLE, approved: false })).toBe(false);
    expect(step.canAdvance(blueAnswers.VERIFY_STABLE)).toBe(true);
  });
  it("keeps the 42-point action total and floors deductions at half of each step", () => {
    expect(rules.reduce((sum, r) => sum + r.points, 0)).toBe(BLUE_SCORING.actionsTotal);
    const s3 = rule("ENTER_SIMULATED_SAFE_MODE");
    expect(stepScore(s3, { mistakes: 0, hintLevel: 0 })).toBe(s3.points);
    expect(stepScore(s3, { mistakes: 0, hintLevel: 1 })).toBe(s3.points);
    expect(stepScore(s3, { mistakes: 1, hintLevel: 3 })).toBe(s3.points - 3);
    expect(stepScore(s3, { mistakes: 20, hintLevel: 3 })).toBe(s3.points - Math.floor(s3.points / 2));
    // STEP 01 は誤選択を減点しない
    expect(stepScore(rule("ACKNOWLEDGE_ANOMALY"), { mistakes: 5, hintLevel: 0 })).toBe(rule("ACKNOWLEDGE_ANOMALY").points);
  });
  it("defines the glossary terms of §1.2", () => {
    for (const term of ["中央監視室", "SCADA", "HMI", "PLC", "PV", "SP", "注入率", "残留塩素", "アラーム上下限", "インターロック", "フェイルセーフ", "手動/自動", "ベースライン", "変更管理票", "最小権限", "操作ログ", "独立モデル", "現場手分析"]) expect(glossary[term]).toBeTruthy();
  });
});

describe("process diagram", () => {
  const render = (state: BlueState) => renderToStaticMarkup(createElement(BlueProcessDiagram, { state, trend, recovery }));
  it("renders a different, non-color-only expression for every state", () => {
    const html = Object.fromEntries((["anomaly_detected", "investigating", "input_isolated", "safe_mode", "verified", "recovered"] as BlueState[]).map(s => [s, render(s)]));
    expect(html.investigating).toContain("cl2-blink");
    expect(html.investigating).toContain("要調査");
    expect(html.input_isolated).toContain("表示入力 隔離中");
    expect(html.safe_mode).toContain("MAN 固定注入");
    expect(html.safe_mode).toContain("現場確認");
    expect(html.verified).toContain("確認済み");
    expect(html.recovered).not.toMatch(/隔離中|MAN 固定注入|要調査/);
    expect(new Set(Object.values(html)).size).toBe(6);
  });
});
