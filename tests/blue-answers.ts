// 防御パートの模範回答(テスト用)。STEP ごとの answers 形式は src/lib/scenarios/blue-steps.ts の StepRule に対応する。
import type { BlueActionCode } from "../src/lib/scenarios/aqua";

export const blueAnswers: Record<BlueActionCode, Record<string, unknown>> = {
  ACKNOWLEDGE_ANOMALY: { start: "14:03", confirmed: "14:05", reason: "14:01は次の回で閾値以内に戻り、連続していないため除外した。" },
  ISOLATE_TRAINING_FEED: { target: "PLC-03:CL2_DOSE_SP", causes: ["unauthorized-change", "display-stale"], citeUser: "maint_tmp", citeTime: "14:02:40", citeTicket: "none", decision: "isolate" },
  ENTER_SIMULATED_SAFE_MODE: { actions: ["man", "block-remote", "field-test", "report"] },
  VERIFY_STABLE: { approved: true, spRestored: true, accountDisabled: true, feedSwitched: true, confirmed: ["14:10", "14:11", "14:12"], fieldCheck: "consistent" },
  RESTORE_SIMULATED_MONITORING: { tasks: ["auto", "release", "watch"] },
};
export const blueOrder = Object.keys(blueAnswers) as BlueActionCode[];
export const blueReport = {
  observations: "14:03から3回連続で差が0.20 mg/Lを超え14:05に確定した。14:01は単発のため除外した。",
  impact: "PLC-03の塩素注入と浄水池出口の残留塩素。推定最小値0.30 mg/Lで、基準相当0.10 mg/Lは下回っていない。",
  evidence: "操作ログ・設定差分・独立モデルの3点が整合したため、表示用入力を隔離し手動運転の安全モードへ移した。",
  timeline: "復旧サンプル3回連続で差が閾値以内、現場手分析0.58 mg/Lも独立モデルと整合した。",
  improvements: "設定変更の二人承認と変更管理票、不要アカウント削除、遠隔書き込み制限、ゾーニング、独立監視の常時比較。",
};
