import type { Metadata } from "next";
import Link from "next/link";
import { AquaFrame } from "@/components/aqua-frame";
import { aquaScenario } from "@/lib/scenarios/aqua";
export const metadata: Metadata = { title: "PROJECT AQUA / Red Team" };
export default function RedPage() {
  return <AquaFrame track="red">
    <section className="aqua-intro"><div className="eyebrow">PART A / 30 MIN</div><h2>5つの手掛かりから、調査の根拠を集める。</h2>
      <p>あなたは訓練チームの新人調査員です。管理者が割り当てた閉域の演習用VMで、公開情報・Webページ・管理メモ・Linuxファイル・ログを順番に調査します。</p>
      <p>演習の提出物は5つのFLAGと調査レポートです。設定変更・制御命令の送信・サービス停止・権限昇格は禁止です。この画面からコマンドやSSH接続は実行しません。</p>
    </section>
    <div className="aqua-stages">{aquaScenario.redStages.map((stage, i) => <section className="panel aqua-stage" key={stage.id} aria-labelledby={`title-${stage.id}`}>
      <div className="aqua-stage-heading"><span className="aqua-stage-number">0{i + 1}</span><div><div className="eyebrow">STAGE 0{i + 1} / {stage.skill}</div><h2 id={`title-${stage.id}`}>{stage.title}</h2></div><span className="aqua-difficulty" aria-label={`難易度5段階中${stage.difficulty}`}>{"★".repeat(stage.difficulty)}{"☆".repeat(5-stage.difficulty)}</span></div>
      <h3>ミッション</h3><p>{stage.studentTask}</p>
      <h3>レポートに残す証拠</h3><p>{stage.report}</p>
      <div className="aqua-hints">{stage.hints.map((hint, n) => <details key={hint}><summary>ヒント {n + 1}</summary><p>{hint}</p></details>)}</div>
      <fieldset disabled className="aqua-submission"><legend>FLAG提出（プレビュー）</legend><label htmlFor={`flag-${stage.id}`}>Stage 0{i + 1}のFLAG</label><div><input id={`flag-${stage.id}`} placeholder="演習画面で入力できます" autoComplete="off" /><button className="button disabled" disabled>提出（演習画面へ）</button></div></fieldset>
    </section>)}</div>
    <section className="panel aqua-report"><h2>調査レポートの構成</h2><p>対象と許可範囲 → 観測結果 → 証拠 → UTCの時系列 → リスクと改善案。レポートの保存・提出は演習画面で行います。</p><Link className="text-link" href="/labs/water-treatment/blue">Blue Teamの教材へ →</Link></section>
  </AquaFrame>;
}
