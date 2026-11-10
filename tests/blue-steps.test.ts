import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aquaScenario, type BlueState } from "../src/lib/scenarios/aqua";
import {
  BLUE_SCORING, JUDGMENT_IDS, canAdvance, createBlueScenario, deriveDisplay, emptyJudgments, judgmentPoints, toTrendRows,
  type BlueProgress, type JudgmentId,
} from "../src/lib/scenarios/blue-steps";
import { glossary } from "../src/lib/scenarios/incident";
import { readTelemetry } from "../src/lib/scenarios/telemetry.server";
import { BlueProcessDiagram } from "../src/components/blue-process-diagram";
import { HmiOverview } from "../src/components/blue-hmi";
import { judgmentAnswers, stepJudgments } from "./blue-answers";

const trend = toTrendRows(readTelemetry());
const recovery = toTrendRows(readTelemetry(true));
const scenario = createBlueScenario({ trend, recovery });
const spec = (id: JudgmentId) => scenario.byId[id];
const stepState = (id: JudgmentId) => scenario.steps.find(s => s.code === spec(id).code)!.from;
function progress(state: BlueState, solved: JudgmentId[] = [], recoveryObserved = 0): BlueProgress {
  const judgments = emptyJudgments();
  for (const id of solved) judgments[id].solved = true;
  return { state, judgments, recoveryObserved, startedAt: "", mode: "normal" };
}
const v = (id: JudgmentId, answer: unknown, p = progress(stepState(id))) => spec(id).validate(answer, p);

describe("Blue scenario definition", () => {
  it("keeps the five states and transitions in order with 16 judgments and 42 points", () => {
    expect(scenario.steps.map(s => [s.code, s.from, s.to, s.actionLabel])).toEqual(aquaScenario.blueActions.map(a => [a.code, a.from, a.to, a.label]));
    expect(scenario.steps.map(s => s.actionLabel)).toEqual(["異常を確認する", "表示用入力を隔離する", "安全モードへ移行する", "正常性を確認する", "模擬監視を復旧する"]);
    expect(scenario.steps.map(s => s.judgments.length)).toEqual([3, 4, 1, 5, 3]);
    expect(scenario.steps.map(s => s.points)).toEqual([8, 12, 6, 10, 6]);
    expect(scenario.judgments.map(j => j.id)).toEqual([...JUDGMENT_IDS]);
    expect(scenario.judgments.map(j => j.points)).toEqual([3, 3, 2, 3, 3, 3, 3, 6, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(scenario.judgments.reduce((sum, j) => sum + j.points, 0)).toBe(BLUE_SCORING.actionsTotal);
    for (const s of scenario.steps) expect(s.judgments).toEqual(stepJudgments[s.code]);
    for (const j of scenario.judgments) {
      expect(j.hints).toHaveLength(3);
      expect(j.hints.every(h => h.length > 3)).toBe(true);
    }
  });
  it("accepts every model answer", () => {
    const all = progress("anomaly_detected", [...JUDGMENT_IDS], 4);
    for (const id of JUDGMENT_IDS) expect(spec(id).validate(judgmentAnswers[id], { ...all, state: stepState(id) }), id).toMatchObject({ ok: true, kind: "ok" });
  });
});

describe("STEP 01 異常を確認", () => {
  it("1-1: 14:03 is the start; other times get a viewpoint without the answer", () => {
    expect(v("1-1", "14:03").ok).toBe(true);
    const spike = v("1-1", "14:01");
    expect(spike).toMatchObject({ ok: false, counted: true });
    expect(spike.feedback).toBe("14:01の次の回(14:02)は閾値以内に戻っていますか?");
    expect(v("1-1", "14:02").feedback).toContain("閾値 0.20 mg/L 以内");
    expect(v("1-1", "14:04")).toMatchObject({ ok: false, counted: true });
    for (const t of ["14:00", "14:02", "14:04", "14:05", "14:06"]) expect(v("1-1", t).feedback).not.toContain("14:03");
    expect(v("1-1", "")).toMatchObject({ ok: false, counted: false, kind: "missing" });
  });
  it("1-2: 14:05 confirms (third exceedance); 14:03/14:04 ask which sample reaches three", () => {
    expect(v("1-2", "14:05").ok).toBe(true);
    for (const t of ["14:03", "14:04"]) expect(v("1-2", t).feedback).toBe("3回連続に達するのはどの回ですか?");
    expect(v("1-2", "14:06")).toMatchObject({ ok: false, counted: true });
    expect(v("1-2", "14:01").feedback).toContain("14:02");
  });
  it("1-2 cannot be answered until 1-1 is solved", () => {
    expect(spec("1-2").canAnswer(progress("anomaly_detected"))).toBe(false);
    expect(spec("1-2").lockWhenBlocked).toBe(true);
    expect(spec("1-2").canAnswer(progress("anomaly_detected", ["1-1"]))).toBe(true);
    expect(spec("1-1").canAnswer(progress("investigating"))).toBe(false);
  });
  it("1-3: under 10 characters is not judged; missing keywords only add a note", () => {
    expect(v("1-3", "短い理由")).toMatchObject({ ok: false, counted: false, kind: "missing" });
    const noKeyword = v("1-3", "揺らぎだと思われるので除外しました");
    expect(noKeyword).toMatchObject({ ok: true, note: "連続性に触れると、根拠が伝わります。" });
    expect(v("1-3", judgmentAnswers["1-3"]).note).toBeUndefined();
  });
});

describe("STEP 02 原因を絞り込み、表示用入力を隔離", () => {
  it("2-1: PLC-03 / CL2_DOSE_SP; others explain the tolerance and ticket", () => {
    expect(v("2-1", "PLC-03:CL2_DOSE_SP").ok).toBe(true);
    for (const other of ["PLC-01:WELL_LEVEL_SP", "PLC-02:PAC_DOSE_SP", "PLC-04:CLEARWELL_LEVEL_SP"]) {
      const r = v("2-1", other);
      expect(r).toMatchObject({ ok: false, counted: true });
      expect(r.feedback).toContain("ベースラインとの差は許容範囲で、変更管理票");
    }
  });
  it("2-2: exactly the two causes; sensor and delay get their viewpoints", () => {
    expect(v("2-2", ["display-untrusted", "unauthorized-change"]).ok).toBe(true);
    expect(v("2-2", ["unauthorized-change", "display-untrusted", "sensor-fault"]).details!.join()).toContain("別系統の推定値(流量・ポンプ回転数から算出)も低下していることと、整合しますか?");
    expect(v("2-2", ["unauthorized-change", "display-untrusted", "comm-delay"]).details!.join()).toContain("時刻のずれやタイムアウトの記録はありますか?");
    expect(v("2-2", ["unauthorized-change"])).toMatchObject({ ok: false, counted: true });
    expect(v("2-2", [])).toMatchObject({ ok: false, counted: false });
  });
  it("2-3: the three observations, not the supporting/unrelated facts", () => {
    expect(v("2-3", judgmentAnswers["2-3"]).ok).toBe(true);
    const supplement = v("2-3", [...(judgmentAnswers["2-3"] as string[]), "others-ticketed"]);
    expect(supplement.ok).toBe(false);
    expect(supplement.details!.join()).toContain("正常な変更との違いを示す補足");
    for (const unrelated of ["alarm-ack", "sys-auto"]) expect(v("2-3", [...(judgmentAnswers["2-3"] as string[]), unrelated]).ok).toBe(false);
    expect(v("2-3", ["no-ticket", "drop-after-change"]).ok).toBe(false);
  });
  it("2-4: only the display feed; stopping control or supply is explained", () => {
    expect(v("2-4", "display-feed").ok).toBe(true);
    for (const t of ["plc-03", "supply-pump"]) expect(v("2-4", t).feedback).toBe("制御や配水を止めると水質・供給に影響します。まず疑わしい入力だけを切り離しましょう。");
    expect(v("2-4", "scada-all")).toMatchObject({ ok: false, counted: true });
  });
});

describe("STEP 03 安全モード", () => {
  it("3-1: all four appropriate actions and none of the inappropriate ones", () => {
    expect(v("3-1", ["report", "field-test", "block-remote", "man"]).ok).toBe(true);
    const reasons: Record<string, string> = { stop: "消毒が不足する恐れがあります", max: "過剰注入になり", continue: "安全側への移行が必要です" };
    for (const [bad, text] of Object.entries(reasons)) {
      const r = v("3-1", [...(judgmentAnswers["3-1"] as string[]), bad]);
      expect(r).toMatchObject({ ok: false, counted: true, feedback: "選んだ項目のうち、見直したいものがあります。" });
      expect(r.details!.join()).toContain(text);
    }
    expect(v("3-1", ["man", "block-remote", "field-test"])).toMatchObject({ ok: false, counted: true });
  });
});

describe("STEP 04 正常性を確認", () => {
  it("4-1: 1.20 (or 1.2) after approval; the changed value is pointed back to the ledger", () => {
    for (const a of ["1.20", "1.2", 1.2]) expect(v("4-1", a).ok).toBe(true);
    expect(v("4-1", "0.40").feedback).toContain("ベースラインの台帳で承認済みの値を確認しましょう");
    expect(v("4-1", "0.8")).toMatchObject({ ok: false, counted: true });
    expect(v("4-1", "abc")).toMatchObject({ ok: false, counted: false });
  });
  it("4-2: maint_tmp; operator_trn gets the specific explanation", () => {
    expect(v("4-2", "maint_tmp").ok).toBe(true);
    expect(v("4-2", "operator_trn").feedback).toContain("今回の設定変更を行ったのは別のアカウントです");
    expect(v("4-2", "operator_day")).toMatchObject({ ok: false, counted: true });
  });
  it("4-3: only after 4-1 and 4-2", () => {
    expect(spec("4-3").canAnswer(progress("safe_mode"))).toBe(false);
    expect(spec("4-3").canAnswer(progress("safe_mode", ["4-1"]))).toBe(false);
    expect(spec("4-3").canAnswer(progress("safe_mode", ["4-1", "4-2"]))).toBe(true);
  });
  it("4-4: normal only with three consecutive in-threshold records at the tail (14:11〜14:13)", () => {
    const p = (n: number) => progress("safe_mode", ["4-1", "4-2", "4-3"], n);
    expect(spec("4-4").canAnswer(progress("safe_mode", ["4-1", "4-2"]))).toBe(false);
    expect(v("4-4", "normal", p(0))).toMatchObject({ ok: false, counted: false });
    expect(v("4-4", "normal", p(1))).toMatchObject({ ok: false, counted: true, feedback: "切替直後の1回だけでは確認になりません。連続性を見ましょう。" });
    expect(v("4-4", "normal", p(2)).feedback).toContain("あと2回");
    expect(v("4-4", "normal", p(3)).feedback).toContain("あと1回必要");
    const ok = v("4-4", "normal", p(4));
    expect(ok.ok).toBe(true);
    expect(ok.feedback).toContain("14:11・14:12・14:13");
    expect(v("4-4", "not-yet", p(2))).toMatchObject({ ok: false, counted: false, kind: "info" });
    expect(v("4-4", "not-yet", p(4))).toMatchObject({ ok: false, counted: true });
  });
  it("4-5: consistent with the field analysis (0.59 vs 0.60 / 0.62)", () => {
    const r = v("4-5", "consistent");
    expect(r.ok).toBe(true);
    expect(r.feedback).toContain("0.59");
    expect(v("4-5", "inconsistent").feedback).toContain("閾値 0.20 mg/L 以内か");
  });
});

describe("STEP 05 模擬監視を復旧", () => {
  it("5-1: AUTO; MAN is reconsidered", () => {
    expect(v("5-1", "AUTO").ok).toBe(true);
    expect(v("5-1", "MAN")).toMatchObject({ ok: false, counted: true });
  });
  it("5-2: releasing the isolation before AUTO is stopped with guidance (clickable, not locked)", () => {
    expect(spec("5-2").lockWhenBlocked).toBe(false);
    expect(spec("5-2").canAnswer(progress("verified"))).toBe(false);
    expect(spec("5-2").blockedMessage).toBe("先に運転を自動に戻し、安定を確認してから隔離を解除します。");
    expect(spec("5-2").canAnswer(progress("verified", ["5-1"]))).toBe(true);
  });
  it("5-3: the three monitoring items only", () => {
    expect(v("5-3", ["ticket", "baseline", "compare"]).ok).toBe(true);
    expect(v("5-3", [...(judgmentAnswers["5-3"] as string[]), "stop-watch"]).details!.join()).toContain("再発の確認のため");
    expect(v("5-3", [...(judgmentAnswers["5-3"] as string[]), "lower-alarm"]).details!.join()).toContain("異常に気付けなくなります");
  });
});

describe("transition guard and scoring", () => {
  it("canAdvance requires the current state and every judgment of the step", () => {
    expect(canAdvance(scenario, progress("anomaly_detected", ["1-1", "1-2"]), "ACKNOWLEDGE_ANOMALY")).toBe(false);
    expect(canAdvance(scenario, progress("anomaly_detected", ["1-1", "1-2", "1-3"]), "ACKNOWLEDGE_ANOMALY")).toBe(true);
    expect(canAdvance(scenario, progress("investigating", ["1-1", "1-2", "1-3"]), "ACKNOWLEDGE_ANOMALY")).toBe(false);
    expect(canAdvance(scenario, progress("anomaly_detected", [...JUDGMENT_IDS]), "ISOLATE_TRAINING_FEED")).toBe(false);
  });
  it("deducts 1 per wrong attempt down to ceil(50%), caps at 50% after the example hint", () => {
    const r = (wrongAttempts: number, hintLevelUsed: 0 | 1 | 2 | 3 = 0, solved = true) => ({ solved, wrongAttempts, hintLevelUsed });
    expect(judgmentPoints(3, r(0))).toBe(3);
    expect(judgmentPoints(3, r(1))).toBe(2);
    expect(judgmentPoints(3, r(5))).toBe(2);
    expect(judgmentPoints(3, r(0, 2))).toBe(3);
    expect(judgmentPoints(3, r(0, 3))).toBe(2);
    expect(judgmentPoints(6, r(2))).toBe(4);
    expect(judgmentPoints(6, r(0, 3))).toBe(3);
    expect(judgmentPoints(6, r(9))).toBe(3);
    expect(judgmentPoints(2, r(1))).toBe(1);
    expect(judgmentPoints(2, r(0, 3))).toBe(1);
    expect(judgmentPoints(3, r(0, 0, false))).toBe(0);
  });
});

describe("display state", () => {
  it("reflects solved judgments before the state transition", () => {
    expect(deriveDisplay("investigating").feed).toBe("connected");
    expect(deriveDisplay("investigating", ["2-4"])).toMatchObject({ feed: "isolated", investigating: false });
    expect(deriveDisplay("input_isolated", ["3-1"])).toMatchObject({ mode: "MAN", remoteBlocked: true, fieldCheck: true });
    expect(deriveDisplay("safe_mode", ["4-1", "4-2", "4-3"])).toMatchObject({ sp: 1.2, accountDisabled: true, feed: "recovery" });
    expect(deriveDisplay("verified", ["5-1"])).toMatchObject({ mode: "AUTO", feed: "recovery" });
    expect(deriveDisplay("verified", ["5-1", "5-2"])).toMatchObject({ feed: "restored" });
    expect(deriveDisplay("recovered")).toMatchObject({ mode: "AUTO", feed: "restored", remoteBlocked: false });
  });
  it("renders a different, non-color-only diagram for every state", () => {
    const render = (state: BlueState, solved: JudgmentId[] = []) => renderToStaticMarkup(createElement(BlueProcessDiagram, { state, trend, recovery, solved }));
    const html = Object.fromEntries((["anomaly_detected", "investigating", "input_isolated", "safe_mode", "verified", "recovered"] as BlueState[]).map(s => [s, render(s)]));
    expect(html.investigating).toContain("cl2-blink");
    expect(html.investigating).toContain("要調査");
    expect(html.input_isolated).toContain("表示入力 隔離済み");
    expect(html.safe_mode).toContain("MAN 固定注入");
    expect(html.safe_mode).toContain("現場確認");
    expect(html.verified).toContain("確認済み");
    expect(html.recovered).not.toMatch(/隔離済み|MAN 固定注入|要調査/);
    expect(new Set(Object.values(html)).size).toBe(6);
    // 2-4 の正解で、遷移ボタンを押す前に配線が切れる表現になる
    expect(render("investigating", ["2-1", "2-2", "2-3", "2-4"])).toContain("表示入力 隔離済み");
    // 3-1 の正解で MAN バッジと現場確認アイコン
    expect(render("input_isolated", ["3-1"])).toMatch(/MAN 固定注入[\s\S]*現場確認/);
  });
  it("updates the central HMI panel from judgments", () => {
    const hmi = (state: BlueState, solved: JudgmentId[] = []) => renderToStaticMarkup(createElement(HmiOverview, { blueState: state, solved }));
    expect(hmi("investigating")).toContain("接続(要確認)");
    expect(hmi("investigating", ["2-4"])).toContain("隔離済み");
    const safe = hmi("input_isolated", ["3-1"]);
    expect(safe).toContain("注入ポンプ: MAN");
    expect(safe).toMatch(/遠隔からの設定変更<\/dt><dd[^>]*>禁止/);
    expect(hmi("safe_mode", ["4-1"])).toContain("1.20 mg/L");
  });
  it("defines the glossary terms", () => {
    for (const term of ["中央監視室", "SCADA", "HMI", "PLC", "PV", "SP", "注入率", "残留塩素", "アラーム上下限", "インターロック", "フェイルセーフ", "手動/自動", "ベースライン", "変更管理票", "最小権限", "操作ログ", "独立モデル", "現場手分析"]) expect(glossary[term]).toBeTruthy();
  });
});
