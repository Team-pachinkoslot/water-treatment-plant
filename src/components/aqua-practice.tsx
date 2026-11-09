"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { aquaScenario } from "@/lib/scenarios/aqua";
import { AquaTerminal } from "./aqua-terminal";
import { BlueTeam, type BlueCall } from "./blue-team";
import { initialTerminal, type CommandHint, type TerminalResult } from "@/lib/scenarios/terminal-lessons";
import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";
import { INCIDENT } from "@/lib/scenarios/incident";
import { BLUE_SCORING, chlorineScenario, createStepRules } from "@/lib/scenarios/blue-steps";
import type { ReportFields, SessionView } from "@/lib/scenarios/session-types";

const emptyReport = (track: "red" | "blue"): ReportFields => ({ observations: "", evidence: "", timeline: "", improvements: "", ...(track === "blue" ? { impact: "" } : {}) });
type ReportKey = keyof ReportFields;
// 防御レポートは §5 の5項目。表示順はこのオブジェクトのキー順。
const reportLabels = (track: "red" | "blue"): Partial<Record<ReportKey, string>> => track === "blue"
  ? { observations: "異常の根拠", impact: "影響範囲", evidence: "隔離と安全モードの判断理由", timeline: "復旧確認", improvements: "再発防止" }
  : { observations: "観測結果・判断", evidence: "証拠・根拠", timeline: "UTCの時系列・実施手順", improvements: "改善案・復旧条件・残存リスク" };
const reportGuides: Partial<Record<ReportKey, string>> = {
  observations: `トレンド、差、連続回数(${INCIDENT.consecutiveRequired}回)、単発を除外した理由`,
  impact: `関わる設備(${INCIDENT.changedPlc}、塩素注入、浄水池出口)と水質項目。出口残留塩素の最小値(推定${INCIDENT.minEstimatedResidual.toFixed(2)} ${INCIDENT.unit})と、水質基準相当(${INCIDENT.referenceResidual.toFixed(2)} ${INCIDENT.unit})との関係`,
  evidence: "何を根拠に、なぜ隔離と安全モードの対応を選んだか",
  timeline: `${INCIDENT.consecutiveRequired}回連続の正常確認、現場手分析の結果`,
  improvements: "設定変更の二人承認、変更管理票、不要アカウントの削除、遠隔からの設定変更の制限、ネットワークの分離(ゾーニング)、独立した別系統との常時比較、ログ監視アラート",
};
const reportKeys = (track: "red" | "blue") => Object.keys(reportLabels(track)) as ReportKey[];
const stepTitles = createStepRules(chlorineScenario, { trend: [], recovery: [] });
type ApiData = { session?: SessionView; cloudState?: string; flag?: string; result?: TerminalResult; error?: { code: string; message: string } } & Partial<CommandHint>;
const STORAGE_KEY = "aqua-cloud-exercise-v1";
function savedState(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY); }
  catch { throw new Error("ブラウザの保存機能を利用できません。サイトデータの保存を許可してください。"); }
}
async function api(path: string, payload: Record<string, unknown> = {}): Promise<ApiData> {
  const cloudState = savedState();
  const response = await fetch(`/api/lab-sessions${path}`, {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...(cloudState ? { cloudState } : {}) }),
  });
  const data: ApiData = await response.json();
  // Rejected attempts update the encrypted checkpoint too, preserving per-browser limits.
  if (data.cloudState) {
    try { window.localStorage.setItem(STORAGE_KEY, data.cloudState); }
    catch { throw new Error("進捗を保存できませんでした。ブラウザの保存領域を確認し、新しい演習を開始してください。"); }
  }
  if (!response.ok) throw new Error(`${data.error?.message ?? "処理に失敗しました。"} (${data.error?.code ?? response.status})`);
  return data;
}
let bootstrapRequest: Promise<ApiData> | undefined;
function bootstrap(autoStart: boolean) {
  if (!bootstrapRequest) {
    bootstrapRequest = (async () => {
      if (savedState()) return api("/current/restore");
      return autoStart ? api("", { labId: "water-01" }) : {};
    })().finally(() => { bootstrapRequest = undefined; });
  }
  return bootstrapRequest;
}
function ReportForm({ track, saved, enabled, busy, onSave }: { track: "red" | "blue"; saved: ReportFields | null; enabled: boolean; busy: boolean; onSave: (report: ReportFields) => void }) {
  const [report, setReport] = useState<ReportFields>(saved ?? emptyReport(track));
  return <form id={`${track}-report`} className="panel aqua-report practice-report" onSubmit={e => { e.preventDefault(); onSave(report); }}>
    <h2>{track === "red" ? "調査レポート / Red Team" : "防御レポート / Blue Team"}</h2>
    <p>{saved ? "提出済みです。内容を更新して再提出できます。" : "各項目10文字以上で記録してください。保存は提出ボタンを押した時点で行います。"}</p>
    <p>演習の採点は入力項目の充足と検証済みの操作を評価します。文章の妥当性・証拠の品質は講師の確認が必要です。</p>
    <fieldset disabled={!enabled || busy}>{reportKeys(track).map(key => <label key={key} htmlFor={`${track}-${key}`}>{reportLabels(track)[key]}{track === "blue" && <small className="report-guide">{reportGuides[key]}</small>}<textarea id={`${track}-${key}`} value={report[key] ?? ""} minLength={10} maxLength={4000} required rows={3} onChange={e => setReport({ ...report, [key]: e.target.value })} /></label>)}<button className="button primary" disabled={!enabled || busy} type="submit">{track === "red" ? "調査" : "防御"}レポートを提出</button></fieldset>
    {!enabled && <p>{track === "red" ? "5つのFLAG提出後に利用できます。" : "模擬復旧後に利用できます。"}</p>}
  </form>;
}
export function AquaPractice({ enabled, autoStart = false, initialTrack = "red", samples, recoverySamples }: { enabled: boolean; autoStart?: boolean; initialTrack?: "red" | "blue" | "results"; samples: TelemetrySample[]; recoverySamples: TelemetrySample[] }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [track, setTrack] = useState<"red" | "blue" | "results">(initialTrack);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [flag, setFlag] = useState("");
  const [ports, setPorts] = useState("");
  const [risk, setRisk] = useState("");
  const [permission, setPermission] = useState("");
  const [sourceIp, setSourceIp] = useState("");
  const [firstTime, setFirstTime] = useState("");
  const [celebration, setCelebration] = useState<{ id: number; title: string; count: number } | null>(null);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 2800);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    bootstrap(autoStart).then(data => {
      if (!cancelled && data.session) setSession(data.session);
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : "保存済み進捗を取得できませんでした。再読込してください。");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, autoStart]);

  async function run(operation: () => Promise<ApiData>, success: string, done?: (data: ApiData) => void) {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await operation();
      if (data.session) setSession(data.session);
      done?.(data);
      setMessage(success);
    } catch (e) { setError(e instanceof Error ? e.message : "処理に失敗しました。"); }
    finally { setBusy(false); }
  }
  const path = session ? `/${session.id}` : "";
  function clearExercise() {
    setSelectedStage(null); setFlag(""); setPorts(""); setRisk(""); setPermission(""); setSourceIp(""); setFirstTime(""); setTrack("red");
  }
  function saveReport(which: "red" | "blue", report: ReportFields) {
    void run(() => api(`${path}/report`, { track: which, report }), "レポートを保存しました。再読込しても進捗を引き継げます。");
  }
  async function executeCommand(command: string): Promise<TerminalResult> {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api(`${path}/commands`, { stageId: selectedId, command });
      if (!data.result || !data.session) throw new Error("コマンドの結果を確認できませんでした。");
      setSession(data.session);
      return data.result;
    } finally { setBusy(false); }
  }
  async function generateHint(index: number): Promise<CommandHint> {
    setBusy(true);
    try {
      const data = await api(`${path}/hints`, { stageId: selectedId, index });
      if (data.session) setSession(data.session);
      if (!data.hint || !data.explanation || !data.step || data.level === undefined) throw new Error("ヒントを取得できませんでした。");
      return { hint: data.hint, explanation: data.explanation, step: data.step, level: data.level, ...(data.command ? { command: data.command } : {}) };
    } finally { setBusy(false); }
  }
  const selectedId = selectedStage && (session?.completedStages.includes(selectedStage) || session?.nextStage === selectedStage) ? selectedStage : session?.nextStage ?? "S05";
  const stage = aquaScenario.redStages.find(s => s.id === selectedId)!;
  const activeStage = session?.nextStage === selectedId;
  const blueEnabled = !!session && session.completedStages.length === 5 && !!session.reports.red;
  // 防御パートの API 呼び出し。エラーは STEP パネル内に表示するため、ここでは返すだけ。
  const blueCall: BlueCall = async (operation, payload) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api(`${path}/${operation}`, payload);
      if (data.session) setSession(data.session);
      if (operation === "blue-actions") setMessage("判断が条件を満たしました。演習状態を保存しました。");
      return { data: data as Record<string, unknown> };
    } catch (e) { return { error: e instanceof Error ? e.message : "処理に失敗しました。" }; }
    finally { setBusy(false); }
  };

  return <div className="page aqua-page practice-page">
    <Link className="back-link" href="/labs/water-treatment">← シナリオ概要に戻る</Link>
    <header className="aqua-header"><div className="eyebrow">PROJECT AQUA / BROWSER SIMULATOR <span className="aqua-badge">ブラウザ演習</span></div><h1>調査から復旧まで、ブラウザで演習する。</h1><p>七王子市中央浄水場（架空） / Red Team 30分 + Blue Team 20分</p></header>
    <div className="notice aqua-notice"><div><strong>実VM・設備への接続はありません</strong><br />Linuxに接続せず、教材の閲覧と模擬演習をブラウザで行います。進捗は暗号化してこのブラウザに保存されます。入力したコマンドは演習内で模擬実行し、実シェル・外部ホストへの接続は行いません。教材のイベント日時は2026-11-02の固定された架空データ（UTC）です。</div></div>
    {!enabled && <section className="panel aqua-report"><h2>演習は現在停止しています</h2><p>現在は教材プレビューを閲覧できます。演習が公開されるまでお待ちください。</p><button className="button disabled" disabled>演習を開始（停止中）</button></section>}
    {enabled && loading && <p role="status">保存済みの進捗を確認しています…</p>}
    {celebration && <div key={celebration.id} className="flag-celebration" onClick={() => setCelebration(null)} aria-hidden="true">
      <div className="flag-celebration-burst">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ "--i": i } as CSSProperties} />)}</div>
      <div className="flag-celebration-card">
        <svg className="flag-celebration-check" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
        <div className="eyebrow">FLAG ACCEPTED</div>
        <strong>正解！</strong>
        <p>{celebration.title}をクリア</p>
        <div className="flag-celebration-progress" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < celebration.count ? (i === celebration.count - 1 ? "is-new" : "is-done") : ""} />)}</div>
        <small>{celebration.count === 5 ? "5つのFLAGをすべて取得しました" : `FLAG ${celebration.count} / 5`}</small>
      </div>
    </div>}
    <div className="practice-feedback" aria-live="polite">{message && <p role="status">{message}</p>}{error && <p role="alert" className="practice-error">{error}</p>}</div>
    {enabled && !loading && !session && <section className="panel aqua-report"><h2>新しいブラウザ演習</h2><p>このブラウザ専用の演習を開始します。有効期限は24時間です。同じブラウザで再開できます。ブラウザの保存データを削除すると進捗は失われます。</p><button className="button primary" disabled={busy} onClick={() => void run(() => api("", { labId: "water-01" }), "演習を開始しました。")}>演習を開始</button></section>}
    {session && <>
      <section className="panel practice-progress"><div><strong>{session.complete ? "演習完了" : "演習中"}</strong><p>FLAG {session.completedStages.length} / 5 · {session.score.total} / 100点 · 模擬状態：{session.blueState}</p><small>有効期限：{new Date(session.expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST</small></div><button className="text-link" disabled={busy} onClick={() => void run(() => api(`${path}/reset`, {}), "新しい演習にリセットしました。", clearExercise)}>演習をリセット</button></section>
      <nav className="aqua-nav" aria-label="テスト演習トラック">{([['red','Red Team'],['blue','Blue Team'],['results','結果・レポート']] as const).map(([id,label]) => <button key={id} aria-pressed={track === id} onClick={() => { setTrack(id); setMessage(""); setError(""); }}>{label}</button>)}</nav>
      {track === "red" && <>
        <div className="terminal-stage-journey" aria-label="調査ステージを選択">{aquaScenario.redStages.map((item,i) => {
          const complete = session.completedStages.includes(item.id);
          const unlocked = complete || session.nextStage === item.id;
          return <button key={item.id} disabled={!unlocked || busy} aria-pressed={selectedId === item.id} className={complete ? "is-complete" : ""} onClick={() => { setSelectedStage(item.id); setFlag(""); setMessage(""); setError(""); }}><span>0{i+1}</span><strong>{item.title}</strong><small>{complete ? "提出済み" : unlocked ? "調査中" : "未解放"}</small></button>;
        })}</div>
        <section className="terminal-mission"><div><div className="eyebrow">STAGE {selectedId.slice(1)} / {stage.skill}</div><h2>{stage.title}：コマンドで手掛かりを探す</h2><p>{stage.studentTask}</p></div><span className="terminal-mission-rule">読み取り調査 / 模擬実行</span></section>
        <AquaTerminal key={`${session.id}-${selectedId}`} stageId={selectedId} terminal={session.terminal ?? initialTerminal()} busy={busy} execute={executeCommand} hint={generateHint}/>
        <section className="panel aqua-report terminal-evidence-panel"><div className="eyebrow">EVIDENCE SUBMISSION</div><h2>見つけた証拠を提出する</h2><p>ターミナルに表示された結果を読み、次の証拠を記録してください：{stage.report}</p>
          {!activeStage && <p>このステージは提出済みです。端末で再調査するか、上のステージを切り替えてください。</p>}
          {activeStage && <>
            {stage.id === "S05" && <form className="practice-evidence" onSubmit={e => { e.preventDefault(); void run(() => api(`${path}/stage5-evidence`, { sourceIp, firstEventTimestampUtc: firstTime }), "ログの根拠回答を確認しました。払い出されたFLAGを提出してください。", data => setFlag(data.flag ?? "")); }}><fieldset disabled={busy}><legend>Stage 05 / ログの根拠回答</legend><label htmlFor="source-ip">不審な送信元IP<input id="source-ip" value={sourceIp} onChange={e => setSourceIp(e.target.value)} required /></label><label htmlFor="first-time">最初の401のUTC時刻（ISO 8601）<input id="first-time" value={firstTime} placeholder="YYYY-MM-DDTHH:mm:ssZ" onChange={e => setFirstTime(e.target.value)} required /></label><button className="button secondary" type="submit" disabled={busy}>根拠を検証してFLAGを取得</button></fieldset></form>}
            <form className="practice-flag" onSubmit={e => { e.preventDefault(); void run(() => api(`${path}/flags`, { stageId: stage.id, flag, evidence: { ports, risk, permission } }), `${stage.title}を完了しました。`, data => { setFlag(""); setSelectedStage(null); setCelebration({ id: Date.now(), title: stage.title, count: data.session?.completedStages.length ?? 0 }); }); }}><fieldset disabled={busy}><legend>FLAGと証拠を提出</legend>
              {stage.id === "S01" && <label htmlFor="ports">公開ポート（カンマ区切り）<input id="ports" value={ports} onChange={e => setPorts(e.target.value)} required /></label>}
              {stage.id === "S03" && <label htmlFor="risk">情報公開のリスク（10文字以上）<textarea id="risk" value={risk} minLength={10} maxLength={4000} onChange={e => setRisk(e.target.value)} required /></label>}
              {stage.id === "S04" && <label htmlFor="permission">ファイル権限（数値または権限表示）<input id="permission" value={permission} onChange={e => setPermission(e.target.value)} required /></label>}
              <label htmlFor={`practice-flag-${stage.id}`}>出力で見つけたFLAG<input id={`practice-flag-${stage.id}`} value={flag} onChange={e => setFlag(e.target.value)} required autoComplete="off" maxLength={160} /></label><button className="button primary" type="submit" disabled={busy}>FLAGを提出</button></fieldset></form>
          </>}
        </section>
        <ReportForm key={`${session.id}-red`} track="red" saved={session.reports.red} enabled={session.completedStages.length === 5} busy={busy} onSave={report => saveReport("red", report)} />
        {blueEnabled && <button className="button primary practice-next" onClick={() => setTrack("blue")}>Blue Teamへ進む →</button>}
      </>}
      {track === "blue" && <>
        {!blueEnabled && <div className="notice">5つのFLAGとRed Team調査レポートの提出後に操作できます。監視データは先に閲覧できます。</div>}
        <BlueTeam key={session.id} session={session} enabled={blueEnabled} busy={busy} samples={samples} recoverySamples={recoverySamples} call={blueCall} />
        <ReportForm key={session.id + "-blue"} track="blue" saved={session.reports.blue} enabled={session.blueState === "recovered"} busy={busy} onSave={report => saveReport("blue", report)} />
        {session.complete && <button className="button primary practice-next" onClick={() => setTrack("results")}>結果を見る →</button>}
      </>}
      {track === "results" && <>
        <section className="panel aqua-report"><h2>{session.complete ? "ブラウザ演習を完了しました" : "途中経過"}</h2><div className="practice-score">{session.score.total}<small> / 100</small></div><dl className="practice-score-details"><div><dt>Red Team / 5FLAG</dt><dd>{session.score.redFlags} / 40</dd></div><div><dt>調査レポート項目の充足</dt><dd>{session.score.redReport} / 10</dd></div><div><dt>Blue Team / 対応操作</dt><dd>{session.score.blueActions} / {BLUE_SCORING.actionsTotal}</dd></div><div><dt>検知根拠・防御レポート項目の充足</dt><dd>{session.score.blueEvidence} / {BLUE_SCORING.reportPoints}</dd></div></dl>
          <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="Blue Team STEP別の得点"><table className="hmi-table"><caption>Blue Team STEP別の得点(減点: 不適切な選択 −{BLUE_SCORING.mistakePenalty}/回、ヒント「書き方」−{BLUE_SCORING.hintPenalty[2]}・「実行例」−{BLUE_SCORING.hintPenalty[3]}、下限は配点の半分)</caption><thead><tr><th>STEP</th><th>得点</th><th>不適切な選択</th><th>ヒント</th></tr></thead><tbody>{stepTitles.map((r, i) => { const p = session.blueProgress?.steps[r.code]; return <tr key={r.code}><td>0{i + 1} {r.title}</td><td>{p?.points ?? 0} / {r.points}</td><td>{r.penalizeMistakes ? `${p?.mistakes ?? 0}回` : "—"}</td><td>{["未使用", "考え方", "書き方", "実行例"][p?.hintLevel ?? 0]}</td></tr>; })}</tbody></table></div><p>これはブラウザ内シミュレーターの演習結果です。実VMの操作技能や文章の品質を認定するものではありません。</p>
          <button className="button secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `aqua-test-${session.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>結果とレポートをJSONで保存</button>
        </section>
        {(["red", "blue"] as const).map(which => <section className="panel aqua-report" key={which}><h2>{which === "red" ? "調査" : "防御"}レポート {session.reports[which] ? "提出済み" : "未提出"}</h2>{session.reports[which] && reportKeys(which).map(key => <div key={key}><h3>{reportLabels(which)[key]}</h3><p className="practice-report-text">{session.reports[which]![key]}</p></div>)}</section>)}
        <section className="panel aqua-report"><h2>操作履歴（直近100件）</h2><p>FLAG入力値・資格情報は履歴に記録しません。</p><ol className="practice-audit">{session.events.map((event,i) => <li key={`${event.at}-${i}`}><time>{event.at}</time> {event.type} {event.stageId}</li>)}</ol></section>
      </>}
    </>}
  </div>;
}
