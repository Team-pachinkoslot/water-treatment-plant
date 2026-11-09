"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Lab, stages } from "@/lib/labs";
import { PlantDiagram } from "./plant-diagram";
export function LabDetail({ lab }: { lab: Lab }) {
  const [tab, setTab] = useState("overview");
  const [openStage, setOpenStage] = useState<number | null>(0);
  const water = lab.category === "water";
  return (
    <div className={`page detail-page ${lab.category}`}>
      <Link className="back-link" href="/labs">
        <ArrowLeft size={14} /> 演習ラボに戻る
      </Link>
      <section className="detail-hero">
        <div>
          <div className="hero-kicker">
            <span className="orange-line" /> LAB {lab.number}{" "}
            <span>{lab.level}</span>
          </div>
          <h1>
            {water
              ? "PROJECT AQUA"
              : lab.category === "power"
                ? "POWER SUBSTATION"
                : "RAILWAY OPERATIONS"}
          </h1>
          <h2>{lab.title}</h2>
          <p>{lab.description}</p>
          <div className="skill-tags">
            {lab.skills.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
        <PlantDiagram category={lab.category} />
      </section>
      {water && <nav className="aqua-nav" aria-label="PROJECT AQUA 教材">
        <Link href="/labs/water-treatment/red">Red Team / 5つの課題 →</Link>
        <Link href="/labs/water-treatment/blue">Blue Team / 監視モック →</Link>
        <Link href="/labs/water-treatment/results">演習結果（準備中）</Link>
      </nav>}
      <div className="detail-layout">
        <div className="detail-main">
          <div className="detail-tabs" aria-label="シナリオ情報">
            {[
              { id: "overview", label: "概要" },
              { id: "curriculum", label: water ? "5つのステージ" : "学習内容" },
              { id: "safety", label: "演習ルール" },
            ].map((t) => (
              <button
                key={t.id}
                aria-pressed={tab === t.id}
                className={tab === t.id ? "selected" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <div className="detail-content">
              <div className="eyebrow">MISSION BRIEF</div>
              <h2>
                {water
                  ? "調査の先にある、防御の視点。"
                  : "情報の不整合を、判断の手掛かりに。"}
              </h2>
              <p>
                {water
                  ? "あなたは許可された訓練チームの新人調査員。七王子市中央浄水場を模した閉域の演習環境で公開サービス、Webページ、管理メモ、Linuxファイル、アクセスログから手掛かりを収集し、5つのFLAGと根拠を集めます。その後は防御担当としてHMI表示値と独立モデルの不一致を調査し、入力隔離、安全モード、正常確認を経て模擬復旧する流れを学びます。"
                  : lab.description}
              </p>
              <h3>このラボで学ぶこと</h3>
              <ul className="objective-list">
                {lab.objectives.map((o) => (
                  <li key={o}>
                    <span>
                      <Check size={14} />
                    </span>
                    {o}
                  </li>
                ))}
              </ul>
              <div className="track-grid">
                <div>
                  <Crosshair size={23} />
                  <div className="eyebrow">
                    {water ? "RED TEAM" : "INVESTIGATION"}
                  </div>
                  <h3>{water ? "調査と証拠収集" : "監視情報を照合"}</h3>
                  <p>
                    {water
                      ? "許可された範囲を調査し、FLAGと根拠を記録。設備制御の操作は行いません。"
                      : `対象：${lab.monitors.join(" / ")}。情報の信頼性とイベントの時系列を確認します。`}
                  </p>
                </div>
                <div>
                  <ShieldCheck size={23} />
                  <div className="eyebrow">
                    {water ? "BLUE TEAM" : "SAFE RESPONSE"}
                  </div>
                  <h3>{water ? "検知・判断・模擬復旧" : "安全な対応を判断"}</h3>
                  <p>
                    {water
                      ? "計測値とログの食い違いを検知。仮想モデルの分離と安全な復旧の判断根拠を整理します。"
                      : "架空の設備だけを対象に、異常の拡大防止と復旧に必要な条件を整理します。"}
                  </p>
                </div>
              </div>
            </div>
          )}
          {tab === "curriculum" && (
            <div className="detail-content">
              <div className="eyebrow">
                {water ? "ATTACK PATH / 5 STAGES" : "LEARNING OBJECTIVES"}
              </div>
              <h2>
                {water ? "手掛かりを、ひとつずつ。" : "調査から安全な判断へ。"}
              </h2>
              <p>
                以下は学習内容のプレビューです。演習環境と採点機能は未実装です。
              </p>
              {water ? (
                <div className="stage-list">
                  {stages.map((s, i) => (
                    <div
                      key={s.en}
                      className={`stage ${openStage === i ? "expanded" : ""}`}
                    >
                      <button
                        onClick={() => setOpenStage(openStage === i ? null : i)}
                        aria-expanded={openStage === i}
                      >
                        <span className="stage-number">0{i + 1}</span>
                        <span>
                          <small>{s.en}</small>
                          <strong>{s.title}</strong>
                        </span>
                        <span className="difficulty">
                          {"★".repeat(s.difficulty)}
                          {"☆".repeat(5 - s.difficulty)}
                        </span>
                        <ChevronDown size={17} />
                      </button>
                      {openStage === i && (
                        <div className="stage-body">
                          <p>{s.description}</p>
                          <ul>
                            {s.objectives.map((o) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ul>
                          <div className="stage-skills">
                            SKILLS <span>{s.skills}</span>
                          </div>
                          <div className="stage-lock">
                            <LockKeyhole size={13} />{" "}
                            FLAGの取得・提出は演習公開後に利用できます。
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="objective-list">
                  {lab.objectives.map((o, i) => (
                    <li key={o}>
                      <span>{i + 1}</span>
                      {o}
                    </li>
                  ))}
                </ul>
              )}
              <div className="notice">
                <FileText size={17} />
                {water
                  ? "クリア条件：5つのFLAG提出と、根拠を記載した調査レポート。"
                  : "調査した根拠と、対応・復旧の判断条件を記録します。"}
              </div>
            </div>
          )}
          {tab === "safety" && (
            <div className="detail-content">
              <div className="eyebrow">SANDBOX ONLY</div>
              <h2>架空の設備で、安全に学ぶ。</h2>
              <ul className="rules-list">
                <li>
                  <strong>指定されたVMのみを対象にする</strong>
                  <p>
                    ローカルで許可された演習環境だけを使用します。実在する施設・機器・外部ホストへの接続は演習範囲に含みません。
                  </p>
                </li>
                <li>
                  <strong>役割に応じた操作範囲を守る</strong>
                  <p>
                    Red Teamは調査と証拠収集のみ。設定変更・制御命令の送信・サービス停止・権限昇格は禁止です。Blue
                    Teamは仮想設備の安全な模擬操作を扱います。
                  </p>
                </li>
                <li>
                  <strong>ホスト側の通信も検証する</strong>
                  <p>
                    Host-onlyネットワークに加え、Macホスト側の経路とアクセス制御を確認します。
                  </p>
                </li>
                <li>
                  <strong>記録と復元を行う</strong>
                  <p>
                    後続フェーズで演習ログの保存と、検証済み基準スナップショットへの復元を実装します。
                  </p>
                </li>
              </ul>
            </div>
          )}
        </div>
        <aside className="scenario-sidebar">
          <div className="panel">
            <div className="coming-soon">
              <i className="dot amber" /> COMING SOON
            </div>
            <h3>演習環境を準備しています</h3>
            <p>現在はシナリオのプレビューのみご覧いただけます。</p>
            <button className="button disabled" disabled>
              <LockKeyhole size={15} /> 演習を開始（準備中）
            </button>
            <dl>
              {water && <div><dt>所要時間</dt><dd>50分（Red 30 / Blue 20）</dd></div>}
              <div>
                <dt>難易度</dt>
                <dd>{lab.level}</dd>
              </div>
              <div>
                <dt>対象施設</dt>
                <dd>{lab.subtitle}</dd>
              </div>
              <div>
                <dt>ステータス</dt>
                <dd>準備中</dd>
              </div>
              <div>
                <dt>ランタイム</dt>
                <dd>無効 / 未接続</dd>
              </div>
              <div>
                <dt>ラボID</dt>
                <dd className="mono">{lab.id}</dd>
              </div>
            </dl>
            <Link href="/dashboard" className="text-link">
              開発プレビュー <ArrowRight size={14} />
            </Link>
          </div>
          <div className="sidebar-tip">
            <ShieldCheck size={17} />
            <p>
              実際の設備への接続はありません。すべて架空の七王子市を舞台としています。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
