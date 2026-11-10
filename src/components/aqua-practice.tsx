"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { aquaScenario } from "@/lib/scenarios/aqua";
import { AquaTerminal } from "./aqua-terminal";
import { BlueTeam, formatElapsed, type BlueCall } from "./blue-team";
import { initialTerminal, type CommandHint, type TerminalResult } from "@/lib/scenarios/terminal-lessons";
import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";
import { INCIDENT, reportReviewPoints } from "@/lib/scenarios/incident";
import { BLUE_SCORING, createBlueScenario } from "@/lib/scenarios/blue-steps";
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
// 結果画面の内訳表示用(STEP・判断の名前と配点)。時刻の選択肢は使わないので空のデータで組み立てる。
const blueDefs = createBlueScenario({ trend: [], recovery: [] });
type ApiData = { session?: SessionView; cloudState?: string; flag?: string; result?: TerminalResult; error?: { code: string; message: string } } & Partial<CommandHint>;
// 保存先は通常の演習と練習モードで分ける(練習は通常の進捗に影響させない)。
type Slot = "normal" | "practice";
// アップデートで仕様が変わっても回答データを引き継ぐため、保存キー名は変えない。
// 中身の形式の違いはサーバー側(migrateSession)で吸収する。
// やむを得ずキー名を変えるときは、旧キーを LEGACY_STORAGE_KEYS に追加すれば初回読込時に移し替える。
const STORAGE_KEYS: Record<Slot, string> = { normal: "aqua-cloud-exercise-v1", practice: "aqua-blue-practice-v1" };
const LEGACY_STORAGE_KEYS: Record<Slot, readonly string[]> = { normal: [], practice: [] };
function savedState(slot: Slot): string | null {
  try {
    const storage = window.localStorage;
    const current = storage.getItem(STORAGE_KEYS[slot]);
    if (current) return current;
    for (const legacy of LEGACY_STORAGE_KEYS[slot]) {
      const value = storage.getItem(legacy);
      if (!value) continue;
      storage.setItem(STORAGE_KEYS[slot], value);
      storage.removeItem(legacy);
      return value;
    }
    return null;
  }
  catch { throw new Error("ブラウザの保存機能を利用できません。サイトデータの保存を許可してください。"); }
}
function clearSavedState(slot: Slot) {
  try { for (const k of [STORAGE_KEYS[slot], ...LEGACY_STORAGE_KEYS[slot]]) window.localStorage.removeItem(k); } catch { /* 保存領域が使えない場合は何もしない */ }
}
async function api(path: string, payload: Record<string, unknown> = {}, slot: Slot = "normal"): Promise<ApiData> {
  const cloudState = savedState(slot);
  const response = await fetch(`/api/lab-sessions${path}`, {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...(slot === "practice" ? { slot } : {}), ...(cloudState ? { cloudState } : {}) }),
  });
  const data: ApiData = await response.json();
  // Rejected attempts update the encrypted checkpoint too, preserving per-browser limits.
  if (data.cloudState) {
    try { window.localStorage.setItem(STORAGE_KEYS[slot], data.cloudState); }
    catch { throw new Error("進捗を保存できませんでした。ブラウザの保存領域を確認し、新しい演習を開始してください。"); }
  }
  if (!response.ok) throw new Error(`${data.error?.message ?? "処理に失敗しました。"} (${data.error?.code ?? response.status})`);
  return data;
}
const bootstrapRequests: Partial<Record<Slot, Promise<ApiData>>> = {};
function bootstrap(autoStart: boolean, slot: Slot) {
  bootstrapRequests[slot] ??= (async () => {
    if (savedState(slot)) return api("/current/restore", {}, slot);
    return autoStart ? api("", { labId: "water-01" }, slot) : {};
  })().finally(() => { delete bootstrapRequests[slot]; });
  return bootstrapRequests[slot]!;
}
function ReportForm({ track, saved, enabled, busy, onSave }: { track: "red" | "blue"; saved: ReportFields | null; enabled: boolean; busy: boolean; onSave: (report: ReportFields) => void }) {
  const [report, setReport] = useState<ReportFields>(saved ?? emptyReport(track));
  // 防御レポートは提出後に変更できない(リセットで新しい演習を始めたときだけ再提出できる)。
  const locked = track === "blue" && !!saved;
  const short = reportKeys(track).filter(key => (report[key] ?? "").trim().length < 10);
  return <form id={`${track}-report`} className="panel aqua-report practice-report" onSubmit={e => {
    e.preventDefault();
    if (track === "blue" && !window.confirm("提出後は変更できません。防御レポートを提出しますか?")) return;
    onSave(report);
  }}>
    <h2>{track === "red" ? "調査レポート / Red Team" : "防御レポート / Blue Team"}</h2>
    <p>{locked ? "✓ 提出済みです。提出後は変更できません(演習をリセットすると再挑戦できます)。" : saved ? "提出済みです。内容を更新して再提出できます。" : "各項目10文字以上で記録してください。保存は提出ボタンを押した時点で行います。"}</p>
    <p>演習の採点は入力項目の充足と検証済みの操作を評価します。文章の妥当性・証拠の品質は講師の確認が必要です。</p>
    <fieldset disabled={!enabled || busy || locked}>{reportKeys(track).map(key => <label key={key} htmlFor={`${track}-${key}`}>{reportLabels(track)[key]}{track === "blue" && <small className="report-guide">{reportGuides[key]}</small>}<textarea id={`${track}-${key}`} value={report[key] ?? ""} minLength={10} maxLength={4000} required rows={3} onChange={e => setReport({ ...report, [key]: e.target.value })} /><small className="blue-help">{(report[key] ?? "").trim().length} 文字{(report[key] ?? "").trim().length < 10 ? "(10文字以上)" : " ✓"}</small></label>)}{!locked && <button className="button primary" disabled={!enabled || busy} type="submit">{track === "red" ? "調査" : "防御"}レポートを提出</button>}{!locked && enabled && short.length > 0 && <p className="blue-help">10文字に満たない項目: {short.map(k => reportLabels(track)[k]).join("、")}</p>}</fieldset>
    {!enabled && <p>{track === "red" ? "5つのFLAG提出後に利用できます。" : "模擬復旧後に利用できます。"}</p>}
  </form>;
}
export function AquaPractice({ enabled, autoStart = false, initialTrack = "red", initialPractice = false, samples, recoverySamples }: { enabled: boolean; autoStart?: boolean; initialTrack?: "red" | "blue" | "results"; initialPractice?: boolean; samples: TelemetrySample[]; recoverySamples: TelemetrySample[] }) {
  const [slot, setSlot] = useState<Slot>(initialPractice ? "practice" : "normal");
  const practice = slot === "practice";
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [track, setTrack] = useState<"red" | "blue" | "results">(initialPractice && initialTrack === "red" ? "blue" : initialTrack);
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
    // 練習モードは「Blueだけ練習する」を押したときに始まるため、保存済みがなければ新規に開始する。
    bootstrap(autoStart || slot === "practice", slot).then(data => {
      if (!cancelled) setSession(data.session ?? null);
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : "保存済み進捗を取得できませんでした。再読込してください。");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, autoStart, slot]);

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
  const call = (p: string, payload: Record<string, unknown> = {}) => api(p, payload, slot);
  function clearExercise() {
    setSelectedStage(null); setFlag(""); setPorts(""); setRisk(""); setPermission(""); setSourceIp(""); setFirstTime(""); setTrack(practice ? "blue" : "red");
  }
  /** 練習モードの開始・終了。URL にも反映し、再読込しても同じモードで再開する */
  function switchSlot(next: Slot) {
    setSession(null); setLoading(true); setError(""); setMessage("");
    setTrack("blue");
    setSlot(next);
    const url = new URL(window.location.href);
    if (next === "practice") { url.searchParams.set("practice", "1"); url.searchParams.set("track", "blue"); }
    else url.searchParams.delete("practice");
    window.history.replaceState(null, "", url);
  }
  function startPractice() {
    if (!window.confirm("Blueだけ練習します。この練習の得点は、認定・合計の得点には反映されません。通常の演習の進捗はそのまま残ります。開始しますか?")) return;
    switchSlot("practice");
  }
  function endPractice() {
    if (!window.confirm("練習モードを終了します。練習の進捗は破棄されます(通常の演習の進捗には影響しません)。終了しますか?")) return;
    clearSavedState("practice");
    switchSlot("normal");
  }
  function saveReport(which: "red" | "blue", report: ReportFields) {
    void run(() => call(`${path}/report`, { track: which, report }), which === "blue" ? "防御レポートを提出しました。結果・レポート画面に反映しました。" : "レポートを保存しました。再読込しても進捗を引き継げます。", () => { if (which === "blue") setTrack("results"); });
  }
  async function executeCommand(command: string): Promise<TerminalResult> {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await call(`${path}/commands`, { stageId: selectedId, command });
      if (!data.result || !data.session) throw new Error("コマンドの結果を確認できませんでした。");
      setSession(data.session);
      return data.result;
    } finally { setBusy(false); }
  }
  async function generateHint(index: number): Promise<CommandHint> {
    setBusy(true);
    try {
      const data = await call(`${path}/hints`, { stageId: selectedId, index });
      if (data.session) setSession(data.session);
      if (!data.hint || !data.explanation || !data.step || data.level === undefined) throw new Error("ヒントを取得できませんでした。");
      return { hint: data.hint, explanation: data.explanation, step: data.step, level: data.level, ...(data.command ? { command: data.command } : {}) };
    } finally { setBusy(false); }
  }
  const selectedId = selectedStage && (session?.completedStages.includes(selectedStage) || session?.nextStage === selectedStage) ? selectedStage : session?.nextStage ?? "S05";
  const stage = aquaScenario.redStages.find(s => s.id === selectedId)!;
  const activeStage = session?.nextStage === selectedId;
  const blueEnabled = !!session && (session.exerciseMode === "practice" || (session.completedStages.length === 5 && !!session.reports.red));
  // 防御パートの API 呼び出し。エラーは STEP パネル内に表示するため、ここでは返すだけ。
  const blueCall: BlueCall = async (operation, payload) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await call(`${path}/${operation}`, payload);
      if (data.session) setSession(data.session);
      if (operation === "blue-actions") setMessage("STEPの判断がすべて正解になり、状態を進めました。演習状態を保存しました。");
      return { data: data as Record<string, unknown> };
    } catch (e) { return { error: e instanceof Error ? e.message : "処理に失敗しました。" }; }
    finally { setBusy(false); }
  };
  const tracks = (practice ? [["blue", "Blue Team(練習)"], ["results", "結果(練習)"]] : [["red", "Red Team"], ["blue", "Blue Team"], ["results", "結果・レポート"]]) as [typeof track, string][];

  return <div className="page aqua-page practice-page">
    {practice && <div className="practice-mode-bar" role="status"><span className="practice-mode-badge">練習モード</span><span>Blueだけの練習です。得点は「練習」として別枠に記録し、合計(100点)と完了判定には加算しません。</span><button type="button" className="text-link" disabled={busy} onClick={endPractice}>練習モードを終了</button></div>}
    <Link className="back-link" href="/labs/water-treatment">← シナリオ概要に戻る</Link>
    <header className="aqua-header"><div className="eyebrow">PROJECT AQUA / BROWSER SIMULATOR <span className="aqua-badge">{practice ? "練習モード" : "ブラウザ演習"}</span></div><h1>{practice ? "Blue Team を練習する。" : "調査から復旧まで、ブラウザで演習する。"}</h1><p>七王子市中央浄水場（架空） / {practice ? `Blue Team ${aquaScenario.durationMinutes.blue}分(練習)` : "Red Team 30分 + Blue Team 20分"}</p></header>
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
    {enabled && !loading && !session && <section className="panel aqua-report"><h2>{practice ? "Blue Team の練習" : "新しいブラウザ演習"}</h2><p>{practice ? "練習用の演習を開始します。通常の演習とは別に保存されます。" : "このブラウザ専用の演習を開始します。有効期限は24時間です。同じブラウザで再開できます。ブラウザの保存データを削除すると進捗は失われます。"}</p><button className="button primary" disabled={busy} onClick={() => void run(() => call("", { labId: "water-01" }), "演習を開始しました。")}>演習を開始</button></section>}
    {session && <>
      <section className="panel practice-progress"><div><strong>{practice ? "練習中" : session.complete ? "演習完了" : "演習中"}</strong><p>{practice ? `Blue対応 ${session.score.blueActions} / ${BLUE_SCORING.actionsTotal}点(練習) · 模擬状態：${session.blueState}` : `FLAG ${session.completedStages.length} / 5 · ${session.score.total} / 100点 · 模擬状態：${session.blueState}`}</p><small>有効期限：{new Date(session.expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST</small></div><button className="text-link" disabled={busy} onClick={() => { if (window.confirm(practice ? "練習を最初からやり直します。よろしいですか?" : "演習をリセットします。進捗・得点・提出したレポートは初期状態に戻ります。よろしいですか?")) void run(() => call(`${path}/reset`, {}), practice ? "練習をリセットしました。" : "新しい演習にリセットしました。", clearExercise); }}>{practice ? "練習をリセット" : "演習をリセット"}</button></section>
      <nav className="aqua-nav" aria-label="テスト演習トラック">{tracks.map(([id, label]) => <button key={id} aria-pressed={track === id} onClick={() => { setTrack(id); setMessage(""); setError(""); }}>{label}</button>)}</nav>
      {track === "red" && !practice && <>
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
            {stage.id === "S05" && <form className="practice-evidence" onSubmit={e => { e.preventDefault(); void run(() => call(`${path}/stage5-evidence`, { sourceIp, firstEventTimestampUtc: firstTime }), "ログの根拠回答を確認しました。払い出されたFLAGを提出してください。", data => setFlag(data.flag ?? "")); }}><fieldset disabled={busy}><legend>Stage 05 / ログの根拠回答</legend><label htmlFor="source-ip">不審な送信元IP<input id="source-ip" value={sourceIp} onChange={e => setSourceIp(e.target.value)} required /></label><label htmlFor="first-time">最初の401のUTC時刻（ISO 8601）<input id="first-time" value={firstTime} placeholder="YYYY-MM-DDTHH:mm:ssZ" onChange={e => setFirstTime(e.target.value)} required /></label><button className="button secondary" type="submit" disabled={busy}>根拠を検証してFLAGを取得</button></fieldset></form>}
            <form className="practice-flag" onSubmit={e => { e.preventDefault(); void run(() => call(`${path}/flags`, { stageId: stage.id, flag, evidence: { ports, risk, permission } }), `${stage.title}を完了しました。`, data => { setFlag(""); setSelectedStage(null); setCelebration({ id: Date.now(), title: stage.title, count: data.session?.completedStages.length ?? 0 }); }); }}><fieldset disabled={busy}><legend>FLAGと証拠を提出</legend>
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
        {!practice && <div className="practice-mode-entry"><p>Red Team を終えていなくても、Blue Team の判断・判定だけを練習できます(講師の確認・デモ・復習向け)。</p><button type="button" className="button secondary" disabled={busy} onClick={startPractice}>Blueだけ練習する</button></div>}
        {!blueEnabled && <div className="notice">5つのFLAGとRed Team調査レポートの提出後に操作できます。資料は先に閲覧できます。</div>}
        <BlueTeam key={session.id} session={session} enabled={blueEnabled} busy={busy} samples={samples} recoverySamples={recoverySamples} call={blueCall} />
        <ReportForm key={session.id + "-blue"} track="blue" saved={session.reports.blue} enabled={session.blueState === "recovered"} busy={busy} onSave={report => saveReport("blue", report)} />
        {(session.complete || session.reports.blue) && <button className="button primary practice-next" onClick={() => setTrack("results")}>結果を見る →</button>}
      </>}
      {track === "results" && <>
        <section className="panel aqua-report">
          {practice
            ? <><h2>練習の結果</h2><div className="practice-score">{session.score.blueActions}<small> / {BLUE_SCORING.actionsTotal}(練習)</small></div><p>練習モードの得点は、認定・合計(100点)の得点には反映されません。</p></>
            : <><h2>{session.complete ? "ブラウザ演習を完了しました" : "途中経過"}</h2><div className="practice-score">{session.score.total}<small> / 100</small></div><dl className="practice-score-details"><div><dt>Red Team / 5FLAG</dt><dd>{session.score.redFlags} / 40</dd></div><div><dt>調査レポート項目の充足</dt><dd>{session.score.redReport} / 10</dd></div><div><dt>Blue Team / 対応操作</dt><dd>{session.score.blueActions} / {BLUE_SCORING.actionsTotal}</dd></div><div><dt>検知根拠・防御レポート項目の充足</dt><dd>{session.score.blueEvidence} / {BLUE_SCORING.reportPoints}</dd></div></dl></>}
          <BlueResults session={session} />
          <p>これはブラウザ内シミュレーターの演習結果です。実VMの操作技能や文章の品質を認定するものではありません。</p>
          <button className="button secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `aqua-${practice ? "practice" : "test"}-${session.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>結果とレポートをJSONで保存</button>
        </section>
        {(practice ? (["blue"] as const) : (["red", "blue"] as const)).map(which => <section className="panel aqua-report" key={which}><h2>{which === "red" ? "調査" : "防御"}レポート {session.reports[which] ? "提出済み" : "未提出"}</h2>{session.reports[which] && reportKeys(which).map(key => <div key={key}><h3>{reportLabels(which)[key]}</h3><p className="practice-report-text">{session.reports[which]![key]}</p>{which === "blue" && <p className="review-points"><small>講師の確認の観点(参考・採点には使いません):</small> {reportReviewPoints[key as keyof typeof reportReviewPoints].join(" / ")}</p>}</div>)}</section>)}
        <section className="panel aqua-report"><h2>操作履歴（直近100件）</h2><p>FLAG入力値・資格情報は履歴に記録しません。</p><ol className="practice-audit">{session.events.map((event,i) => <li key={`${event.at}-${i}`}><time>{event.at}</time> {event.type} {event.stageId}</li>)}</ol></section>
      </>}
    </>}
  </div>;
}

/** Blue の対応操作(42点)の内訳・誤答とヒントの利用・防御レポートの提出状況・所要時間 */
function BlueResults({ session }: { session: SessionView }) {
  const p = session.blueProgress;
  const judgments = Object.values(p.judgments);
  const wrong = judgments.reduce((sum, j) => sum + j.wrongAttempts, 0);
  const hinted = judgments.filter(j => j.hintLevelUsed > 0).length;
  const examples = judgments.filter(j => j.hintLevelUsed >= 3).length;
  const elapsed = formatElapsed(p.startedAt, p.finishedAt, Date.parse(session.events.at(-1)?.at ?? "") || Date.parse(p.startedAt ?? ""));
  const limit = aquaScenario.durationMinutes.blue;
  return <>
    <h3>Blue Team の内訳</h3>
    <dl className="practice-score-details">
      <div><dt>対応操作の得点</dt><dd>{session.score.blueActions} / {BLUE_SCORING.actionsTotal}{session.exerciseMode === "practice" ? "(練習)" : ""}</dd></div>
      <div><dt>誤答 / ヒントを使った判断 / 実行例まで見た判断</dt><dd>{wrong}回 / {hinted}件 / {examples}件</dd></div>
      <div><dt>防御レポート</dt><dd>{session.reports.blue ? "✓ 提出済み" : session.blueState === "recovered" ? "未提出(提出できます)" : "未提出(模擬復旧後に提出できます)"}</dd></div>
      <div><dt>所要時間(目安 {limit}分)</dt><dd>{elapsed ? `${elapsed.text}${p.finishedAt ? "" : "(途中)"} ${elapsed.over ? `目安を${Math.ceil((elapsed.sec - limit * 60) / 60)}分超過` : "目安以内"}` : "未開始"}</dd></div>
    </dl>
    <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="Blue Team 判断別の得点">
      <table className="hmi-table">
        <caption>判断別の得点(誤答1回 −{BLUE_SCORING.mistakePenalty}点・下限は配点の50%、「実行例」を見た判断は配点の50%が上限)</caption>
        <thead><tr><th>判断</th><th>状態</th><th>得点</th><th>誤答</th><th>ヒント</th></tr></thead>
        <tbody>{blueDefs.steps.map(step => [
          <tr key={step.code} className="results-step-row"><th colSpan={2} scope="rowgroup">STEP 0{step.step} {step.title}</th><td>{p.steps[step.code].points} / {step.points}</td><td colSpan={2}>{p.steps[step.code].completed ? "✓ 完了" : `判断 ${p.steps[step.code].solved}/${p.steps[step.code].total}`}</td></tr>,
          ...step.judgments.map(id => { const j = p.judgments[id]; return <tr key={id}><td>{id} {blueDefs.byId[id].title}</td><td>{j.solved ? "✓ 正解" : "— 未正解"}</td><td>{j.points} / {j.max}</td><td>{j.wrongAttempts}回</td><td>{["未使用", "考え方", "書き方", "実行例"][j.hintLevelUsed]}</td></tr>; }),
        ])}</tbody>
      </table>
    </div>
  </>;
}
