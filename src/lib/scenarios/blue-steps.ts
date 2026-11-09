// 防御パートの判断ルール(StepRule)・ヒント・採点。画面とサーバーが同じ定義を使う。
// サーバーは状態遷移の前に必ず canAdvance を評価する。UIから状態を直接書き換えることはない。
// シナリオのデータ(BlueScenarioData)を差し替えれば、状態遷移と判断UIを共通のまま別の題材にできる。
import type { BlueActionCode, BlueState } from "./aqua";
import {
  INCIDENT, causeCandidates, fieldCheckChoices, isolationDecisions, opLog, plcTags, restoreTasks, safeModeChoices,
  type CauseCandidate, type Choice, type OpLogRow, type TagRow, type TrendRow,
} from "./incident";

export type { BlueState } from "./aqua";
export type BlueAnswers = Record<string, unknown>;
export type Feedback = { kind: "ok" | "wrong" | "missing"; message: string };
export type Judgement = { ok: boolean; inappropriate: boolean; feedback: Feedback[] };
export type StepContext = { trend: readonly TrendRow[]; recovery: readonly TrendRow[] };

export type StepRule = {
  code: BlueActionCode;
  from: BlueState;
  to: BlueState;
  title: string;
  /** 受講者が行う判断の名前。カードの「2/3」表示に使う */
  decisions: readonly string[];
  /** この STEP の配点(防御パートの対応操作点の内訳) */
  points: number;
  /** 不適切な選択を減点対象にする STEP か */
  penalizeMistakes: boolean;
  /** 「考え方 → 書き方 → 実行例」 */
  hints: readonly [string, string, string];
  progress: (answers: BlueAnswers) => number;
  evaluate: (answers: BlueAnswers) => Judgement;
  // 遷移を許可する条件(判断UIの正誤を集約)
  canAdvance: (answers: BlueAnswers) => boolean;
};

export type BlueScenarioData = {
  incident: typeof INCIDENT;
  plcTags: readonly TagRow[];
  opLog: readonly OpLogRow[];
  causes: readonly CauseCandidate[];
  isolationDecisions: readonly Choice[];
  safeModeChoices: readonly Choice[];
  fieldCheckChoices: readonly Choice[];
  restoreTasks: readonly { id: string; label: string }[];
};
export const chlorineScenario: BlueScenarioData = { incident: INCIDENT, plcTags, opLog, causes: causeCandidates, isolationDecisions, safeModeChoices, fieldCheckChoices, restoreTasks };

// 採点の定数。防御パートの対応操作点の合計(42)は既存の配点を維持する。
export const BLUE_SCORING = {
  stepPoints: { ACKNOWLEDGE_ANOMALY: 9, ISOLATE_TRAINING_FEED: 9, ENTER_SIMULATED_SAFE_MODE: 9, VERIFY_STABLE: 9, RESTORE_SIMULATED_MONITORING: 6 } as Record<BlueActionCode, number>,
  actionsTotal: 42,
  reportPoints: 8,
  mistakePenalty: 1, // 不適切な選択1回あたり
  hintPenalty: [0, 0, 1, 2], // 使ったヒントの最深段階(0=なし,1=考え方,2=書き方,3=実行例)ごとの減点
} as const;

export const toTrendRows = (samples: readonly { timestamp: string; model_cl_mgl: number; display_cl_mgl: number }[]): TrendRow[] =>
  samples.map(s => ({ time: s.timestamp.slice(11, 16), model: s.model_cl_mgl, display: s.display_cl_mgl }));
export const trendDiff = (r: TrendRow) => Math.round(Math.abs(r.display - r.model) * 1000) / 1000;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const yes = (v: unknown) => v === true;
const fmt = (n: number) => n.toFixed(2);
function judge(feedback: Feedback[], inappropriate = false, success?: string): Judgement {
  const ok = feedback.length === 0;
  return { ok, inappropriate, feedback: ok && success ? [{ kind: "ok", message: success }] : feedback };
}

/** 差が閾値を超える状態が連続した最初の区間と、連続しない単発の超過を求める */
export function analyzeTrend(trend: readonly TrendRow[], threshold: number, need: number) {
  const over = trend.map(r => trendDiff(r) > threshold);
  let run: TrendRow[] | null = null;
  for (let i = 0; i + need <= trend.length && !run; i++) if (over.slice(i, i + need).every(Boolean)) run = trend.slice(i, i + need);
  const inRun = (i: number) => { let a = i, b = i; while (a > 0 && over[a - 1]) a--; while (b < over.length - 1 && over[b + 1]) b++; return b - a + 1 >= need; };
  const spikes = trend.filter((_, i) => over[i] && !inRun(i)).map(r => r.time);
  return { run, spikes, over };
}
export function expectedRecovery(recovery: readonly TrendRow[], threshold: number, need: number): string[] | null {
  const head = recovery.slice(0, need);
  return head.length === need && head.every(r => trendDiff(r) <= threshold) ? head.map(r => r.time) : null;
}

export function createStepRules(data: BlueScenarioData, ctx: StepContext): readonly StepRule[] {
  const I = data.incident;
  const need = I.consecutiveRequired;
  const thr = I.diffThreshold;
  const anomaly = analyzeTrend(ctx.trend, thr, need);
  const recoveryTimes = expectedRecovery(ctx.recovery, thr, need);
  const changed = data.plcTags.find(t => t.plc === I.changedPlc && t.tag === I.changedTag);
  const fieldRow = ctx.recovery.find(r => r.time === I.fieldAnalysis.at) ?? ctx.recovery.at(-1);

  const rule = (r: Omit<StepRule, "canAdvance" | "points">): StepRule => ({ ...r, points: BLUE_SCORING.stepPoints[r.code], canAdvance: a => r.evaluate(a).ok });

  return [
    rule({
      code: "ACKNOWLEDGE_ANOMALY", from: "anomaly_detected", to: "investigating", title: "異常を確認",
      decisions: ["連続超過の開始時刻", "異常の確定時刻", "単発を除外した理由"], penalizeMistakes: false,
      hints: [
        `差(監視表示−独立モデル推定)が ${fmt(thr)} ${I.unit} を超える回が、${need}回続いているかを見ます。1回だけの超過は揺らぎかもしれません。`,
        `トレンド表の「差」の列で閾値超過に印を付け、連続している区間の最初の時刻を「開始」、${need}回目の時刻を「確定」として選びます。`,
        anomaly.run ? `${anomaly.run[0].time} から${need}回連続(${anomaly.run.map(r => r.time).join("・")})。開始 ${anomaly.run[0].time}、確定 ${anomaly.run.at(-1)!.time}。${anomaly.spikes.join("・") || "単発"} は次の回で閾値以内に戻るので除外します。` : "",
      ],
      progress: a => [str(a.start), str(a.confirmed), str(a.reason).trim().length >= 10 ? "y" : ""].filter(Boolean).length,
      evaluate: a => {
        const f: Feedback[] = [];
        if (!anomaly.run) return judge([{ kind: "wrong", message: "教材データに連続超過がありません。" }]);
        const exp = { start: anomaly.run[0].time, confirmed: anomaly.run.at(-1)!.time };
        const start = str(a.start), confirmed = str(a.confirmed);
        const describe = (t: string) => {
          const i = ctx.trend.findIndex(r => r.time === t);
          if (i < 0) return "トレンド表にある時刻から選んでください。";
          if (anomaly.spikes.includes(t)) {
            const next = ctx.trend[i + 1];
            return `${t} の超過は連続していますか? ${next ? `次の ${next.time} は差 ${fmt(trendDiff(next))} ${I.unit} で閾値以内に戻っています。` : ""}単発の揺らぎは除外します。`;
          }
          if (!anomaly.over[i]) return `${t} の差は ${fmt(trendDiff(ctx.trend[i]))} ${I.unit} で、閾値 ${fmt(thr)} ${I.unit} 以内です。`;
          return null;
        };
        if (!start) f.push({ kind: "missing", message: "連続超過の開始時刻を選んでください。" });
        else if (start !== exp.start) f.push({ kind: "wrong", message: describe(start) ?? "開始は、連続した超過の1回目の時刻です。" });
        if (!confirmed) f.push({ kind: "missing", message: "異常の確定時刻を選んでください。" });
        else if (confirmed !== exp.confirmed) f.push({ kind: "wrong", message: describe(confirmed) ?? `確定は、連続超過が${need}回目に達した時刻です。` });
        if (str(a.reason).trim().length < 10) f.push({ kind: "missing", message: "単発の超過を除外した理由を10文字以上で書いてください。" });
        return judge(f, false, `正解: ${exp.start} から${need}回連続で差が ${fmt(thr)} ${I.unit} を超え、${exp.confirmed} に異常確定です。表示値は下限アラーム(${fmt(I.lowAlarmLimit)} ${I.unit})を下回らないため、通常の警報では気付けません。`);
      },
    }),
    rule({
      code: "ISOLATE_TRAINING_FEED", from: "investigating", to: "input_isolated", title: "原因を絞り込み、表示用入力を隔離",
      decisions: ["異常のあるPLCとタグ", "原因の候補", "操作ログからの根拠", "表示用入力の扱い"], penalizeMistakes: true,
      hints: [
        "センサーの故障か、設定の変更か。ベースラインと違う設定と、それを説明する記録(誰が・いつ・承認は)を探します。",
        "PLC一覧と設定差分で SP≠ベースライン の行を見つけ、操作ログで同じタグの行から「変更者・時刻・変更管理票」を引用します。原因は複数のことがあります。",
        `${I.changedPlc} の ${I.changedTag}(${fmt(I.baselineSp)}→${fmt(I.changedSp)})。変更者 ${I.extraAdminAccount}、${I.changeTime}、変更管理票なし。原因は「承認外の設定変更」と「表示側のデータ停滞」。表示用入力を隔離します。`,
      ],
      progress: a => [str(a.target), list(a.causes).length ? "y" : "", str(a.citeUser) && str(a.citeTime) && str(a.citeTicket) ? "y" : "", str(a.decision)].filter(Boolean).length,
      evaluate: a => {
        const f: Feedback[] = [];
        let inappropriate = false;
        const target = str(a.target);
        const tag = data.plcTags.find(t => `${t.plc}:${t.tag}` === target);
        if (!target) f.push({ kind: "missing", message: "異常のあるPLCとタグを選んでください。" });
        else if (!tag) f.push({ kind: "wrong", message: "PLC一覧にあるタグから選んでください。" });
        else if (tag !== changed) {
          inappropriate = true;
          const gap = tag.pv !== undefined && tag.sp !== undefined ? Math.abs(tag.pv - tag.sp) : 0;
          f.push({ kind: "wrong", message: `${tag.plc} の ${tag.tag} は、SP がベースライン(${tag.baseline} ${tag.unit})と一致し、PV との差 ${gap.toFixed(1)} ${tag.unit} は許容範囲(±${tag.tolerance} ${tag.unit})内の正常な変動です。変更管理票 ${tag.changeTicket ?? "—"} もあります。ベースラインとの差が許容範囲内です。` });
        }
        const causes = list(a.causes);
        const wrongCauses = data.causes.filter(c => !c.correct && causes.includes(c.id));
        const missingCauses = data.causes.filter(c => c.correct && !causes.includes(c.id));
        if (!causes.length) f.push({ kind: "missing", message: "原因の候補を、証拠を見て選んでください(複数選択)。" });
        for (const c of wrongCauses) { inappropriate = true; f.push({ kind: "wrong", message: `「${c.label}」: ${c.reason}` }); }
        if (causes.length && missingCauses.length) f.push({ kind: "missing", message: `証拠と整合する原因がまだ${missingCauses.length}つあります。表示値と PLC 側の PV も見比べてください。` });
        const row = data.opLog.find(r => r.tag === I.changedTag);
        if (!str(a.citeUser) || !str(a.citeTime) || !str(a.citeTicket)) f.push({ kind: "missing", message: "操作ログから「変更者」「時刻」「変更管理票の有無」を引用してください。" });
        else if (!row || str(a.citeUser) !== row.user || str(a.citeTime) !== row.at || str(a.citeTicket) !== (row.ticket ? "exists" : "none"))
          f.push({ kind: "wrong", message: `引用した操作ログの行が、${I.changedTag} を変更した行と一致しません。タグ列で同じ行を探してください。` });
        const decision = data.isolationDecisions.find(d => d.id === str(a.decision));
        if (!decision) f.push({ kind: "missing", message: "表示用データ入力をどう扱うか選んでください。" });
        else if (!decision.correct) { inappropriate = true; f.push({ kind: "wrong", message: `「${decision.label}」: ${decision.reason}` }); }
        return judge(f, inappropriate, `正解: ログ(${I.extraAdminAccount}・${I.changeTime}・変更管理票なし)、設定差分(${fmt(I.baselineSp)}→${fmt(I.changedSp)})、独立モデルの低下の3点がそろいました。表示用データ入力を隔離できます。`);
      },
    }),
    rule({
      code: "ENTER_SIMULATED_SAFE_MODE", from: "input_isolated", to: "safe_mode", title: "安全モードに移行",
      decisions: ["安全側に倒す対応の選択"], penalizeMistakes: true,
      hints: [
        "止めればよいのではありません。水質(消毒)を守りながら、安全側に倒す対応を考えます。",
        "運転方法(手動/自動)、これ以上の書き込みを防ぐ手段、表示に頼らない確認、判断の共有、の4つの観点で選びます。",
        "「手動運転(MAN)で固定注入」「遠隔からの設定変更を一時禁止」「現場で手分析」「運転責任者へ報告」の4つを選びます。",
      ],
      progress: a => (list(a.actions).length ? 1 : 0),
      evaluate: a => {
        const picked = list(a.actions);
        const f: Feedback[] = [];
        const wrong = data.safeModeChoices.filter(c => !c.correct && picked.includes(c.id));
        for (const c of wrong) f.push({ kind: "wrong", message: `「${c.label}」は不適切です: ${c.reason}` });
        const missing = data.safeModeChoices.filter(c => c.correct && !picked.includes(c.id));
        if (!picked.length) f.push({ kind: "missing", message: "対応を選んでください(複数選択)。" });
        else if (missing.length) f.push({ kind: "missing", message: `安全側に倒すために必要な対応が、まだ${missing.length}つ足りません。` });
        return judge(f, wrong.length > 0, "正解: 消毒を続けたまま手動運転(MAN)の固定注入に切り替え、書き込みを止め、表示に頼らず現場で確認し、責任者へ報告します(フェイルセーフ)。");
      },
    }),
    rule({
      code: "VERIFY_STABLE", from: "safe_mode", to: "verified", title: "正常性を確認",
      decisions: ["設定値をベースラインへ(承認つき)", `${I.extraAdminAccount} の無効化`, "表示用入力を復旧データへ", `${need}回連続の正常確認`, "現場手分析の確認"], penalizeMistakes: false,
      hints: [
        "復旧は「戻した」だけでは不十分です。表示とは独立した確認で、正常が続いていることを確かめます。",
        `承認を経て設定を戻し、不要アカウントを無効化し、復旧データに切り替えたあと、差が閾値以内のサンプルを${need}回続けて確認します。現場手分析の値とも比べます。`,
        `${fmt(I.baselineSp)} ${I.unit} へ戻す → ${I.extraAdminAccount} 無効化 → 復旧データへ切替 → ${recoveryTimes?.join("・") ?? ""} の${need}回を確認 → 手分析 ${fmt(I.fieldAnalysis.value)} は推定 ${fieldRow ? fmt(fieldRow.model) : "—"} と整合。`,
      ],
      progress: a => [yes(a.approved) && yes(a.spRestored), yes(a.accountDisabled), yes(a.feedSwitched), list(a.confirmed).length >= need, !!str(a.fieldCheck)].filter(Boolean).length,
      evaluate: a => {
        const f: Feedback[] = [];
        if (!yes(a.approved) || !yes(a.spRestored)) f.push({ kind: "missing", message: `上長承認(模擬)を経て、${I.changedTag} をベースライン ${fmt(I.baselineSp)} ${I.unit} に戻してください。` });
        if (!yes(a.accountDisabled)) f.push({ kind: "missing", message: `不要なアカウント ${I.extraAdminAccount} を無効化してください。` });
        if (!yes(a.feedSwitched)) f.push({ kind: "missing", message: "表示用入力を復旧データへ切り替えてください。" });
        const confirmed = list(a.confirmed);
        if (!recoveryTimes) f.push({ kind: "wrong", message: "正常性を確認できるサンプルがありません。" });
        else if (confirmed.some((t, i) => t !== recoveryTimes[i])) f.push({ kind: "wrong", message: "確認したサンプルが、連続した復旧サンプルと一致しません。" });
        else if (confirmed.length < need) f.push({ kind: "missing", message: `正常の確認は${need}回連続が必要です(現在 ${confirmed.length} 回)。あと${need - confirmed.length}回確認してください。` });
        const field = data.fieldCheckChoices.find(c => c.id === str(a.fieldCheck));
        if (!field) f.push({ kind: "missing", message: "現場手分析の結果を確認し、判断を選んでください。" });
        else if (!field.correct) f.push({ kind: "wrong", message: `${field.reason}(手分析 ${fmt(I.fieldAnalysis.value)} − 推定 ${fieldRow ? fmt(fieldRow.model) : "—"})` });
        return judge(f, false, `正解: 差が閾値以内のサンプルを${need}回連続で確認し、現場手分析とも整合しました。`);
      },
    }),
    rule({
      code: "RESTORE_SIMULATED_MONITORING", from: "verified", to: "recovered", title: "模擬監視を復旧",
      decisions: data.restoreTasks.map(t => t.label), penalizeMistakes: false,
      hints: [
        "安全モードで変えたものを、確認が済んだ順に元へ戻します。戻したあとも、すぐに目を離さないことが大切です。",
        "運転方法、表示用入力の隔離、復旧後の監視、の3つをそろえます。",
        "「AUTOへ戻す」「隔離を解除」「数分間の比較監視を続ける」の3つにチェックします。",
      ],
      progress: a => data.restoreTasks.filter(t => list(a.tasks).includes(t.id)).length,
      evaluate: a => {
        const done = list(a.tasks);
        const missing = data.restoreTasks.filter(t => !done.includes(t.id));
        return judge(missing.map(t => ({ kind: "missing" as const, message: `未実施: ${t.label}` })), false, "自動運転(AUTO)へ戻しました。復旧後も数分間、独立モデルとの比較監視を続けます。");
      },
    }),
  ];
}

export type BlueStepRecord = { mistakes: number; hintLevel: number };
/** STEP の得点。減点はヒントの段階と不適切な選択。下限は配点の半分 */
export function stepScore(rule: Pick<StepRule, "points" | "penalizeMistakes">, rec: BlueStepRecord | undefined) {
  const r = rec ?? { mistakes: 0, hintLevel: 0 };
  const hint = BLUE_SCORING.hintPenalty[Math.max(0, Math.min(3, r.hintLevel))];
  const mistakes = rule.penalizeMistakes ? r.mistakes * BLUE_SCORING.mistakePenalty : 0;
  const deduction = Math.min(Math.floor(rule.points / 2), hint + mistakes);
  return rule.points - deduction;
}
