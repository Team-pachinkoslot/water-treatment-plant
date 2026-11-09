import { INCIDENT, plcTags, processUnits, type TrendRow } from "@/lib/scenarios/incident";
import type { BlueState } from "@/lib/scenarios/aqua";

// 状態ごとの表現。色だけに頼らず、バッジの文字とキャプションでも伝える。
const stateCaption: Record<BlueState, string> = {
  anomaly_detected: "監視表示は下限アラームを下回らず、警報は出ていません。別系統の推定値とだけ食い違っています。",
  investigating: "⚠ 塩素注入点を調査中です。表示値と独立モデル推定値の乖離が続いています。",
  input_isolated: "✂ 表示用データ入力を切り離しました。HMIの残留塩素表示は使わず、独立した値で監視します。",
  safe_mode: "MAN 塩素注入は手動運転の固定注入です。遠隔からの設定変更を止め、現場で手分析を行います。",
  verified: "✓ 設定値をベースラインに戻し、差が閾値以内を3回連続で確認しました。",
  recovered: "AUTO 自動運転と通常の監視表示に戻りました。比較監視を続けています。",
};
const fmt = (n: number | undefined) => (n === undefined ? "—" : n.toFixed(2));

export function BlueProcessDiagram({ state, trend, recovery }: { state: BlueState; trend: readonly TrendRow[]; recovery: readonly TrendRow[] }) {
  const isolated = ["input_isolated", "safe_mode", "verified"].includes(state);
  const manual = ["safe_mode", "verified"].includes(state);
  const restored = ["verified", "recovered"].includes(state);
  const latest = restored ? recovery.at(-1) : trend.at(-1);
  const sp = restored ? INCIDENT.baselineSp : INCIDENT.changedSp;
  const tag = (plc: string) => plcTags.find(t => t.plc === plc);
  const value: Record<string, string> = {
    well: `水位 ${tag("PLC-01")?.pv?.toFixed(1)} m`,
    pac: `${tag("PLC-02")?.pv?.toFixed(1)} mg/L`,
    cl2: `SP ${sp.toFixed(2)} ${INCIDENT.unit}`,
    clearwell: `水位 ${tag("PLC-04")?.pv?.toFixed(1)} m`,
  };
  const x = (i: number) => 14 + i * 108;
  const cl2 = processUnits.findIndex(u => u.id === "cl2");
  const well = processUnits.findIndex(u => u.id === "clearwell");
  const sensorX = x(well) + 45;
  return (
    <section className={`panel blue-process state-${state}`} aria-label="浄水プロセス図">
      <div className="eyebrow">PROCESS / 七王子市中央浄水場(架空)</div>
      <h3>浄水プロセスと塩素消毒設備</h3>
      <div className="blue-process-scroll" tabIndex={0} role="region" aria-label="浄水プロセス図。狭い画面では横スクロールできます。">
        <svg viewBox="0 0 880 250" role="img" aria-labelledby="blue-process-title blue-process-desc">
          <title id="blue-process-title">浄水プロセス図(状態: {state})</title>
          <desc id="blue-process-desc">{processUnits.map(u => u.label).join("、")}。{stateCaption[state]}</desc>
          <defs>
            <marker id="bp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#6bc9cc" /></marker>
          </defs>
          {/* HMI と独立モデル */}
          <g>
            <rect x="440" y="8" width="180" height="50" rx="6" className="bp-box bp-model" />
            <text x="452" y="27" className="bp-label">独立モデル推定(別系統)</text>
            <text x="452" y="47" className="bp-value">残留塩素 {fmt(latest?.model)} {INCIDENT.unit}</text>
            <rect x="660" y="8" width="206" height="50" rx="6" className="bp-box" />
            <text x="672" y="27" className="bp-label">中央監視室 HMI</text>
            <text x="672" y="47" className="bp-value">残留塩素 表示 {isolated ? "隔離中" : `${fmt(latest?.display)} ${INCIDENT.unit}`}</text>
          </g>
          {/* 残留塩素計 → HMI の表示用入力 */}
          <path d={`M${sensorX} 100V58`} className={`bp-wire ${isolated ? "is-cut" : ""}`} />
          {isolated && (
            <g className="bp-cut">
              <rect x={sensorX + 8} y="68" width="118" height="22" rx="4" />
              <text x={sensorX + 16} y="83">✂ 表示入力 隔離中</text>
            </g>
          )}
          {/* 流量・ポンプ回転数 → 独立モデル */}
          <path d={`M${x(cl2) + 45} 100V58`} className="bp-wire bp-wire-model" />
          {/* 本流 */}
          <path d={`M${x(0) + 90} 128H${x(processUnits.length - 1)}`} className="bp-pipe" />
          {processUnits.slice(1).map((u, i) => <path key={u.id} d={`M${x(i) + 90} 128H${x(i + 1) - 2}`} className="bp-flow" markerEnd="url(#bp-arrow)" />)}
          {processUnits.map((u, i) => {
            const isCl2 = u.id === "cl2";
            return (
              <g key={u.id} className={isCl2 ? `bp-unit bp-cl2 ${state === "investigating" ? "cl2-blink" : ""}` : "bp-unit"}>
                <rect x={x(i)} y="100" width="90" height="56" rx="6" className="bp-box" />
                <text x={x(i) + 45} y="124" textAnchor="middle" className="bp-label">{u.label}</text>
                {"plc" in u && <text x={x(i) + 45} y="144" textAnchor="middle" className="bp-plc">{u.plc}</text>}
                {value[u.id] && <text x={x(i) + 45} y="174" textAnchor="middle" className="bp-value">{value[u.id]}</text>}
              </g>
            );
          })}
          {/* 塩素注入点の状態バッジ */}
          <g transform={`translate(${x(cl2)} 186)`}>
            {state === "investigating" && <g className="bp-badge is-warn"><rect width="90" height="22" rx="4" /><text x="45" y="15" textAnchor="middle">⚠ 要調査</text></g>}
            {manual && <g className="bp-badge is-man"><rect width="90" height="22" rx="4" /><text x="45" y="15" textAnchor="middle">MAN 固定注入</text></g>}
            {(state === "recovered" || state === "anomaly_detected" || state === "input_isolated") && <g className="bp-badge"><rect width="90" height="22" rx="4" /><text x="45" y="15" textAnchor="middle">AUTO</text></g>}
          </g>
          {state === "safe_mode" && (
            <g className="bp-badge is-field" transform={`translate(${x(well)} 186)`}>
              <rect width="90" height="22" rx="4" />
              <text x="45" y="15" textAnchor="middle">🧪 現場確認</text>
            </g>
          )}
          {state === "verified" && (
            <g className="bp-badge is-ok" transform={`translate(${x(well)} 186)`}>
              <rect width="90" height="22" rx="4" />
              <text x="45" y="15" textAnchor="middle">✓ 確認済み</text>
            </g>
          )}
          <text x="14" y="238" className="bp-note">数値は訓練用の架空値です。実際の設備には接続していません。</text>
        </svg>
      </div>
      <p className="blue-process-caption" aria-live="polite">{stateCaption[state]}</p>
    </section>
  );
}
