import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Crosshair,
  Fingerprint,
  Layers3,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { labs } from "@/lib/labs";
import { LabCard } from "@/components/lab-card";
import { PlantDiagram } from "@/components/plant-diagram";
export default function Home() {
  return (
    <div className="page home-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CYBER RANGE</div>
          <h1>学びを、現場を守る力に。</h1>
          <p>産業システムの仕組みを知り、サイバーセキュリティを実践で学ぶ。</p>
        </div>
        <span className="phase-badge">
          <i className="dot amber" /> PHASE 1 <span>開発プレビュー</span>
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="orange-line" /> FEATURED SCENARIO{" "}
            <span>LAB 01</span>
          </div>
          <h2>
            PROJECT
            <br />
            <span>AQUA</span>
            <span className="hero-period">.</span>
          </h2>
          <h3>侵入者の視点を、守る力へ。</h3>
          <p>
            七王子市中央浄水場を舞台に、
            <br />
            5つの調査ステージから防御・復旧へつなぐ。
          </p>
          <Link className="button primary" href="/labs/water-treatment">
            シナリオを見る <ArrowUpRight size={17} />
          </Link>
          <div className="hero-meta">
            <span>初級</span>
            <span>RED + BLUE TEAM</span>
            <span>5 STAGES</span>
          </div>
        </div>
        <div className="hero-diagram">
          <div className="diagram-topline">
            <span>
              <i className="dot amber" /> TRAINING FACILITY
            </span>
            <span>WATER-01 / ARM64</span>
          </div>
          <PlantDiagram />
          <div className="diagram-bottomline">
            <span>
              <LockIcon /> VM未接続
            </span>
            <span>ILLUSTRATION / NOT LIVE</span>
          </div>
        </div>
      </section>
      <section className="stats-strip" aria-label="プラットフォーム概要">
        <div>
          <span className="stat-icon">
            <Layers3 size={20} />
          </span>
          <div>
            <strong>
              03 <span>演習シナリオ</span>
            </strong>
            <p>水道・電力・鉄道のインフラを学ぶ</p>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Crosshair size={20} />
          </span>
          <div>
            <strong>
              05 <span>調査ステージ</span>
            </strong>
            <p>基礎から段階的にスキルを習得</p>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <strong>
              100<span className="percent">%</span>{" "}
              <span>シミュレーション</span>
            </strong>
            <p>架空の設備とデータを使った学習</p>
          </div>
        </div>
      </section>
      <section className="catalog-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">EXPLORE THE LABS</div>
            <h2>
              次の挑戦を見つける<span>03</span>
            </h2>
          </div>
          <Link href="/labs" className="text-link">
            すべてのラボ <ArrowRight size={16} />
          </Link>
        </div>
        <div className="lab-grid">
          {labs.map((lab) => (
            <LabCard lab={lab} key={lab.id} />
          ))}
        </div>
      </section>
      <section className="learning-banner">
        <div className="learning-icon">
          <Fingerprint size={30} />
        </div>
        <div>
          <div className="eyebrow">INVESTIGATE. UNDERSTAND. DEFEND.</div>
          <h2>「見つける」から、「守る」まで。</h2>
          <p>Red Teamで攻撃の痕跡を読み、Blue Teamで安全な判断を学ぶ。</p>
        </div>
        <Link href="/guide" className="button secondary">
          <BookOpen size={15} /> 学習の進め方 <ArrowUpRight size={15} />
        </Link>
        <Shield className="banner-watermark" />
      </section>
      <div className="phase-note">
        <span>
          <i className="dot amber" /> DEVELOPMENT NOTE
        </span>
        <p>
          現在は画面・モックAPIの開発フェーズです。演習の実行とVM・設備への接続は、後続フェーズで提供します。
        </p>
      </div>
    </div>
  );
}
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4z" stroke="currentColor" />
    </svg>
  );
}
