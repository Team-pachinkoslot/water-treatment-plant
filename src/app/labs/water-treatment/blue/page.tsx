import type { Metadata } from "next";
import { AquaFrame } from "@/components/aqua-frame";
import { AquaTelemetry } from "@/components/aqua-telemetry";
import { BlueProcessDiagram } from "@/components/blue-process-diagram";
import { GlossaryPanel, IncidentMemo, ProcessLegend, TrainingNotice } from "@/components/blue-hmi";
import { aquaScenario } from "@/lib/scenarios/aqua";
import { BLUE_SCORING, chlorineScenario, createStepRules, toTrendRows } from "@/lib/scenarios/blue-steps";
import { INCIDENT } from "@/lib/scenarios/incident";
import { readTelemetry, readTrainingAlert } from "@/lib/scenarios/telemetry.server";
export const metadata: Metadata = { title: "PROJECT AQUA / Blue Team" };

export default function BluePage() {
  const alert = readTrainingAlert();
  const trend = toTrendRows(readTelemetry());
  const recovery = toTrendRows(readTelemetry(true));
  const rules = createStepRules(chlorineScenario, { trend, recovery });
  return <AquaFrame track="blue">
    <section className="aqua-intro"><div className="eyebrow">PART B / {aquaScenario.durationMinutes.blue} MIN</div><h2>残留塩素の表示を確かめ、水質を守りながら安全に復旧する。</h2><p>中央浄水場の塩素消毒設備で、浄水池出口の残留塩素の監視表示と、流量・注入ポンプ回転数・塩素要求量から算出する独立モデルの推定値が一致しなくなりました。各STEPで「資料を見る → 判断・記入 → 判定」を行い、条件を満たしたときだけ次の状態へ進みます。</p></section>
    <IncidentMemo />
    <TrainingNotice />
    <BlueProcessDiagram state="anomaly_detected" trend={trend} recovery={recovery} />
    <ProcessLegend />
    <aside className="aqua-alert"><strong>サンプルアラート：{alert.title}</strong><p>{alert.message}</p><p>判定ルール：監視表示と独立モデル推定の差が{alert.trigger.threshold.toFixed(2)} {INCIDENT.unit}を超えるサンプルが{alert.trigger.consecutiveSamples}回連続。表示値は下限アラーム({INCIDENT.lowAlarmLimit.toFixed(2)} {INCIDENT.unit})を下回らないため、通常の警報では気付けません。</p></aside>
    <AquaTelemetry samples={readTelemetry()} />
    <section className="aqua-intro"><h2>対応フロー / 手順のプレビュー</h2><p>初期状態は anomaly_detected です。以下は説明のみで、状態は変更されません。判断・判定・状態遷移は演習画面で行います。</p></section>
    <ol className="aqua-actions">{rules.map((rule, i) => <li key={rule.code} className="panel"><div className="eyebrow">STEP 0{i + 1} / {rule.points}点</div><h3>{rule.title}</h3><p>{rule.hints[0]}</p><p>必要な判断：{rule.decisions.join("、")}</p><p className="aqua-state">{rule.from} → {rule.to}</p><button className="button disabled" disabled>{aquaScenario.blueActions[i].label}（プレビュー）</button></li>)}</ol>
    <AquaTelemetry samples={readTelemetry(true)} recovery />
    <section className="panel aqua-report"><h2>防御レポートに残すこと</h2><p>異常の根拠、影響範囲(出口残留塩素の推定最小値 {INCIDENT.minEstimatedResidual.toFixed(2)} {INCIDENT.unit} と水質基準相当 {INCIDENT.referenceResidual.toFixed(2)} {INCIDENT.unit} の関係)、隔離と安全モードの判断理由、復旧確認、再発防止の5項目です。自動採点は項目の充足のみで、記述の妥当性は講師が確認します。対応操作 {BLUE_SCORING.actionsTotal} 点 + 検知根拠・レポート {BLUE_SCORING.reportPoints} 点。</p></section>
    <details className="panel aqua-report instructor-note"><summary>講師向け：実在基準との違い</summary>
      <p>本演習の閾値(差 {INCIDENT.diffThreshold.toFixed(2)} {INCIDENT.unit}・{INCIDENT.consecutiveRequired}回連続、下限アラーム {INCIDENT.lowAlarmLimit.toFixed(2)} {INCIDENT.unit}、設定値 {INCIDENT.baselineSp.toFixed(2)} {INCIDENT.unit})は教材用に簡略化した架空値で、実在の水道事業の運用基準ではありません。</p>
      <p>参考となる水質基準等は、濁度2度以下、pH 5.8〜8.6、給水栓における遊離残留塩素 0.1 mg/L 以上などです。実際の浄水場では、注入率は水量・水質・塩素要求量・季節により施設ごとに設定され、管理目標値や警報値も事業体ごとに異なります。本演習では「浄水池出口」の推定値を給水栓の基準値と比べていますが、実際には配水過程で残留塩素が減少するため、出口ではより高い値で管理します。</p>
    </details>
    <GlossaryPanel />
  </AquaFrame>;
}
