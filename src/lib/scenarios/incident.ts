// 防御パート(塩素消毒設備)の共通シナリオ定数。画面・ヒント・採点・図解がすべてここを参照する。
// 数値はすべて訓練用の架空値であり、実在の水道事業の運用基準ではない。
export const INCIDENT = {
  extraAdminAccount: "maint_tmp",
  changeTime: "14:02:40",
  changedPlc: "PLC-03",
  changedTag: "CL2_DOSE_SP",
  baselineSp: 1.2,
  changedSp: 0.4,
  unit: "mg/L",
  diffThreshold: 0.2, // 監視表示値と独立モデル推定値の許容差(mg/L)
  consecutiveRequired: 3, // 連続超過で異常確定とみなすサンプル数
  lowAlarmLimit: 0.4, // 残留塩素の下限アラーム(mg/L)。監視表示値に対して設定
  anomalyStart: "14:03",
  anomalyConfirmed: "14:05",
  minEstimatedResidual: 0.3, // 異常中の出口残留塩素の推定最小値(mg/L)
  referenceResidual: 0.1, // 水質基準相当(給水栓の遊離残留塩素)として参照する値(mg/L)
  fieldAnalysis: { at: "14:12", value: 0.58 }, // 現場手分析の模擬結果(mg/L)
  pumpRpm: { baseline: 1440, changed: 480 }, // 注入ポンプ回転数(min⁻¹)の模擬値
} as const;

export type PlcId = "PLC-01" | "PLC-02" | "PLC-03" | "PLC-04";
export type TagRow = {
  plc: PlcId;
  area: string;
  tag: string;
  pv?: number;
  sp?: number;
  baseline?: number;
  unit: string;
  tolerance: number; // PVとSPの許容差(この範囲内は正常変動)
  lastChangedBy: string;
  lastChangedAt: string;
  changeTicket: string | null; // null は変更管理票なし
  alarm: "none" | "low" | "high";
};
export type TrendRow = { time: string; model: number; display: number };

// PLC一覧(STEP 02)。PLC-03 だけがベースラインから外れ、変更管理票がない。他は軽微な正常変動のみ。
export const plcTags: readonly TagRow[] = [
  { plc: "PLC-01", area: "着水井", tag: "WELL_LEVEL_SP", pv: 2.4, sp: 2.5, baseline: 2.5, unit: "m", tolerance: 0.2, lastChangedBy: "operator_day", lastChangedAt: "09:12:30", changeTicket: "CM-2026-0188", alarm: "none" },
  { plc: "PLC-02", area: "PAC注入", tag: "PAC_DOSE_SP", pv: 9.8, sp: 10.0, baseline: 10.0, unit: "mg/L", tolerance: 0.5, lastChangedBy: "operator_day", lastChangedAt: "13:05:11", changeTicket: "CM-2026-0191", alarm: "none" },
  { plc: "PLC-03", area: "塩素注入", tag: INCIDENT.changedTag, pv: 0.4, sp: INCIDENT.changedSp, baseline: INCIDENT.baselineSp, unit: INCIDENT.unit, tolerance: 0.05, lastChangedBy: INCIDENT.extraAdminAccount, lastChangedAt: INCIDENT.changeTime, changeTicket: null, alarm: "none" },
  { plc: "PLC-04", area: "配水池", tag: "CLEARWELL_LEVEL_SP", pv: 3.1, sp: 3.1, baseline: 3.1, unit: "m", tolerance: 0.2, lastChangedBy: "sys_auto", lastChangedAt: "06:00:00", changeTicket: "CM-2026-0190", alarm: "none" },
];

// 操作ログ(STEP 02)。正常な変更(変更管理票あり)に、承認外の変更を混ぜてある。日付はすべて2026-11-02。
export type OpLogRow = { at: string; user: string; plc: PlcId | "—"; tag: string; from: string; to: string; ticket: string | null };
export const opLog: readonly OpLogRow[] = [
  { at: "06:00:00", user: "sys_auto", plc: "PLC-04", tag: "CLEARWELL_LEVEL_SP", from: "3.0", to: "3.1", ticket: "CM-2026-0190" },
  { at: "09:12:30", user: "operator_day", plc: "PLC-01", tag: "WELL_LEVEL_SP", from: "2.6", to: "2.5", ticket: "CM-2026-0188" },
  { at: "11:40:05", user: "operator_day", plc: "—", tag: "ALARM_ACK", from: "未確認", to: "確認済み", ticket: "—" },
  { at: "13:05:11", user: "operator_day", plc: "PLC-02", tag: "PAC_DOSE_SP", from: "10.2", to: "10.0", ticket: "CM-2026-0191" },
  { at: "13:58:12", user: "operator_trn", plc: "—", tag: "ACCOUNT", from: "—", to: `${INCIDENT.extraAdminAccount} を作成`, ticket: null },
  { at: INCIDENT.changeTime, user: INCIDENT.extraAdminAccount, plc: "PLC-03", tag: INCIDENT.changedTag, from: INCIDENT.baselineSp.toFixed(2), to: INCIDENT.changedSp.toFixed(2), ticket: null },
];

// 原因の候補(STEP 02)。証拠と正誤を持つ。
export type CauseCandidate = { id: string; label: string; evidence: string; correct: boolean; reason: string };
export const causeCandidates: readonly CauseCandidate[] = [
  { id: "sensor-fault", label: "残留塩素計(センサー)の故障", evidence: "残留塩素計の自己診断は正常。流量計・注入ポンプ回転数など他の計器は互いに整合している。", correct: false, reason: "自己診断は正常で、他の計器とも整合しています。センサー単体の故障では、独立モデルの推定値まで下がる理由を説明できません。" },
  { id: "comm-delay", label: "通信遅延・タイムアウト", evidence: "時刻のずれやタイムアウトの記録はない。各サンプルは1分周期で欠けずに届いている。", correct: false, reason: "時刻ずれやタイムアウトの記録がありません。遅延なら値は遅れて追従するはずですが、表示値は高止まりしています。" },
  { id: "unauthorized-change", label: "承認外の設定変更", evidence: `${INCIDENT.changedTag} が ${INCIDENT.baselineSp.toFixed(2)}→${INCIDENT.changedSp.toFixed(2)} ${INCIDENT.unit} に変更。変更者 ${INCIDENT.extraAdminAccount}、変更管理票なし。直後から独立モデルの推定値が低下。`, correct: true, reason: "操作ログ・設定差分・独立モデルの低下の3点が整合します。" },
  { id: "display-stale", label: "表示側のデータ停滞(表示値の高止まり)", evidence: "HMIの表示値だけが 0.8 mg/L 前後で高止まりし、PLC-03 側のPVとは乖離している。", correct: true, reason: "表示値だけが動かず、PLC側のPVと食い違っています。設定変更と併発しているため、表示用入力は信頼できません。" },
];

// 表示用入力をどう扱うか(STEP 02)。
export type Choice = { id: string; label: string; correct: boolean; reason: string };
export const isolationDecisions: readonly Choice[] = [
  { id: "isolate", label: "表示用データ入力を隔離し、独立した値で監視する", correct: true, reason: "信頼できない入力を切り離し、根拠のそろった値で判断を続けられます。" },
  { id: "watch", label: "表示値は下限アラームを下回っていないので、様子を見る", correct: false, reason: "表示値そのものが疑わしい状況です。下限アラームが出ないことは安全の根拠になりません。ログ・差分・独立値の3点をそろえて判断します。" },
  { id: "stop-plc", label: "PLC-03 ごと停止する", correct: false, reason: "塩素注入まで止まり、消毒不足になる恐れがあります。止めるのは信頼できない表示用入力で、消毒は維持します。" },
];

// 安全モードの対応選択肢(STEP 03)。複数選択。誤りには理由を示す。
export type SafeModeChoice = Choice;
export const safeModeChoices: readonly SafeModeChoice[] = [
  { id: "man", label: "注入を手動運転(MAN)に切り替え、安全側の固定注入率で運転する", correct: true, reason: "表示が信頼できない間も、消毒を維持しつつ承認済みの値で運転できます。" },
  { id: "block-remote", label: "遠隔からの設定変更を一時的に禁止する", correct: true, reason: "原因を特定するまで、承認外の書き込みをこれ以上受けないようにします。" },
  { id: "field-test", label: "現場で残留塩素を手分析して実測値を確認する", correct: true, reason: "表示系に依存しない独立した実測で、実態を把握します。" },
  { id: "report", label: "運転責任者へ報告する", correct: true, reason: "判断と記録を共有し、承認フローに乗せます。" },
  { id: "stop", label: "塩素注入を完全に止める", correct: false, reason: "消毒不足となり水質を損なう恐れがあります。止めるのではなく安全側で維持します。" },
  { id: "max", label: "注入率を最大に上げる", correct: false, reason: "過剰注入になり別のリスクを生みます。承認済みの固定値で運転します。" },
  { id: "continue", label: "原因不明のまま通常運転(AUTO)を続ける", correct: false, reason: "信頼できない表示と承認外の設定に制御を任せ続けることになります。" },
];

// 現場手分析の判断(STEP 04)。
export const fieldCheckChoices: readonly Choice[] = [
  { id: "consistent", label: "独立モデルの推定値と整合している", correct: true, reason: "手分析値と独立モデル推定値の差は閾値以内です。" },
  { id: "inconsistent", label: "独立モデルの推定値と整合していない", correct: false, reason: "差を計算してください。手分析値と独立モデル推定値の差は閾値以内です。" },
];

// 自動運転への復旧作業(STEP 05)。
export const restoreTasks: readonly { id: string; label: string }[] = [
  { id: "auto", label: "注入ポンプを手動運転(MAN)から自動運転(AUTO)へ戻す" },
  { id: "release", label: "表示用データ入力の隔離を解除する" },
  { id: "watch", label: "復旧後も数分間、独立モデルとの比較監視を続ける" },
];

// HMIのアラーム一覧(訓練用)。
export type AlarmRow = { at: string; priority: "高" | "中" | "低"; text: string; occurred: boolean };
export const alarmList: readonly AlarmRow[] = [
  { at: "—", priority: "高", text: `残留塩素 下限アラーム(${INCIDENT.lowAlarmLimit.toFixed(2)} ${INCIDENT.unit}、監視表示値に設定)`, occurred: false },
  { at: "14:05:00", priority: "中", text: `残留塩素 監視表示と独立モデル推定の乖離(${INCIDENT.consecutiveRequired}回連続)`, occurred: true },
  { at: INCIDENT.changeTime, priority: "低", text: `${INCIDENT.changedPlc} 設定値変更イベント(${INCIDENT.changedTag})`, occurred: true },
];

// 浄水プロセス(図とプロセス凡例で共用)。
export const processUnits = [
  { id: "intake", label: "取水" },
  { id: "well", label: "着水井", plc: "PLC-01" },
  { id: "pac", label: "PAC注入", plc: "PLC-02" },
  { id: "settle", label: "沈殿" },
  { id: "filter", label: "急速ろ過" },
  { id: "cl2", label: "塩素注入", plc: "PLC-03" },
  { id: "clearwell", label: "浄水池/配水池", plc: "PLC-04" },
  { id: "supply", label: "配水" },
] as const;

// 画面内で下線ホバー/タップ説明に使う用語辞典。
export const glossary: Record<string, string> = {
  中央監視室: "浄水場全体をSCADAで監視する部屋。",
  SCADA: "現場の計測値を集めて監視・操作する上位システム。",
  HMI: "運転員が見る監視画面。",
  PLC: "ポンプや弁を制御する現場の制御装置。",
  PV: "測定値。センサーが計測した現在値。",
  SP: "設定値。制御が目標とする値。",
  注入率: "水1Lあたりに入れる薬品量(mg/L)。",
  残留塩素: "消毒後の水に残る塩素濃度。消毒効果の指標。",
  アラーム上下限: "警報を出す値の境界。",
  インターロック: "危険な状態で機器の動作を止める仕組み。",
  フェイルセーフ: "異常時に安全側へ動かす設計。",
  "手動/自動": "MAN/AUTO。運転員が直接操作するか(MAN)、制御に任せるか(AUTO)。",
  MAN: "手動運転。運転員が直接操作する。",
  AUTO: "自動運転。制御に任せる。",
  ベースライン: "承認済みの正しい設定値の一覧。",
  変更管理票: "設定変更の承認記録。",
  最小権限: "必要な権限だけを与える原則。",
  操作ログ: "誰がいつ何を変更したかの記録(監査ログ)。",
  独立モデル: "別系統の計測・計算で求める期待値。表示との比較に使う。",
  独立モデル推定値: "流量・注入ポンプ回転数・塩素要求量から別系統で算出する残留塩素の期待値。",
  現場手分析: "運転員が現地で試料を採って測る確認。",
};
