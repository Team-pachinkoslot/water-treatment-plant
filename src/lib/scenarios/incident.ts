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
  fieldAnalysis: { at: "14:12", value: 0.59 }, // 現場手分析の模擬結果(mg/L)
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

// 判断の選択肢。正誤と、選んだときに示す「見直す観点」(reason)を持つ。誤答の reason に答えそのものは書かない。
export type Choice = { id: string; label: string; correct: boolean; reason: string };

// 2-2 考えられる原因(複数選択)。
export type CauseCandidate = Choice;
export const causeCandidates: readonly CauseCandidate[] = [
  { id: "sensor-fault", label: "残留塩素計(センサー)の故障", correct: false, reason: "別系統の推定値(流量・ポンプ回転数から算出)も低下していることと、整合しますか?" },
  { id: "comm-delay", label: "通信の遅延", correct: false, reason: "時刻のずれやタイムアウトの記録はありますか?" },
  { id: "unauthorized-change", label: "承認外の設定変更", correct: true, reason: "変更管理票のない設定変更と、その直後からの推定値の低下が整合します。" },
  { id: "display-untrusted", label: "表示側のデータが信頼できない", correct: true, reason: "表示値だけが高いまま動かず、別系統の推定値と食い違っています。" },
];

// 2-3 根拠(操作ログからの観察。複数選択)。
export const evidenceChoices: readonly Choice[] = [
  { id: "no-ticket", label: `${INCIDENT.changedTag} の変更に、変更管理票がない`, correct: true, reason: "承認の記録がない変更です。" },
  { id: "drop-after-change", label: `変更(${INCIDENT.changeTime})の直後から、推定値が低下している(${INCIDENT.anomalyStart}〜)`, correct: true, reason: "時刻の前後関係が、変更と低下を結び付けます。" },
  { id: "created-account", label: `変更者 ${INCIDENT.extraAdminAccount} は、13:58:12 に operator_trn が作成したアカウントである`, correct: true, reason: "変更の直前に作られたアカウントです。" },
  { id: "others-ticketed", label: "他の変更(PLC-01、02、04)には変更管理票がある", correct: false, reason: "事実ですが、正常な変更との違いを示す補足です。原因そのものの根拠になる観察を選びましょう。" },
  { id: "alarm-ack", label: "11:40:05 の ALARM_ACK(アラームの確認)がある", correct: false, reason: "今回の設定変更や推定値の低下と、時刻・対象が結び付いていますか?" },
  { id: "sys-auto", label: "06:00:00 の sys_auto の変更がある", correct: false, reason: "対象のタグと時刻を、今回の異常と比べてみましょう。" },
];

// 2-4 隔離する対象。
export const isolationTargets: readonly Choice[] = [
  { id: "display-feed", label: "表示用データ入力", correct: true, reason: "疑わしい入力だけを切り離し、制御と配水は続けられます。" },
  { id: "plc-03", label: "PLC-03(塩素注入制御)", correct: false, reason: "制御や配水を止めると水質・供給に影響します。まず疑わしい入力だけを切り離しましょう。" },
  { id: "scada-all", label: "中央監視室(監視サーバー全体)", correct: false, reason: "監視全体を止めると、他の設備の状態も見えなくなります。まず疑わしい入力だけを切り離しましょう。" },
  { id: "supply-pump", label: "配水ポンプ", correct: false, reason: "制御や配水を止めると水質・供給に影響します。まず疑わしい入力だけを切り離しましょう。" },
];

// 3-1 安全モードの対応(複数選択)。
export type SafeModeChoice = Choice;
export const safeModeChoices: readonly SafeModeChoice[] = [
  { id: "man", label: "注入を手動運転(MAN)に切り替え、安全側の固定注入率で運転する", correct: true, reason: "表示が信頼できない間も、消毒を維持できます。" },
  { id: "block-remote", label: "遠隔からの設定変更を一時的に禁止する", correct: true, reason: "承認外の書き込みをこれ以上受けないようにします。" },
  { id: "field-test", label: "現場で残留塩素を手分析して確認する", correct: true, reason: "表示系に依存しない独立した確認です。" },
  { id: "report", label: "運転責任者へ報告する", correct: true, reason: "判断と記録を共有します。" },
  { id: "stop", label: "塩素注入を完全に止める", correct: false, reason: "消毒が不足する恐れがあります。水質を守る対応を考えましょう。" },
  { id: "max", label: "注入率を最大にする", correct: false, reason: "過剰注入になり、水質や設備に影響します。" },
  { id: "continue", label: "原因が分かるまで通常運転を続ける", correct: false, reason: "異常が確認できているため、安全側への移行が必要です。" },
];

// 4-2 無効化するアカウント。
export const accountChoices: readonly Choice[] = [
  { id: "operator_day", label: "operator_day", correct: false, reason: "このアカウントの変更には変更管理票があります。今回の設定変更を行ったアカウントを操作ログで確かめましょう。" },
  { id: "operator_trn", label: "operator_trn", correct: false, reason: "このアカウントも見直しが必要ですが(初期設定のまま)、今回の設定変更を行ったのは別のアカウントです。" },
  { id: INCIDENT.extraAdminAccount, label: INCIDENT.extraAdminAccount, correct: true, reason: "承認外の設定変更を行ったアカウントです。" },
  { id: "sys_auto", label: "sys_auto", correct: false, reason: "このアカウントの変更には変更管理票があります。今回の設定変更を行ったアカウントを操作ログで確かめましょう。" },
];

// 4-4 復旧データでの判断。
export const recoveryJudgeChoices: readonly Choice[] = [
  { id: "normal", label: "正常と判断できる", correct: true, reason: "" },
  { id: "not-yet", label: "まだ判断できない(次の記録を取得して確認を続ける)", correct: false, reason: "" },
];

// 4-5 現場手分析との整合。
export const fieldCheckChoices: readonly Choice[] = [
  { id: "consistent", label: "整合している", correct: true, reason: "手分析値と、推定値・監視表示の差は閾値以内です。" },
  { id: "inconsistent", label: "整合していない", correct: false, reason: `手分析値と推定値・監視表示の差が、閾値 ${INCIDENT.diffThreshold.toFixed(2)} ${INCIDENT.unit} 以内かを確認しましょう。` },
];

// 5-1 運転モード。
export const modeChoices: readonly Choice[] = [
  { id: "AUTO", label: "AUTO(自動運転)", correct: true, reason: "" },
  { id: "MAN", label: "MAN(手動運転)", correct: false, reason: "安全モードの手動運転のままです。正常性の確認が済んだので、運転方法を戻しましょう。" },
];

// 5-3 復旧後も続ける監視(複数選択)。
export const monitoringChoices: readonly Choice[] = [
  { id: "compare", label: "独立した別系統の推定値との差を、常時比較する", correct: true, reason: "" },
  { id: "baseline", label: "設定値を、ベースラインと定期的に照合する", correct: true, reason: "" },
  { id: "ticket", label: "操作ログの変更を、変更管理票と照合する", correct: true, reason: "" },
  { id: "stop-watch", label: "安定したので、監視は終了する", correct: false, reason: "再発の確認のため、復旧後も監視を続けます。" },
  { id: "lower-alarm", label: "警報が鳴りにくいよう、下限アラームの値を下げる", correct: false, reason: "警報を鳴りにくくすると、異常に気付けなくなります。" },
];

// 1-3 の推奨キーワード(採点には使わず、注意の表示だけに使う)。
export const spikeReasonKeywords = ["次の回", "閾値以内", "連続していない", "単発"] as const;

// 防御レポートの「講師の確認の観点」(提出後の参考表示。採点には使わない)。
export const reportReviewPoints = {
  observations: ["差", `連続回数(${INCIDENT.consecutiveRequired}回)`, "単発の除外"],
  impact: [INCIDENT.changedPlc, "塩素注入", "浄水池出口", `出口残留塩素の最小値(推定${INCIDENT.minEstimatedResidual.toFixed(2)} ${INCIDENT.unit})と水質基準相当(${INCIDENT.referenceResidual.toFixed(2)} ${INCIDENT.unit})の関係`],
  evidence: ["変更管理票の有無", "独立した推定値", "表示用入力の隔離", "MAN運転", "現場確認", "報告"],
  timeline: [`${INCIDENT.consecutiveRequired}回連続の正常(14:11〜14:13)`, "現場手分析との整合"],
  improvements: ["設定変更の二人承認", "変更管理票", "不要アカウントの削除", "遠隔からの設定変更の制限", "ネットワークの分離", "独立した別系統との常時比較", "ログ監視アラート"],
} as const;

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
  着水井: "取水した水を受け入れ、水量や水位を調整する場所。",
  PAC: "水中の細かな濁りを集めて沈みやすくする凝集剤。",
  急速ろ過: "砂などの層に水を通し、残った細かな濁りを取り除く工程。",
  乖離: "比較する2つの値が食い違うこと。この演習では差の大きさに着目します。",
  閾値: "判断の境界となる値。この演習では監視表示と推定値の差を比べます。",
  入力経路: "監視画面に表示するデータの受け取り元。untrustedは信頼性に疑いがある模擬状態。",
  タグ: "設備の測定値や設定値を識別するための名前。",
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
