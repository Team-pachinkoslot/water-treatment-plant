import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";
import { INCIDENT } from "@/lib/scenarios/incident";

const MAX = 1.2; // 残留塩素の表示上限(mg/L)
const diffMgl = (s: TelemetrySample) => Math.abs(s.display_cl_mgl - s.model_cl_mgl);

export function AquaTelemetry({ samples, recovery = false }: { samples: TelemetrySample[]; recovery?: boolean }) {
  const x = (i: number) => 65 + i * (610 / Math.max(samples.length - 1, 1));
  const y = (v: number) => 220 - Math.max(0, Math.min(MAX, v)) * (180 / MAX);
  const line = (key: "model_cl_mgl" | "display_cl_mgl") => samples.map((s, i) => `${x(i)},${y(s[key])}`).join(" ");
  const band = [
    ...samples.map((s, i) => `${x(i)},${y(s.model_cl_mgl + INCIDENT.diffThreshold)}`),
    ...samples.map((s, i) => `${x(i)},${y(s.model_cl_mgl - INCIDENT.diffThreshold)}`).reverse(),
  ].join(" ");
  const title = recovery ? "復旧確認用サンプル / 残留塩素" : "残留塩素 / 監視表示と独立モデルの乖離";
  return <section className="panel aqua-telemetry">
    <h2>{title}</h2><p>2026-11-02の固定された架空イベントです。ライブ監視ではありません。数値は訓練用の架空値で、実在の運用基準ではありません。時刻はUTC。</p>
    <div className="aqua-legend"><span>━━ 独立モデル推定</span><span>┄┄ 監視表示</span><span className="legend-band">▧ ±{INCIDENT.diffThreshold.toFixed(2)} mg/L 許容帯</span></div>
    <svg viewBox="0 0 740 270" role="img" aria-label={`${title}。残留塩素0〜${MAX} mg/L。詳細は直後のデータ表。`}>
      {[0, 0.3, 0.6, 0.9, 1.2].map(v => <g key={v}><line x1="65" x2="675" y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x="50" y={y(v) + 4} textAnchor="end" fill="var(--muted)" fontSize="12">{v.toFixed(1)}</text></g>)}
      <polygon points={band} fill="var(--cyan)" fillOpacity="0.1" stroke="none" />
      <polyline points={line("model_cl_mgl")} fill="none" stroke="var(--cyan)" strokeWidth="3" />
      <polyline points={line("display_cl_mgl")} fill="none" stroke="var(--orange)" strokeWidth="3" strokeDasharray="7 5" />
      {samples.map((s, i) => <g key={s.timestamp}><circle cx={x(i)} cy={y(s.display_cl_mgl)} r="4" fill="var(--orange)" />{diffMgl(s) > INCIDENT.diffThreshold && <circle cx={x(i)} cy={y(s.display_cl_mgl)} r="8" fill="none" stroke="var(--orange)" strokeOpacity="0.5" />}<text x={x(i)} y="246" textAnchor="middle" fill="var(--muted)" fontSize="12">{s.timestamp.slice(11, 16)}</text></g>)}
    </svg>
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label={`${title}のデータ表`}><table><caption>{title} / UTC・残留塩素(mg/L)・訓練用の架空値</caption><thead><tr><th>時刻(UTC)</th><th>モデル推定(mg/L)</th><th>監視表示(mg/L)</th><th>差(mg/L)</th><th>流量(L/min)</th><th>入力経路</th><th>模擬状態</th></tr></thead><tbody>{samples.map(s => { const d = diffMgl(s); const over = d > INCIDENT.diffThreshold; return <tr key={s.timestamp} className={over ? "row-exceeds" : ""}><td>{s.timestamp.slice(11, 16)}</td><td>{s.model_cl_mgl.toFixed(2)}</td><td>{s.display_cl_mgl.toFixed(2)}</td><td>{d.toFixed(2)}{over ? " ⚠" : ""}</td><td>{s.flow_lpm}</td><td>{s.input_feed}</td><td>{s.mode}</td></tr>; })}</tbody></table></div>
  </section>;
}
