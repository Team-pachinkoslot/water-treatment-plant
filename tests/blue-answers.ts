// 防御パートの模範回答(テスト用)。判断ID ごとの回答形式は src/lib/scenarios/blue-steps.ts の JudgmentSpec に対応する。
import type { BlueActionCode } from "../src/lib/scenarios/aqua";
import type { JudgmentId } from "../src/lib/scenarios/blue-steps";

export const judgmentAnswers: Record<JudgmentId, unknown> = {
  "1-1": "14:03",
  "1-2": "14:05",
  "1-3": "14:01は次の回で閾値以内に戻り、連続していないため単発として除外した。",
  "2-1": "PLC-03:CL2_DOSE_SP",
  "2-2": ["unauthorized-change", "display-untrusted"],
  "2-3": ["no-ticket", "drop-after-change", "created-account"],
  "2-4": "display-feed",
  "3-1": ["man", "block-remote", "field-test", "report"],
  "4-1": "1.20",
  "4-2": "maint_tmp",
  "4-3": true,
  "4-4": "normal",
  "4-5": "consistent",
  "5-1": "AUTO",
  "5-2": true,
  "5-3": ["compare", "baseline", "ticket"],
};
export const blueOrder: BlueActionCode[] = ["ACKNOWLEDGE_ANOMALY", "ISOLATE_TRAINING_FEED", "ENTER_SIMULATED_SAFE_MODE", "VERIFY_STABLE", "RESTORE_SIMULATED_MONITORING"];
export const stepJudgments: Record<BlueActionCode, JudgmentId[]> = {
  ACKNOWLEDGE_ANOMALY: ["1-1", "1-2", "1-3"],
  ISOLATE_TRAINING_FEED: ["2-1", "2-2", "2-3", "2-4"],
  ENTER_SIMULATED_SAFE_MODE: ["3-1"],
  VERIFY_STABLE: ["4-1", "4-2", "4-3", "4-4", "4-5"],
  RESTORE_SIMULATED_MONITORING: ["5-1", "5-2", "5-3"],
};
/** 復旧データの件数(14:10〜14:13)。4-4 はすべて取得してから「正常」と判断できる */
export const RECOVERY_RECORDS = 4;

/** ランタイム・HTTP のどちらでも使える通しの解答手順 */
export type BlueDriver = {
  check(id: JudgmentId, answer: unknown): Promise<{ ok: boolean }>;
  observe(): Promise<unknown>;
  act(code: BlueActionCode): Promise<unknown>;
};
export async function solveBlueStep(d: BlueDriver, code: BlueActionCode) {
  for (const id of stepJudgments[code]) {
    if (id === "4-4") for (let i = 0; i < RECOVERY_RECORDS; i++) await d.observe();
    const r = await d.check(id, judgmentAnswers[id]);
    if (!r.ok) throw new Error(`judgment ${id} was not accepted`);
  }
  await d.act(code);
}
export async function solveBlue(d: BlueDriver) { for (const code of blueOrder) await solveBlueStep(d, code); }

export const blueReport = {
  observations: "14:03から3回連続で差が0.20 mg/Lを超え14:05に確定した。14:01は単発のため除外した。",
  impact: "PLC-03の塩素注入と浄水池出口の残留塩素。推定最小値0.30 mg/Lで、基準相当0.10 mg/Lは下回っていない。",
  evidence: "変更管理票のない変更と独立した推定値の低下から、表示用入力を隔離しMAN運転の安全モードへ移した。",
  timeline: "14:11〜14:13の3回連続で差が閾値以内、現場手分析0.59 mg/Lも推定値と整合した。",
  improvements: "設定変更の二人承認と変更管理票、不要アカウント削除、遠隔書き込み制限、ネットワーク分離、常時比較。",
};
