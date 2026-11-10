// 防御パートの判断(JudgmentSpec)・STEP・採点・表示状態。画面とサーバーが同じ定義を使う。
// - 正解・配点・フィードバックは、この定義と incident.ts のデータに集約する。UI には直書きしない。
// - サーバーは判断の判定(validate)と状態遷移(canAdvance)を必ずここで評価する。UI から状態を直接書き換えることはない。
// - 得点は保存しない。保存するのは回答・誤答回数・ヒントの段階で、得点は表示のたびに judgmentPoints で計算する。
import { aquaScenario, type BlueActionCode, type BlueState } from "./aqua";
import {
  INCIDENT, accountChoices, causeCandidates, evidenceChoices, fieldCheckChoices, isolationTargets, modeChoices, monitoringChoices,
  plcTags, recoveryJudgeChoices, safeModeChoices, spikeReasonKeywords, type Choice, type TrendRow,
} from "./incident";

export type { BlueState } from "./aqua";
export const BLUE_STATES: readonly BlueState[] = ["anomaly_detected", "investigating", "input_isolated", "safe_mode", "verified", "recovered"];

export const JUDGMENT_IDS = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "2-4", "3-1", "4-1", "4-2", "4-3", "4-4", "4-5", "5-1", "5-2", "5-3"] as const;
export type JudgmentId = (typeof JUDGMENT_IDS)[number];
export const isJudgmentId = (v: unknown): v is JudgmentId => typeof v === "string" && (JUDGMENT_IDS as readonly string[]).includes(v);

export type HintLevel = 0 | 1 | 2 | 3;
export type JudgmentRecord = {
  id: JudgmentId;
  solved: boolean;
  wrongAttempts: number;
  hintLevelUsed: HintLevel;
  answer?: unknown; // 正解になった回答(選択・入力値)
  points: number; // 算出済みの得点(保存値ではなく judgmentPoints で計算する)
};
export type BlueMode = "normal" | "practice";
export type BlueProgress = {
  state: BlueState;
  judgments: Record<JudgmentId, JudgmentRecord>;
  recoveryObserved: number; // 4-4 で取得した復旧データの件数(0〜4)
  startedAt: string;
  mode: BlueMode;
};

export type FeedbackKind = "ok" | "wrong" | "missing" | "info";
/**
 * 判定の結果。counted=true のときだけ誤答として数える(未入力・10文字未満・順序の案内は数えない)。
 * feedback は一文、details は選択肢ごとの見直す観点、note は進行を止めない注意。
 */
export type JudgmentResult = { ok: boolean; kind: FeedbackKind; counted: boolean; feedback: string; details?: string[]; note?: string; answer?: unknown };

export type ChoiceOption = { id: string; label: string };
export type JudgmentInput =
  | { kind: "select" | "radio" | "multi"; options: readonly ChoiceOption[] }
  | { kind: "text"; minLength: number; maxLength: number; placeholder: string }
  | { kind: "number"; unit: string; placeholder: string }
  | { kind: "action" };

export type JudgmentSpec = {
  id: JudgmentId;
  step: 1 | 2 | 3 | 4 | 5;
  code: BlueActionCode;
  title: string;
  points: number;
  input: JudgmentInput;
  /** 判定ボタンの文言(「判定する」「隔離する」「上長承認(模擬)」など) */
  submitLabel: string;
  /** 「考え方 → 書き方 → 実行例」 */
  hints: readonly [string, string, string];
  validate: (answer: unknown, progress: BlueProgress) => JudgmentResult;
  /** 前提(順序)の保護。STEP が進行中であることも含む */
  canAnswer: (progress: BlueProgress) => boolean;
  /** canAnswer を満たさないときの案内 */
  blockedMessage: string;
  /** true: 前提を満たすまで入力自体を無効にする / false: 押せるが案内を出して実行しない */
  lockWhenBlocked: boolean;
};

export type StepSpec = {
  step: 1 | 2 | 3 | 4 | 5;
  code: BlueActionCode;
  from: BlueState;
  to: BlueState;
  title: string;
  actionLabel: string;
  judgments: readonly JudgmentId[];
  points: number;
  hints: readonly [string, string, string];
};

export type StepContext = { trend: readonly TrendRow[]; recovery: readonly TrendRow[] };
export type BlueScenario = { steps: readonly StepSpec[]; judgments: readonly JudgmentSpec[]; byId: Record<JudgmentId, JudgmentSpec>; ctx: StepContext };

// ---- 採点(§1.3) ----
export const BLUE_SCORING = {
  actionsTotal: 42,
  reportPoints: 8,
  mistakePenalty: 1, // 誤答1回あたりの減点
  floorRatio: 0.5, // 下限・実行例を見たときの上限(配点に対する割合、小数は切り上げ)
} as const;
export const pointsFloor = (max: number) => Math.ceil(max * BLUE_SCORING.floorRatio);
/** 判断の得点。未正解は0。誤答1回ごとに−1(下限は配点の50%切り上げ)。実行例まで見た判断は50%が上限 */
export function judgmentPoints(max: number, rec: Pick<JudgmentRecord, "solved" | "wrongAttempts" | "hintLevelUsed"> | undefined): number {
  if (!rec?.solved) return 0;
  const floor = pointsFloor(max);
  let points = Math.max(floor, max - rec.wrongAttempts * BLUE_SCORING.mistakePenalty);
  if (rec.hintLevelUsed >= 3) points = Math.min(points, floor);
  return points;
}

// ---- トレンドの分析 ----
export const toTrendRows = (samples: readonly { timestamp: string; model_cl_mgl: number; display_cl_mgl: number }[]): TrendRow[] =>
  samples.map(s => ({ time: s.timestamp.slice(11, 16), model: s.model_cl_mgl, display: s.display_cl_mgl }));
export const trendDiff = (r: TrendRow) => Math.round(Math.abs(r.display - r.model) * 1000) / 1000;

/** 差が閾値を超える状態が連続した最初の区間と、連続しない単発の超過を求める */
export function analyzeTrend(trend: readonly TrendRow[], threshold: number, need: number) {
  const over = trend.map(r => trendDiff(r) > threshold);
  let run: TrendRow[] | null = null;
  for (let i = 0; i + need <= trend.length && !run; i++) if (over.slice(i, i + need).every(Boolean)) run = trend.slice(i, i + need);
  const inRun = (i: number) => { let a = i, b = i; while (a > 0 && over[a - 1]) a--; while (b < over.length - 1 && over[b + 1]) b++; return b - a + 1 >= need; };
  const spikes = trend.filter((_, i) => over[i] && !inRun(i)).map(r => r.time);
  return { run, spikes, over };
}
/** 取得済みの記録の末尾で、閾値以内が何回続いているか */
export function trailingNormal(rows: readonly TrendRow[], threshold: number) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0 && trendDiff(rows[i]) <= threshold; i--) n++;
  return n;
}

// ---- 共通の小道具 ----
const fmt = (n: number) => n.toFixed(2);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : []);
const ok = (feedback: string, answer: unknown, note?: string): JudgmentResult => ({ ok: true, kind: "ok", counted: false, feedback, answer, ...(note ? { note } : {}) });
const wrong = (feedback: string, details?: string[]): JudgmentResult => ({ ok: false, kind: "wrong", counted: true, feedback, ...(details?.length ? { details } : {}) });
const missing = (feedback: string): JudgmentResult => ({ ok: false, kind: "missing", counted: false, feedback });
const info = (feedback: string): JudgmentResult => ({ ok: false, kind: "info", counted: false, feedback });
const options = (choices: readonly Choice[]): ChoiceOption[] => choices.map(c => ({ id: c.id, label: c.label }));

function judgeSingle(choices: readonly Choice[], raw: unknown, okMessage: string, emptyMessage = "選択してください。"): JudgmentResult {
  const choice = choices.find(c => c.id === str(raw));
  if (!choice) return missing(emptyMessage);
  return choice.correct ? ok(okMessage, choice.id) : wrong(choice.reason);
}
/** 複数選択: 正解をすべて選び、他を選ばないときだけ正解。誤答は答えではなく見直す観点を示す */
function judgeMulti(choices: readonly Choice[], raw: unknown, m: { ok: string; empty: string; wrongIntro: string; missing: string }): JudgmentResult {
  const picked = list(raw).filter(id => choices.some(c => c.id === id));
  if (!picked.length) return missing(m.empty);
  const wrongPicked = choices.filter(c => !c.correct && picked.includes(c.id));
  const lacking = choices.filter(c => c.correct && !picked.includes(c.id)).length;
  if (!wrongPicked.length && !lacking) return ok(m.ok, choices.filter(c => c.correct).map(c => c.id));
  return wrong(wrongPicked.length ? m.wrongIntro : m.missing, [
    ...wrongPicked.map(c => `「${c.label}」: ${c.reason}`),
    ...(wrongPicked.length && lacking ? [m.missing] : []),
  ]);
}

// ---- シナリオの組み立て ----
export function createBlueScenario(ctx: StepContext): BlueScenario {
  const I = INCIDENT;
  const need = I.consecutiveRequired;
  const thr = I.diffThreshold;
  const unit = I.unit;
  const anomaly = analyzeTrend(ctx.trend, thr, need);
  const times = ctx.trend.map(r => r.time);
  const start = anomaly.run?.[0].time ?? I.anomalyStart;
  const confirmed = anomaly.run?.[need - 1]?.time ?? I.anomalyConfirmed;
  const startIndex = times.indexOf(start);
  /** 開始から途切れずに続く超過の何回目か(1始まり)。区間外は 0 */
  const runPosition = (t: string) => {
    const i = times.indexOf(t);
    if (i < startIndex || startIndex < 0) return 0;
    for (let k = startIndex; k <= i; k++) if (!anomaly.over[k]) return 0;
    return i - startIndex + 1;
  };
  const describeOff = (t: string): string | null => {
    const i = times.indexOf(t);
    if (anomaly.spikes.includes(t)) {
      const next = ctx.trend[i + 1];
      return next ? `${t}の次の回(${next.time})は閾値以内に戻っていますか?` : `${t}の超過は、続いていますか?`;
    }
    if (!anomaly.over[i]) return `${t} の差は ${fmt(trendDiff(ctx.trend[i]))} ${unit} で、閾値 ${fmt(thr)} ${unit} 以内です。超えている回を探しましょう。`;
    return null;
  };
  const spike = anomaly.spikes[0];
  const spikeNext = spike ? ctx.trend[times.indexOf(spike) + 1]?.time : undefined;
  const changed = plcTags.find(t => t.plc === I.changedPlc && t.tag === I.changedTag);
  const fieldRow = ctx.recovery.find(r => r.time === I.fieldAnalysis.at) ?? ctx.recovery.at(-1);
  const recoveryTimes = (() => {
    for (let n = need; n <= ctx.recovery.length; n++) if (trailingNormal(ctx.recovery.slice(0, n), thr) >= need) return ctx.recovery.slice(n - need, n).map(r => r.time);
    return [];
  })();

  const steps: StepSpec[] = aquaScenario.blueActions.map((a, i) => ({
    step: (i + 1) as StepSpec["step"], code: a.code, from: a.from, to: a.to, actionLabel: a.label,
    title: ["異常を確認", "原因を絞り込み、表示用入力を隔離", "安全モードに移行", "正常性を確認", "模擬監視を復旧"][i],
    judgments: [["1-1", "1-2", "1-3"], ["2-1", "2-2", "2-3", "2-4"], ["3-1"], ["4-1", "4-2", "4-3", "4-4", "4-5"], ["5-1", "5-2", "5-3"]][i] as JudgmentId[],
    points: 0,
    hints: [
      [`差が閾値(${fmt(thr)} ${unit})を超える回が、途切れずに続いているか`, "開始と確定の時刻を選び、単発の回がなぜ除外できるかを一行で書く", `${start}から${need}回連続 → ${confirmed}で確定。${spike ?? "単発の回"}は次の回で戻っているため単発`],
      ["ベースラインとの差・変更管理票の有無・独立した推定値の動きの3点で絞り込む", "タグ表で外れた設定を選び、操作ログから根拠を拾い、疑わしい入力だけを切り離す", `${I.changedPlc} ${I.changedTag}、変更管理票なし、表示用データ入力を隔離`],
      ["水質を守りながら、安全側へ倒す(止めればよい、増やせばよい、ではない)", "運転の切り替え、書き込みの制限、現場での確認、報告の4つを揃える", "MAN運転・遠隔変更の禁止・現場手分析・運転責任者へ報告"],
      ["戻しただけでは確認にならない。独立した情報で正常を確かめる", "承認を経て設定を戻し、不要なアカウントを無効にし、3回連続の正常と手分析を確認する", `${fmt(I.baselineSp)} ${unit}、${I.extraAdminAccount} を無効化、${recoveryTimes[0] ?? ""}〜${recoveryTimes.at(-1) ?? ""}の${need}回連続、手分析と整合`],
      ["戻す順序(運転 → 入力)と、復旧後に続ける確認", "AUTOに戻し、隔離を解除し、続ける監視を選ぶ", "AUTO → 隔離解除 → 常時比較・ベースライン照合・変更管理票の照合"],
    ][i] as unknown as StepSpec["hints"],
  }));
  const stepOf = (code: BlueActionCode) => steps.find(s => s.code === code)!;
  const active = (code: BlueActionCode) => (p: BlueProgress) => p.state === stepOf(code).from;
  const solved = (p: BlueProgress, id: JudgmentId) => !!p.judgments[id]?.solved;
  const base = { blockedMessage: "", lockWhenBlocked: true, submitLabel: "判定する" };
  const S1 = "ACKNOWLEDGE_ANOMALY", S2 = "ISOLATE_TRAINING_FEED", S3 = "ENTER_SIMULATED_SAFE_MODE", S4 = "VERIFY_STABLE", S5 = "RESTORE_SIMULATED_MONITORING";
  const timeOptions = ctx.trend.map(r => ({ id: r.time, label: r.time }));

  const judgments: JudgmentSpec[] = [
    // ---- STEP 01 ----
    {
      ...base, id: "1-1", step: 1, code: S1, title: "連続超過の開始時刻", points: 3,
      input: { kind: "select", options: timeOptions }, canAnswer: active(S1),
      hints: [`差が閾値(${fmt(thr)} ${unit})を超える回が、途切れずに続いているかを見ます。`, "トレンド表の「差」の列で超過の回に印を付け、途切れずに続く区間の最初の時刻を選びます。", `${start}から${need}回連続で超過 → 開始は ${start}`],
      validate: a => {
        const t = str(a);
        if (!times.includes(t)) return missing("時刻を選んでください。");
        if (t === start) return ok(`${start} から、差が閾値を超える回が途切れずに続いています。`, t);
        return wrong(describeOff(t) ?? `${t}の前の回も、閾値を超えていませんか? 途切れずに続く区間の最初を探しましょう。`);
      },
    },
    {
      ...base, id: "1-2", step: 1, code: S1, title: "異常の確定時刻", points: 3,
      input: { kind: "select", options: timeOptions },
      canAnswer: p => active(S1)(p) && solved(p, "1-1"), blockedMessage: "先に 1-1(連続超過の開始時刻)を判定してください。開始が決まってから確定を考えます。",
      hints: [`異常は、超過が${need}回連続した時点で確定とみなします。`, `開始の時刻から数えて、${need}回目の超過の時刻を選びます。`, `${anomaly.run?.map(r => r.time).join("・") ?? ""} → ${confirmed}で確定`],
      validate: a => {
        const t = str(a);
        if (!times.includes(t)) return missing("時刻を選んでください。");
        if (t === confirmed) return ok(`${start} から数えて${need}回目の超過で、異常が確定します。表示値は下限アラーム(${fmt(I.lowAlarmLimit)} ${unit})を下回らないため、通常の警報では気付けません。`, t);
        const pos = runPosition(t);
        if (pos > 0 && pos < need) return wrong(`${need}回連続に達するのはどの回ですか?`);
        if (pos > need) return wrong(`${t} は連続の${pos}回目です。${need}回連続に達した時点で確定とします。`);
        return wrong(describeOff(t) ?? `${need}回連続に達するのはどの回ですか?`);
      },
    },
    {
      ...base, id: "1-3", step: 1, code: S1, title: "単発の超過を除外した理由", points: 2,
      input: { kind: "text", minLength: 10, maxLength: 200, placeholder: "例: 次の回で閾値以内に戻り、連続していないため" }, canAnswer: active(S1),
      hints: ["単発の超過は、次の回で閾値以内に戻っていれば揺らぎの可能性があります。", "どの回が単発か、次の回でどうなったかを一行で書きます(10文字以上)。", `${spike ?? "単発の回"}は次の回(${spikeNext ?? "次の回"})で閾値以内に戻っているため、連続していない単発として除外`],
      validate: a => {
        const text = str(a).trim();
        if (text.length < 10) return missing(`10文字以上で書いてください(現在 ${text.length} 文字)。10文字未満は判定しません。`);
        const note = spikeReasonKeywords.some(k => text.includes(k)) ? undefined : "連続性に触れると、根拠が伝わります。";
        return ok("除外した理由を記録しました。記述の妥当性は講師が確認します。", text.slice(0, 200), note);
      },
    },
    // ---- STEP 02 ----
    {
      ...base, id: "2-1", step: 2, code: S2, title: "ベースラインから外れた設定", points: 3,
      input: { kind: "select", options: plcTags.map(t => ({ id: `${t.plc}:${t.tag}`, label: `${t.plc} / ${t.tag}(${t.area})` })) }, canAnswer: active(S2),
      hints: ["ベースライン(承認済みの値)と、現在のSPを比べます。", "タグ表と設定差分で、SPがベースラインから外れ、変更管理票もない行を選びます。", `${I.changedPlc} / ${I.changedTag}(${fmt(I.baselineSp)}→${fmt(I.changedSp)}、変更管理票なし)`],
      validate: a => {
        const tag = plcTags.find(t => `${t.plc}:${t.tag}` === str(a));
        if (!tag) return missing("PLCとタグを選んでください。");
        if (tag === changed) return ok(`${tag.plc} の ${tag.tag} は、ベースライン ${fmt(I.baselineSp)} から ${fmt(I.changedSp)} ${unit} に変わり、変更管理票がありません。`, str(a));
        return wrong(`${tag.plc} の ${tag.tag}: ベースラインとの差は許容範囲で、変更管理票(${tag.changeTicket ?? "—"})もあります。`);
      },
    },
    {
      ...base, id: "2-2", step: 2, code: S2, title: "考えられる原因", points: 3,
      input: { kind: "multi", options: options(causeCandidates) }, canAnswer: active(S2),
      hints: ["ベースラインとの差・変更管理票の有無・独立した推定値の動きの3点で絞り込みます。原因は1つとは限りません。", "候補ごとに、それを裏付ける記録と、否定する記録があるかを確かめて選びます。", "承認外の設定変更 + 表示側のデータが信頼できない"],
      validate: a => judgeMulti(causeCandidates, a, {
        ok: "承認外の設定変更と、表示側のデータが信頼できないことの2つが、記録と整合します。",
        empty: "考えられる原因を選んでください(複数選択)。",
        wrongIntro: "選んだ原因のうち、記録と照らして見直したいものがあります。",
        missing: "記録と整合する原因が、まだ足りません。表示値と別系統の推定値も見比べましょう。",
      }),
    },
    {
      ...base, id: "2-3", step: 2, code: S2, title: "根拠(操作ログからの観察)", points: 3,
      input: { kind: "multi", options: options(evidenceChoices) }, canAnswer: active(S2),
      hints: ["原因を説明できる観察と、正常な変更の補足・無関係な記録を分けます。", "操作ログで、変更したタグ・時刻・変更者の出どころに関わる行を拾います。", `変更管理票なし・${I.changeTime}の直後から推定値が低下・${I.extraAdminAccount}は直前に作成されたアカウント`],
      validate: a => judgeMulti(evidenceChoices, a, {
        ok: "変更管理票がないこと、変更直後からの低下、変更者アカウントの出どころの3つが、原因を裏付けます。",
        empty: "根拠になる観察を選んでください(複数選択)。",
        wrongIntro: "選んだ観察のうち、原因の根拠として見直したいものがあります。",
        missing: "根拠になる観察が、まだ足りません(承認の記録・時刻の前後関係・アカウントの出どころ)。",
      }),
    },
    {
      ...base, id: "2-4", step: 2, code: S2, title: "隔離する対象", points: 3, submitLabel: "隔離する",
      input: { kind: "select", options: options(isolationTargets) }, canAnswer: active(S2),
      hints: ["水質・供給を止めずに、疑わしいものだけを切り離します。", "信頼できないのは制御か、表示のための入力かを考えて、対象を1つ選びます。", "表示用データ入力を隔離する"],
      validate: a => judgeSingle(isolationTargets, a, "表示用データ入力を隔離しました。制御と配水は続けたまま、疑わしい入力だけを切り離しています。", "隔離する対象を選んでください。"),
    },
    // ---- STEP 03 ----
    {
      ...base, id: "3-1", step: 3, code: S3, title: "安全モードでとる対応", points: 6,
      input: { kind: "multi", options: options(safeModeChoices) }, canAnswer: active(S3),
      hints: ["水質を守りながら、安全側へ倒します(止めればよい、増やせばよい、ではありません)。", "運転の切り替え、書き込みの制限、現場での確認、報告の4つの観点で選びます。", "MAN運転・遠隔変更の禁止・現場手分析・運転責任者へ報告"],
      validate: a => judgeMulti(safeModeChoices, a, {
        ok: "消毒を続けたまま手動運転(MAN)の固定注入に切り替え、遠隔からの変更を止め、現場で確かめ、責任者へ報告します(フェイルセーフ)。",
        empty: "安全モードでとる対応を選んでください(複数選択)。",
        wrongIntro: "選んだ項目のうち、見直したいものがあります。",
        missing: "安全側に倒すための対応が、まだ足りません。運転・書き込み・確認・報告の観点で見直しましょう。",
      }),
    },
    // ---- STEP 04 ----
    {
      ...base, id: "4-1", step: 4, code: S4, title: "設定値をベースラインへ戻す", points: 2, submitLabel: "上長承認(模擬)を得て確定",
      input: { kind: "number", unit, placeholder: "例: 0.00" }, canAnswer: active(S4),
      hints: ["戻す値は、承認済みの台帳(ベースライン)に従います。", `PLC一覧のベースライン列で ${I.changedTag} の値を確かめ、入力して上長承認(模擬)を得ます。`, `${fmt(I.baselineSp)} ${unit}`],
      validate: a => {
        const raw = typeof a === "number" ? String(a) : str(a).trim();
        if (!raw) return missing("戻す値を入力してください。");
        if (!/^\d+(\.\d+)?$/.test(raw)) return missing(`数値(${unit})で入力してください。`);
        const v = Number(raw);
        if (Math.abs(v - I.baselineSp) < 1e-9) return ok(`上長承認(模擬)を得て、${I.changedTag} をベースライン ${fmt(I.baselineSp)} ${unit} に戻しました。`, I.baselineSp);
        if (Math.abs(v - I.changedSp) < 1e-9) return wrong(`${fmt(v)} ${unit} は今回変更された値です。ベースラインの台帳で承認済みの値を確認しましょう。`);
        return wrong("ベースラインの台帳で承認済みの値を確認しましょう。");
      },
    },
    {
      ...base, id: "4-2", step: 4, code: S4, title: "無効化するアカウント", points: 2, submitLabel: "無効化する",
      input: { kind: "select", options: options(accountChoices) }, canAnswer: active(S4),
      hints: ["今回の変更を行ったアカウントを、不要なら無効にします(最小権限)。", `操作ログで ${I.changedTag} を変更した行の、ユーザー列を確かめます。`, `${I.extraAdminAccount} を無効化`],
      validate: a => judgeSingle(accountChoices, a, `${I.extraAdminAccount} を無効化しました。承認外の設定変更を行ったアカウントです。`, "無効化するアカウントを選んでください。"),
    },
    {
      ...base, id: "4-3", step: 4, code: S4, title: "表示用入力を復旧データへ切り替える", points: 2, submitLabel: "復旧データへ切替",
      input: { kind: "action" },
      canAnswer: p => active(S4)(p) && solved(p, "4-1") && solved(p, "4-2"), blockedMessage: "4-1(設定値を戻す)と 4-2(アカウントの無効化)の完了後に切り替えます。",
      hints: ["戻しただけでは確認になりません。独立した情報で正常を確かめる準備をします。", "設定を戻し、アカウントを無効にしてから、表示用入力を復旧データへ切り替えます。", "4-1・4-2の完了後に「復旧データへ切替」"],
      validate: () => ok("表示用入力を復旧データへ切り替えました。記録を1分ずつ取得して確かめます。", true),
    },
    {
      ...base, id: "4-4", step: 4, code: S4, title: "復旧データで正常を確認する", points: 2,
      input: { kind: "radio", options: options(recoveryJudgeChoices) },
      canAnswer: p => active(S4)(p) && solved(p, "4-3"), blockedMessage: "4-3(復旧データへの切替)の後に確認します。",
      hints: ["切替直後は値が揺れることがあります。1回ではなく、連続性で判断します。", `記録を1分ずつ取得し、差が閾値以内の回が末尾に${need}回続いたら判断します。`, `${recoveryTimes[0] ?? ""}〜${recoveryTimes.at(-1) ?? ""}の${need}回連続で閾値以内 → 正常と判断`],
      validate: (a, p) => {
        const choice = recoveryJudgeChoices.find(c => c.id === str(a));
        if (!choice) return missing("判断を選んでください。");
        const observed = ctx.recovery.slice(0, Math.max(0, Math.min(ctx.recovery.length, p.recoveryObserved)));
        if (!observed.length) return missing("まず「次の記録を取得」で復旧データを取得しましょう。");
        const run = trailingNormal(observed, thr);
        if (choice.id === "normal") {
          if (run >= need) return ok(`${observed.slice(-need).map(r => r.time).join("・")} の${need}回連続で、差が閾値(${fmt(thr)} ${unit})以内です。`, "normal");
          if (observed.length === 1) return wrong("切替直後の1回だけでは確認になりません。連続性を見ましょう。");
          return wrong(`閾値以内の記録は、末尾に${run}回続いています。あと${need - run}回必要です。`);
        }
        if (run >= need) return wrong("取得した記録の末尾で、閾値以内の回がいくつ続いているかを数えてみましょう。");
        return info(`そのとおり、まだ判断できません(末尾の連続 ${run}/${need} 回)。次の記録を取得しましょう。`);
      },
    },
    {
      ...base, id: "4-5", step: 4, code: S4, title: "現場手分析の結果との整合", points: 2,
      input: { kind: "radio", options: options(fieldCheckChoices) },
      canAnswer: p => active(S4)(p) && solved(p, "4-3"), blockedMessage: "4-3(復旧データへの切替)の後に比べます。",
      hints: ["表示系とは独立した現場の値と比べて確かめます。", "手分析値と、推定値・監視表示との差を計算し、閾値と比べます。", fieldRow ? `${fmt(I.fieldAnalysis.value)} と ${fmt(fieldRow.model)}(差 ${fmt(Math.abs(I.fieldAnalysis.value - fieldRow.model))})・${fmt(fieldRow.display)}(差 ${fmt(Math.abs(I.fieldAnalysis.value - fieldRow.display))}) → 整合している` : "整合している"],
      validate: a => judgeSingle(fieldCheckChoices, a, fieldRow ? `手分析 ${fmt(I.fieldAnalysis.value)} と推定 ${fmt(fieldRow.model)}・監視表示 ${fmt(fieldRow.display)} ${unit} の差は、いずれも閾値以内で整合しています。` : "整合しています。", "判断を選んでください。"),
    },
    // ---- STEP 05 ----
    {
      ...base, id: "5-1", step: 5, code: S5, title: "運転モードを戻す", points: 2, submitLabel: "実行",
      input: { kind: "radio", options: options(modeChoices) }, canAnswer: active(S5),
      hints: ["戻す順序は、運転 → 入力です。", "安全モードで手動にした運転方法を、元の運転方法に戻します。", "AUTO を選んで実行"],
      validate: a => judgeSingle(modeChoices, a, "注入を自動運転(AUTO)へ戻しました。", "運転モードを選んでください。"),
    },
    {
      ...base, id: "5-2", step: 5, code: S5, title: "表示用データ入力の隔離を解除する", points: 2, submitLabel: "隔離を解除する",
      input: { kind: "action" }, lockWhenBlocked: false,
      canAnswer: p => active(S5)(p) && solved(p, "5-1"), blockedMessage: "先に運転を自動に戻し、安定を確認してから隔離を解除します。",
      hints: ["運転が安定してから、切り離した入力を戻します。", "5-1(AUTOへ戻す)の完了を確かめてから、隔離を解除します。", "AUTO → 隔離解除"],
      validate: () => ok("表示用データ入力の隔離を解除しました。", true),
    },
    {
      ...base, id: "5-3", step: 5, code: S5, title: "復旧後も続ける監視", points: 2,
      input: { kind: "multi", options: options(monitoringChoices) }, canAnswer: active(S5),
      hints: ["復旧後も、再発に気付ける確認を続けます。", "今回の異常に気付けた手掛かり(独立した値・ベースライン・変更管理票)を、続ける監視として選びます。", "常時比較・ベースライン照合・変更管理票の照合"],
      validate: a => judgeMulti(monitoringChoices, a, {
        ok: "別系統との常時比較、ベースラインとの照合、変更管理票との照合を続けます。",
        empty: "続ける監視を選んでください(複数選択)。",
        wrongIntro: "選んだ項目のうち、見直したいものがあります。",
        missing: "続ける監視が、まだ足りません。今回の異常に気付けた手掛かりを思い出しましょう。",
      }),
    },
  ];
  for (const s of steps) s.points = s.judgments.reduce((sum, id) => sum + judgments.find(j => j.id === id)!.points, 0);
  const byId = Object.fromEntries(judgments.map(j => [j.id, j])) as Record<JudgmentId, JudgmentSpec>;
  return { steps, judgments, byId, ctx };
}

// ---- 進捗の補助 ----
export const stateIndex = (s: BlueState) => BLUE_STATES.indexOf(s);
export function emptyRecord(id: JudgmentId): JudgmentRecord {
  return { id, solved: false, wrongAttempts: 0, hintLevelUsed: 0, points: 0 };
}
export function emptyJudgments(): Record<JudgmentId, JudgmentRecord> {
  return Object.fromEntries(JUDGMENT_IDS.map(id => [id, emptyRecord(id)])) as Record<JudgmentId, JudgmentRecord>;
}
export function stepCompleted(step: StepSpec, state: BlueState) { return stateIndex(state) >= stateIndex(step.to); }
/** 遷移ガード: STEP が進行中で、その STEP の判断がすべて正解のときだけ true */
export function canAdvance(scenario: BlueScenario, progress: BlueProgress, code: BlueActionCode): boolean {
  const step = scenario.steps.find(s => s.code === code);
  return !!step && progress.state === step.from && step.judgments.every(id => progress.judgments[id]?.solved);
}
export const solvedIds = (judgments: Partial<Record<JudgmentId, Pick<JudgmentRecord, "solved">>>) => JUDGMENT_IDS.filter(id => judgments[id]?.solved);

// ---- 画面の表示状態(状態と正解済みの判断から導く) ----
export type BlueDisplay = {
  feed: "connected" | "isolated" | "recovery" | "restored";
  mode: "AUTO" | "MAN";
  remoteBlocked: boolean;
  sp: number;
  spRestored: boolean;
  accountDisabled: boolean;
  fieldCheck: boolean;
  investigating: boolean;
  verified: boolean;
  recoveryData: boolean;
};
export function deriveDisplay(state: BlueState, solved: readonly JudgmentId[] = []): BlueDisplay {
  const at = (s: BlueState) => stateIndex(state) >= stateIndex(s);
  const has = (id: JudgmentId) => solved.includes(id);
  const recovered = state === "recovered";
  const isolatedOnce = has("2-4") || at("input_isolated");
  const released = has("5-2") || recovered;
  const recoveryData = has("4-3") || at("verified");
  const safe = has("3-1") || at("safe_mode");
  const spRestored = has("4-1") || at("verified");
  return {
    feed: released ? "restored" : isolatedOnce ? (recoveryData ? "recovery" : "isolated") : "connected",
    mode: safe && !(has("5-1") || recovered) ? "MAN" : "AUTO",
    remoteBlocked: safe && !recovered,
    sp: spRestored ? INCIDENT.baselineSp : INCIDENT.changedSp,
    spRestored,
    accountDisabled: has("4-2") || at("verified"),
    fieldCheck: safe && !at("verified"),
    investigating: state === "investigating" && !isolatedOnce,
    verified: at("verified") && !recovered,
    recoveryData,
  };
}
