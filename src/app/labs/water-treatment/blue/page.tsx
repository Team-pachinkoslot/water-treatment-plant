import type { Metadata } from "next";
import { AquaFrame } from "@/components/aqua-frame";
import { AquaTelemetry } from "@/components/aqua-telemetry";
import { aquaScenario } from "@/lib/scenarios/aqua";
import { readTelemetry, readTrainingAlert } from "@/lib/scenarios/telemetry.server";
export const metadata: Metadata = { title: "PROJECT AQUA / Blue Team" };
const explanations = [
  "独立モデルとHMI表示を比較し、3連続の不一致の時刻と根拠を整理します。",
  "信頼できない表示用の訓練データ入力を、モデル内で隔離する手順です。",
  "隔離後に、模擬モニターを要確認の安全側判断へ移す手順です。",
  "復旧確認用サンプルで3連続の一致を確認し、根拠を記録します。",
  "正常確認と報告後に模擬監視へ戻します。証拠が足りない場合は復旧しません。",
];
export default function BluePage() {
  const alert = readTrainingAlert();
  return <AquaFrame track="blue">
    <section className="aqua-intro"><div className="eyebrow">PART B / 20 MIN</div><h2>表示値を確かめ、安全な復旧を判断する。</h2><p>中央浄水場の訓練用監視画面で、水位表示と独立した設備モデルの推定水位が一致しなくなりました。証拠を確認し、隔離・安全モード・正常性確認を経て模擬復旧する流れを学びます。</p></section>
    <aside className="aqua-alert"><strong>サンプルアラート：{alert.title}</strong><p>{alert.message}</p><p>判定ルール：表示値とモデル値の差が{alert.trigger.threshold}パーセントポイントを超えるサンプルが{alert.trigger.consecutiveSamples}回連続。ゲーム内の仮の判定値であり、実設備の安全基準ではありません。</p></aside>
    <AquaTelemetry samples={readTelemetry()} />
    <section className="aqua-intro"><h2>対応フロー / 手順のプレビュー</h2><p>初期状態の想定：anomaly_detected（異常検知）。以下は説明のみで、状態は変更されません。本操作は訓練用モデル内にのみ反映される設計です。実際の設備は操作しません。</p></section>
    <ol className="aqua-actions">{aquaScenario.blueActions.map((action,i) => <li key={action.code} className="panel"><div className="eyebrow">STEP 0{i + 1}</div><h3>{action.label}</h3><p>{explanations[i]}</p><p className="aqua-state">{action.from} → {action.to}</p><button className="button disabled" disabled>{action.label}（準備中）</button></li>)}</ol>
    <AquaTelemetry samples={readTelemetry(true)} recovery />
    <section className="panel aqua-report"><h2>防御レポートに残すこと</h2><p>不一致の系列・UTC時刻と検知根拠、隔離対象、選択した対応、3連続正常サンプル、復旧条件を整理します。復旧確認用データは教材であり、復旧完了の証拠ではありません。レポートの保存・提出は準備中です。</p></section>
  </AquaFrame>;
}
