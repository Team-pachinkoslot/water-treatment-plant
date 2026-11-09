import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";

export function AquaTelemetry({ samples, recovery = false }: { samples: TelemetrySample[]; recovery?: boolean }) {
  const x = (i: number) => 65 + i * (610 / Math.max(samples.length - 1, 1));
  const y = (v: number) => 220 - v * 1.8;
  const points = (key: "model_level_pct" | "display_level_pct") => samples.map((s,i) => `${x(i)},${y(s[key])}`).join(" ");
  const title = recovery ? "復旧確認用サンプル" : "仮想タンク水位 / 不整合サンプル";
  return <section className="panel aqua-telemetry">
    <h2>{title}</h2><p>2026-11-02の固定された架空イベントです。ライブ監視ではありません。時刻はUTC。</p>
    <div className="aqua-legend"><span>━━ 独立モデル値</span><span>┄┄ HMI表示値</span></div>
    <svg viewBox="0 0 740 270" role="img" aria-label={`${title}。水位0〜100%。詳細は直後のデータ表。`}>
      {[0,25,50,75,100].map(v => <g key={v}><line x1="65" x2="675" y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x="50" y={y(v)+4} textAnchor="end" fill="var(--muted)" fontSize="12">{v}%</text></g>)}
      <polyline points={points("model_level_pct")} fill="none" stroke="var(--cyan)" strokeWidth="3" />
      <polyline points={points("display_level_pct")} fill="none" stroke="var(--orange)" strokeWidth="3" strokeDasharray="7 5" />
      {samples.map((s,i) => <g key={s.timestamp}><circle cx={x(i)} cy={y(s.display_level_pct)} r="4" fill="var(--orange)" /><text x={x(i)} y="246" textAnchor="middle" fill="var(--muted)" fontSize="12">{s.timestamp.slice(11,19)}</text></g>)}
    </svg>
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label={`${title}のデータ表`}><table><caption>{title} / UTC・仮想値</caption><thead><tr><th>時刻（UTC）</th><th>モデル（%）</th><th>表示（%）</th><th>差（pt）</th><th>流量（L/min）</th><th>入力経路</th><th>模擬状態</th></tr></thead><tbody>{samples.map(s => <tr key={s.timestamp}><td>{s.timestamp.slice(11,19)}</td><td>{s.model_level_pct}</td><td>{s.display_level_pct}</td><td>{Math.abs(s.display_level_pct-s.model_level_pct)}</td><td>{s.flow_lpm}</td><td>{s.input_feed}</td><td>{s.mode}</td></tr>)}</tbody></table></div>
  </section>;
}
