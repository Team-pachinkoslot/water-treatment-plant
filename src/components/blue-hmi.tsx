"use client";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardList, Droplets, Gauge, ShieldAlert } from "lucide-react";
import { INCIDENT, alarmList, glossary, opLog, plcTags, processUnits } from "@/lib/scenarios/incident";
import type { BlueState } from "@/lib/scenarios/aqua";
import { deriveDisplay, type JudgmentId } from "@/lib/scenarios/blue-steps";
import { Term } from "./glossary";

const num = (n: number | undefined, unit: string) => (n === undefined ? "—" : `${n.toFixed(unit === "m" ? 1 : 2)} ${unit}`);

// §2.1 引継ぎメモ。
export function IncidentMemo() {
  return (
    <section className="incident-memo" aria-label="インシデント引継ぎメモ">
      <div className="eyebrow"><ClipboardList size={13} /> 引継ぎメモ / {INCIDENT.anomalyConfirmed}</div>
      <p>
        {INCIDENT.anomalyConfirmed} 浄水池出口の<Term name="残留塩素">残留塩素</Term>について、
        <Term name="HMI">監視画面</Term>の表示と、<Term name="独立モデル推定値">別系統の推定値</Term>に差が出ています。
        原因を絞り込み、水質を守りながら安全に復旧してください。
      </p>
      <p>昼の運用記録に、<Term name="変更管理票">変更管理票</Term>のない設定変更の可能性があります。</p>
      <p className="incident-memo-note">数値は訓練用の架空値であり、実在の水道事業の運用基準ではありません。</p>
    </section>
  );
}

// §4.3 アラーム一覧。
export function AlarmList({ state }: { state: BlueState }) {
  const acknowledged = state !== "anomaly_detected";
  return (
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="アラーム一覧">
      <table className="hmi-table">
        <caption>アラーム一覧(<Term name="アラーム上下限">アラーム上下限</Term>は監視表示値に対して設定)</caption>
        <thead><tr><th>優先度</th><th>発生時刻</th><th>内容</th><th>状態</th></tr></thead>
        <tbody>
          {alarmList.map(a => (
            <tr key={a.text} className={a.occurred ? "" : "row-muted"}>
              <td>{a.priority}</td>
              <td>{a.at}</td>
              <td>{a.text}</td>
              <td>{!a.occurred ? "未発生(表示値は下限以上)" : state === "recovered" ? "復帰" : acknowledged ? "確認済み" : "未確認"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// §4.3 中央監視室HMI風パネル(注入ポンプ状態・アラーム・操作ログ)。正解済みの判断(solved)も表示に反映する。
const feedLabel = { connected: "接続(要確認)", isolated: "隔離済み", recovery: "隔離済み(復旧データで確認中)", restored: "接続(復旧データ)" } as const;
export function HmiOverview({ blueState, solved = [], showLog = true }: { blueState: BlueState; solved?: readonly JudgmentId[]; showLog?: boolean }) {
  const d = deriveDisplay(blueState, solved);
  const manual = d.mode === "MAN";
  // 承認外の設定(0.40)の間は回転数が下がる。手動の固定注入・設定を戻した後はベースライン相当。
  const rpm = d.spRestored || manual ? INCIDENT.pumpRpm.baseline : INCIDENT.pumpRpm.changed;
  return (
    <section className="panel hmi-panel" aria-label="中央監視室HMIの状態">
      <div className="eyebrow"><Gauge size={13} /> CENTRAL HMI / <Term name="中央監視室">中央監視室</Term></div>
      <h3>いまの監視状態</h3>
      <dl className="hmi-status-grid">
        <div>
          <dt>残留塩素 下限アラーム</dt>
          <dd>{blueState === "recovered" ? <><CheckCircle2 size={14} /> 正常</> : <>未発生(表示値 ≥ {INCIDENT.lowAlarmLimit.toFixed(2)})</>}</dd>
        </div>
        <div>
          <dt>塩素注入ポンプ({INCIDENT.changedPlc})</dt>
          <dd className={manual ? "alarm-low" : ""}>注入ポンプ: {d.mode} / 運転 / {rpm} min⁻¹</dd>
        </div>
        <div>
          <dt>注入率の設定値(<Term name="SP">SP</Term>)</dt>
          <dd className={d.spRestored ? "" : "alarm-low"}>{d.sp.toFixed(2)} {INCIDENT.unit}{d.spRestored ? "(ベースライン)" : ""}{manual ? "(手動の固定注入)" : ""}</dd>
        </div>
        <div>
          <dt>表示用データ入力</dt>
          <dd className={d.feed === "connected" || d.feed === "isolated" ? "alarm-low" : ""}>{feedLabel[d.feed]}</dd>
        </div>
        <div>
          <dt>遠隔からの設定変更</dt>
          <dd className={d.remoteBlocked ? "alarm-low" : ""}>{d.remoteBlocked ? "禁止" : "許可"}</dd>
        </div>
        <div>
          <dt>アカウント {INCIDENT.extraAdminAccount}</dt>
          <dd className={d.accountDisabled ? "" : "alarm-low"}>{d.accountDisabled ? "無効" : "有効"}</dd>
        </div>
      </dl>
      <AlarmList state={blueState} />
      {showLog && <OpLogTable />}
      <p className="hmi-note"><ShieldAlert size={13} /> 図と値は固定教材と演習状態を表します。実際の設備は操作しません。</p>
    </section>
  );
}

// STEP 02 資料1: PLC一覧のタグ表。
export function PlcTagTable() {
  return (
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="PLCタグ表">
      <table className="plc-tag-table">
        <caption><Term name="PLC">PLC</Term>一覧(<Term name="PV">PV</Term>・<Term name="SP">SP</Term>・<Term name="ベースライン">ベースライン</Term>)</caption>
        <thead><tr><th>PLC</th><th>区域</th><th>タグ名</th><th>PV</th><th>SP</th><th>ベースライン</th><th>最終変更者</th><th>最終変更時刻</th><th>変更管理票</th><th>アラーム</th></tr></thead>
        <tbody>
          {plcTags.map(t => (
            <tr key={t.plc}>
              <td>{t.plc}</td><td>{t.area}</td><td><code>{t.tag}</code></td>
              <td>{num(t.pv, t.unit)}</td><td>{num(t.sp, t.unit)}</td><td>{num(t.baseline, t.unit)}</td>
              <td>{t.lastChangedBy}</td><td>{t.lastChangedAt}</td><td>{t.changeTicket ?? "なし"}</td>
              <td>{t.alarm === "none" ? "なし" : t.alarm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// STEP 02 資料2: 設定差分(ベースライン vs 現在)。
export function SettingDiffTable() {
  return (
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="設定差分">
      <table className="plc-tag-table">
        <caption>設定差分(ベースライン → 現在のSP)</caption>
        <thead><tr><th>PLC</th><th>タグ名</th><th>ベースライン</th><th>現在のSP</th><th>差</th><th>PVとSPの差(許容)</th></tr></thead>
        <tbody>
          {plcTags.map(t => {
            const diff = (t.sp ?? 0) - (t.baseline ?? 0);
            const gap = Math.abs((t.pv ?? 0) - (t.sp ?? 0));
            return (
              <tr key={t.plc}>
                <td>{t.plc}</td><td><code>{t.tag}</code></td><td>{num(t.baseline, t.unit)}</td><td>{num(t.sp, t.unit)}</td>
                <td>{diff === 0 ? "差なし" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)} ${t.unit} ⚠`}</td>
                <td>{gap.toFixed(t.unit === "m" ? 1 : 2)} {t.unit}(±{t.tolerance})</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// STEP 02 資料3 / HMI: 操作ログ(監査ログ)。
export function OpLogTable() {
  return (
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="操作ログ">
      <table className="op-log-table">
        <caption><Term name="操作ログ">操作ログ</Term>(2026-11-02)</caption>
        <thead><tr><th>時刻</th><th>ユーザー</th><th>PLC</th><th>タグ</th><th>旧値→新値</th><th><Term name="変更管理票">変更管理票</Term></th></tr></thead>
        <tbody>
          {opLog.map(r => (
            <tr key={`${r.at}-${r.tag}`}>
              <td>{r.at}</td><td>{r.user}</td><td>{r.plc}</td><td><code>{r.tag}</code></td>
              <td>{r.from} → {r.to}</td><td>{r.ticket ?? "なし"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProcessLegend() {
  return (
    <p className="process-legend">
      <Droplets size={13} />
      {processUnits.map((u, i) => (
        <span key={u.id}>
          {i > 0 && "→ "}
          {u.id === "pac" ? <Term name="注入率">{u.label}</Term> : u.id === "cl2" ? <><Term name="残留塩素">{u.label}</Term>(残留塩素監視)</> : u.label}
        </span>
      ))}
    </p>
  );
}

// §1.2 用語辞典(一覧)。本文中の下線語はホバー/タップでも説明が出る。
export function GlossaryPanel() {
  return (
    <details className="panel glossary-panel">
      <summary><BookOpen size={14} /> 用語辞典({Object.keys(glossary).length}語)</summary>
      <dl>
        {Object.entries(glossary).map(([term, desc]) => (
          <div key={term}><dt>{term}</dt><dd>{desc}</dd></div>
        ))}
      </dl>
    </details>
  );
}

export function TrainingNotice() {
  return (
    <p className="hmi-note training-notice"><AlertTriangle size={13} /> 数値は訓練用の架空値であり、実在の水道事業の運用基準ではありません。設備の操作手順や制御通信は扱いません。</p>
  );
}
