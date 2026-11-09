import Link from "next/link";
import { getLab } from "@/lib/labs";
import { aquaScenario } from "@/lib/scenarios/aqua";

export function AquaFrame({ track, children }: { track: "red" | "blue" | "results"; children: React.ReactNode }) {
  const lab = getLab(aquaScenario.slug)!;
  return <div className="page aqua-page">
    <Link className="back-link" href="/labs/water-treatment">← シナリオ概要に戻る</Link>
    <header className="aqua-header">
      <div className="eyebrow">LAB 01 / PROJECT AQUA <span className="aqua-badge">準備中</span></div>
      <h1>{track === "red" ? "Red Team / 調査と証拠収集" : track === "blue" ? "Blue Team / 監視と模擬復旧" : "演習結果"}</h1>
      <p>{lab.subtitle}（架空） · 初級 · Red 30分 + Blue 20分 = 合計50分</p>
    </header>
    <nav className="aqua-nav" aria-label="PROJECT AQUA 教材">
      <Link href="/labs/water-treatment">概要</Link>
      <Link href="/labs/water-treatment/practice">テスト演習 →</Link>
      {([['red', 'Red Team'], ['blue', 'Blue Team'], ['results', '結果']] as const).map(([id,label]) => <Link key={id} href={`/labs/water-treatment/${id}`} aria-current={track === id ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="notice aqua-notice"><div><strong>教材プレビュー / 演習は準備中</strong><br />現在は説明と固定モックデータを閲覧できます。演習開始・FLAG提出・採点・状態変更は利用できません。</div></div>
    {children}
  </div>;
}
