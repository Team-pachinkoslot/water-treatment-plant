import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Crosshair,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { roadmap } from "@/lib/labs";
export const metadata = { title: "学習ガイド" };
export default function Guide() {
  return (
    <div className="page guide-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">GETTING STARTED</div>
          <h1>学習の進め方</h1>
          <p>調べた過程と判断の根拠を、ひとつずつ記録しましょう。</p>
        </div>
        <BookOpen size={27} className="text-orange" />
      </div>
      <div className="notice">
        現在はPhase 1です。以下は演習公開後の学習フローです。
      </div>
      <div className="guide-steps">
        {[
          {
            icon: Crosshair,
            title: "シナリオと対象範囲を確認する",
            text: "まずはLAB 01 / PROJECT AQUAから。七王子市中央浄水場を模した架空の訓練環境を調査します。対象ホストと許可された操作範囲を確認します。",
          },
          {
            icon: BookOpen,
            title: "5つの調査ステージを進める",
            text: "偵察、Web調査、情報発見、内部調査、証拠回収の順に学習します。見つけた手掛かりと、その判断に至った過程をメモします。",
          },
          {
            icon: FileText,
            title: "FLAGと調査レポートを提出する",
            text: "クリア条件は5つのFLAGと根拠を記載した調査レポートです。FLAGの正解値はカタログやAPIには掲載しません。提出機能は後続フェーズで実装します。",
          },
          {
            icon: ShieldCheck,
            title: "防御側の視点で判断する",
            text: "Blue Teamでは計測値とログの食い違いを調べ、モデルの分離と安全な模擬復旧へ進みます。判断の根拠と所要時間を記録します。",
          },
        ].map(({ icon: Icon, title, text }, i) => (
          <section key={title}>
            <span className="guide-number">0{i + 1}</span>
            <div>
              <Icon size={21} />
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </section>
        ))}
      </div>
      <section className="panel roadmap-panel">
        <div className="eyebrow">DEVELOPMENT ROADMAP</div>
        <h2>段階的に、学習環境をつくる。</h2>
        <div className="roadmap">
          {roadmap.map((item, i) => (
            <div key={item} className={i === 0 ? "current" : ""}>
              <span>PHASE {i + 1}</span>
              <strong>{item}</strong>
              <small>
                {i === 0 ? "現在 / 画面・モックAPI" : "今後の開発予定"}
              </small>
            </div>
          ))}
        </div>
      </section>
      <Link href="/labs/water-treatment" className="button primary">
        PROJECT AQUAを確認 <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
