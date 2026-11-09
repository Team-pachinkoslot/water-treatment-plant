"use client";
import { useId, useState } from "react";
import { Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import type { TerminalScene } from "@/lib/scenarios/terminal-lessons";

const descriptions: Record<TerminalScene, { title: string; target: string; operation: string; result: string }> = {
  idle: { title: "調査の流れをここで確認", target: "仮想サービス", operation: "コマンドを入力", result: "観測結果を読む" },
  recon: { title: "公開サービスの偵察", target: "TCP 22 / 8080", operation: "ポートの応答を調べる", result: "SSH・HTTPの入口を発見" },
  web: { title: "Webページの調査", target: "訓練用HTTP", operation: "ページを読み取り要求", result: "HTML・コメント・JSONを確認" },
  exposure: { title: "公開メモの情報露出", target: "公開領域", operation: "点検メモの本文を読む", result: "アカウント情報の管理リスクを発見" },
  ssh: { title: "一般ユーザーで内部調査へ", target: "模擬SSH", operation: "端末の接続先表示を切り替える", result: "許可されたフォルダを調査" },
  filesystem: { title: "ファイルと権限の調査", target: "Linux教材", operation: "場所・所有者・権限・本文を読む", result: "読み取り専用の証拠を収集" },
  logs: { title: "ログの証拠を絞り込む", target: "アクセスログ", operation: "記録を読み、文字列で抽出", result: "送信元と最初のUTC時刻を照合" },
  blocked: { title: "入力を確認", target: "入力チェック", operation: "書き方・対象・許可範囲を確認", result: "模擬状態は変更していません" },
  detect: { title: "残留塩素の乖離を検知", target: "HMIと独立モデル", operation: "監視表示と推定値を比較", result: "0.20 mg/L超の差が3連続と確認" },
  isolate: { title: "疑わしい表示入力を隔離", target: "表示用データ入力", operation: "信頼できない入力経路を切り離す", result: "監視表示の入力を隔離" },
  "safe-mode": { title: "安全側(手動運転)へ", target: "塩素注入(PLC-03)", operation: "MANで安全な固定注入率に", result: "水質を守りつつ復旧条件を待つ" },
  verify: { title: "正常性を検証", target: "復旧サンプル", operation: "差が閾値以内を3連続照合", result: "模擬復旧の条件を確認" },
  recover: { title: "自動運転へ復旧", target: "模擬監視モデル", operation: "検証後に監視状態を戻す", result: "演習上の正常監視(AUTO)へ復帰" },
};
export function AttackVisualization({ scene = "idle", phase = "complete", title, explanation, sequence = 0 }: { scene?: TerminalScene; phase?: "sending" | "processing" | "complete" | "error"; title?: string; explanation?: string; sequence?: number }) {
  const id = useId().replace(/:/g, "");
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const [detail, setDetail] = useState("対象サービス");
  const data = descriptions[scene];
  const defensive = ["detect", "isolate", "safe-mode", "verify", "recover"].includes(scene);
  const isolated = ["isolate", "safe-mode", "verify"].includes(scene);
  const active = scene !== "idle" && scene !== "blocked" && !isolated;
  const details: Record<string, string> = {
    "調査端末": "入力したコマンドは演習用の構文として解釈します。OSのシェルや外部ホストへは渡しません。",
    "対象サービス": `${data.target}を対象に、「${data.operation}」という処理を図解しています。応答は教材から生成されます。`,
    "施設モデル": "架空の浄水場を示すCGです。Red Teamの調査は情報の読み取りに限られ、ポンプや制御器への命令は送りません。",
  };
  return <section className={`operation-visual panel scene-${scene} ${paused ? "is-paused" : ""}`} aria-label="現在の操作の図解">
    <div className="operation-visual-heading"><div><div className="eyebrow">OPERATION VISUALIZER</div><h3>{title ?? data.title}</h3></div><span className={`operation-phase phase-${phase}`}>{scene === "idle" ? "コマンド待ち" : phase === "sending" ? "要求を再現中" : phase === "processing" ? "処理を再現中" : phase === "error" ? "入力エラー" : "直前の操作"}</span></div>
    <div className="operation-controls"><button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "動きを再開" : "動きを止める"}</button><button onClick={() => setReplay(replay + 1)}><RotateCcw size={13} /> 図解を再生</button></div>
    <div className="operation-map" tabIndex={0} role="region" aria-label="操作経路のCG図解。狭い画面では横スクロールできます。">
      <svg viewBox="0 0 700 300" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{data.title}</title><desc id={`${id}-desc`}>{data.operation}。{data.result}。{isolated ? "疑わしい入力は隔離中です。" : "実際の設備には接続していません。"}</desc>
        <defs><linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#314850" /><stop offset="1" stopColor="#17272e" /></linearGradient><linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#79d4dc" stopOpacity=".7"/><stop offset="1" stopColor="#2f7785" stopOpacity=".3"/></linearGradient><pattern id={`${id}-grid`} width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#344b53" strokeOpacity=".24" /></pattern></defs>
        <rect width="700" height="300" fill={`url(#${id}-grid)`} />
        <path d="M35 240L375 290L670 208L333 162Z" fill="#26373e" opacity=".3" />
        <path d="M158 112C205 43 250 43 302 112" fill="none" stroke={isolated ? "#ad7e60" : "#8ab8bd"} strokeWidth="2" strokeDasharray={isolated ? "5 9" : "4 4"} opacity=".65" />
        <path d="M302 158C252 227 208 227 158 158" fill="none" stroke="#e4a177" strokeWidth="2" strokeDasharray="5 6" opacity=".5" />
        <path d="M449 142H515" fill="none" stroke="#53656d" strokeDasharray="5 6" /><path d="M479 130L491 153M491 130L479 153" stroke="#a4b1b8" strokeWidth="2" />
        <g key={`${sequence}-${replay}-${scene}`} className={active ? "operation-packets" : "operation-no-packets"}>
          {[0,1,2].map(i => <circle key={i} className="packet packet-out" r="4" fill="#a1e0df" style={{ animationDelay: `${i * .32}s` }} />)}
          {[0,1].map(i => <circle key={i} className="packet packet-back" r="3" fill="#e4a177" style={{ animationDelay: `${.7+i*.4}s` }} />)}
        </g>
        {isolated && <g><circle cx="231" cy="66" r="13" fill="#281f1b" stroke="#e4a177"/><path d="M224 59L238 73M238 59L224 73" stroke="#e4a177" strokeWidth="2"/></g>}
        <g className="visual-endpoint"><rect x="39" y="79" width="119" height="82" rx="8" fill="#162229" stroke="#708f99" strokeWidth="2"/><rect x="48" y="88" width="101" height="60" rx="3" fill="#20343c"/><path d="M63 108l10 9-10 9m18 0h26" fill="none" stroke="#8ab8bd" strokeWidth="3"/><path d="M90 162v17m-25 1h51" stroke="#708f99" strokeWidth="5"/><text x="98" y="210" textAnchor="middle" fill="#d8e8e9" fontSize="15">{defensive ? "監視担当" : "調査端末 / Kali"}</text><text x="98" y="234" textAnchor="middle" fill="#91a6af" fontSize="12">コマンド・観測値</text></g>
        <g className={`visual-target ${phase === "processing" ? "processing" : ""}`}><path d="M302 83l91-24 55 28-91 25z" fill="#3f5965" stroke="#718e99"/><path d="M302 83v104l55 31V112z" fill={`url(#${id}-metal)`} stroke="#718e99"/><path d="M357 112l91-25v104l-91 27z" fill="#223b46" stroke="#718e99"/>{[0,1,2].map(i => <g key={i}><path d={`M371 ${130+i*23}l61-17v13l-61 17z`} fill="#13252d" stroke="#4b6b78"/><circle cx="423" cy={120+i*23} r="2.5" fill={scene === "blocked" ? "#e4a177" : "#8ab8bd"}/></g>)}<text x="372" y="252" textAnchor="middle" fill="#d8e8e9" fontSize="15">{data.target}</text><text x="372" y="275" textAnchor="middle" fill="#91a6af" fontSize="12">{defensive ? "監視モデルの状態" : "読み取り専用の教材"}</text></g>
        <g className="visual-plant"><path d="M525 180l62-24 71 24-62 25z" fill="#2b4b55" stroke="#5d7f8c"/><path d="M525 180v39l71 26v-40z" fill="#1b333e" stroke="#5d7f8c"/><path d="M596 205l62-25v39l-62 26z" fill="#274553" stroke="#5d7f8c"/><path d="M544 163v-47c0-21 81-21 81 0v47c0 22-81 22-81 0z" fill={`url(#${id}-metal)`} stroke="#6a919e"/><path className="visual-water" d="M545 142c0 19 79 19 79 0v20c0 21-79 21-79 0z" fill={`url(#${id}-water)`}/><ellipse cx="584.5" cy="116" rx="40.5" ry="13" fill="#2b454f" stroke="#7eabb7"/><path d="M625 161h20v34" fill="none" stroke="#6a919e" strokeWidth="6"/><text x="588" y="270" textAnchor="middle" fill="#91a6af" fontSize="13">架空の施設モデル</text></g>
        <text x="526" y="57" fill="#a9bac0" fontSize="12">実設備への命令なし</text>
      </svg>
    </div>
    <ol className="operation-steps"><li><span>01</span> コマンド入力</li><li><span>02</span> {data.operation}</li><li><span>03</span> {data.result}</li></ol>
    <p className="operation-explanation" aria-live="polite">{explanation ?? `${data.operation}。${data.result}。`}</p>
    <div className="operation-node-buttons" aria-label="図の要素を詳しく見る">{Object.keys(details).map(name => <button key={name} aria-pressed={detail === name} onClick={() => setDetail(name)}>{name}</button>)}</div><p className="operation-node-detail">{details[detail]}</p>
    <div className="operation-boundary"><ShieldCheck size={14}/> 模擬動作の図解 / 実際の通信・設備制御は行いません</div>
  </section>;
}
