"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, BookOpen, CheckCircle2, Circle, Clock, HelpCircle, Info, Lightbulb, Lock, PlayCircle, X, XCircle } from "lucide-react";
import { aquaScenario, type BlueActionCode } from "@/lib/scenarios/aqua";
import {
  BLUE_SCORING, JUDGMENT_IDS, canAdvance, createBlueScenario, judgmentPoints, pointsFloor, solvedIds, toTrendRows, trailingNormal, trendDiff,
  type BlueProgress, type BlueScenario, type FeedbackKind, type JudgmentId, type JudgmentSpec, type StepSpec,
} from "@/lib/scenarios/blue-steps";
import { INCIDENT } from "@/lib/scenarios/incident";
import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";
import type { BlueCheckResult, BlueHint, BlueJudgmentView, SessionView } from "@/lib/scenarios/session-types";
import { AquaTelemetry } from "./aqua-telemetry";
import { BlueProcessDiagram } from "./blue-process-diagram";
import { AlarmList, GlossaryPanel, HmiOverview, IncidentMemo, OpLogTable, PlcTagTable, ProcessLegend, SettingDiffTable, TrainingNotice } from "./blue-hmi";
import { Term } from "./glossary";

export type BlueOperation = "blue-check" | "blue-hints" | "blue-actions" | "blue-observe";
export type BlueCall = (operation: BlueOperation, payload: Record<string, unknown>) => Promise<{ data?: Record<string, unknown>; error?: string }>;
const hintLabels = ["考え方", "書き方", "実行例"] as const;
const thr = INCIDENT.diffThreshold.toFixed(2);
/** 判断ごとの「いまやること」(命令形)・「見る場所」・判断欄の近くに出す用語 */
const questionGuide: Record<JudgmentId, { task: string; source: string; terms?: string[] }> = {
  "1-1": { task: `データ表の「差」の列を上から見て、差が ${thr} を超えた状態が続き始めた時刻を選んでください。`, source: "資料のデータ表の「差」の列(⚠ の付いた行)", terms: ["乖離", "閾値"] },
  "1-2": { task: `1-1 の時刻から数えて、超過が ${INCIDENT.consecutiveRequired} 回続いた時刻を選んでください。`, source: "資料のデータ表の「差」の列と 1-1 の結果", terms: ["閾値"] },
  "1-3": { task: "連続しなかった単発の超過を、異常の確定から除いた理由を、次の回の変化とあわせて一行で書いてください。", source: "資料のデータ表で、単発の ⚠ の行とその次の行" },
  "2-1": { task: "資料1 と資料2 を見比べ、承認済みの値から外れた設定(PLCとタグ)を1つ選んでください。", source: "資料1 PLC一覧・資料2 設定差分", terms: ["PLC", "タグ", "ベースライン"] },
  "2-2": { task: "監視状態・設定差分・操作ログと矛盾しない原因を、当てはまるものすべてにチェックしてください。", source: "中央監視室の状態・資料2 設定差分・資料3 操作ログ", terms: ["操作ログ"] },
  "2-3": { task: "原因を裏付ける記録や時刻の前後関係を、すべてチェックしてください。", source: "資料3 操作ログの時刻と、データ表の時刻", terms: ["操作ログ"] },
  "2-4": { task: "水質と供給を守りながら切り離す対象を1つ選び、「隔離する」を押してください。", source: "中央監視室の状態とこれまでの調査結果", terms: ["入力経路"] },
  "3-1": { task: "注入ポンプの状態を確かめ、水質を守りながら安全を確保する対応をすべてチェックしてください。", source: "中央監視室の状態(注入ポンプ・運転モード)", terms: ["フェイルセーフ", "インターロック"] },
  "4-1": { task: "ベースライン台帳で承認済みの値を確かめ、戻す設定値を数値で入力してください。", source: "資料1 ベースライン台帳(PLC一覧)の設定値の列", terms: ["ベースライン", "SP"] },
  "4-2": { task: "操作ログで対象の設定を変更したアカウントを確かめ、1つ選んでください。", source: "資料2 操作ログの「アカウント」と「操作」の列", terms: ["操作ログ", "最小権限"] },
  "4-3": { task: "4-1 と 4-2 を終えたら、「復旧データへ切替」を押してください。", source: "4-1・4-2 の結果", terms: ["入力経路"] },
  "4-4": { task: "「次の記録を取得」で復旧データを取り、差が連続して基準以内かを見て選んでください。", source: "この判断の中に表示される復旧データの表", terms: ["閾値"] },
  "4-5": { task: "手分析の値と、モデル推定・監視表示との差を比べ、整合しているかを選んでください。", source: "この判断の中に表示される比較表", terms: ["現場手分析"] },
  "5-1": { task: "正常性の確認後に戻す運転モードを選び、「実行」を押してください。", source: "安全モードで変更した運転状態", terms: ["手動/自動"] },
  "5-2": { task: "運転モードを戻したあと、「隔離を解除する」を押してください。", source: "5-1 の結果" },
  "5-3": { task: "再発に気付くため、復旧後も続ける監視をすべてチェックしてください。", source: "今回の異常と調査結果", terms: ["独立モデル"] },
};
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const listOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const toggle = (values: unknown, id: string) => { const l = listOf(values); return l.includes(id) ? l.filter(v => v !== id) : [...l, id]; };
const GUIDE_KEY = "aqua-blue-guide-dismissed-v1";

// 正誤は色だけでなく、アイコンと文言でも示す。
const kindMeta: Record<FeedbackKind, { Icon: typeof CheckCircle2; label: string; cls: string }> = {
  ok: { Icon: CheckCircle2, label: "正解", cls: "is-correct" },
  wrong: { Icon: XCircle, label: "見直し", cls: "is-wrong" },
  missing: { Icon: AlertTriangle, label: "未判定", cls: "is-missing" },
  info: { Icon: Info, label: "案内", cls: "is-info" },
};

/** 指定した要素へスクロールし、到着した場所を短く強調する */
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.classList.remove("is-arrived");
  void el.offsetWidth;
  el.classList.add("is-arrived");
  window.setTimeout(() => el.classList.remove("is-arrived"), 1800);
}

/** STEP の中で、いま取り組む判断(前提を満たした未正解の判断のうち先頭) */
function focusJudgment(step: StepSpec, scenario: BlueScenario, progress: BlueProgress): JudgmentId | null {
  const unsolved = step.judgments.filter(id => !progress.judgments[id].solved);
  return unsolved.find(id => scenario.byId[id].canAnswer(progress)) ?? unsolved[0] ?? null;
}

export function formatElapsed(startedAt: string | null, finishedAt: string | null, now: number) {
  if (!startedAt) return null;
  const sec = Math.max(0, Math.floor(((finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt)) / 1000));
  return { sec, text: `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`, over: sec > aquaScenario.durationMinutes.blue * 60 };
}
function Elapsed({ session }: { session: SessionView }) {
  const [now, setNow] = useState(() => Date.now());
  const { startedAt, finishedAt } = session.blueProgress;
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, finishedAt]);
  const limit = aquaScenario.durationMinutes.blue;
  const e = formatElapsed(startedAt, finishedAt, now);
  if (!e) return <span>未開始 / 目安 {limit}:00</span>;
  return <span className={e.over ? "is-over" : ""}>{e.text} / 目安 {limit}:00{e.over ? "(超過)" : ""}</span>;
}

/** 初回だけ表示する操作の流れ(見る → 選ぶ → 判定する → 次へ) */
function BlueGuide({ onClose }: { onClose: () => void }) {
  const steps = [
    ["見る", "「いまやること」と「見る場所」を読み、左(スマホは「資料」タブ)の資料を確かめます。"],
    ["選ぶ", "判断欄で回答を選ぶか、入力します。点線の用語はタップで説明が出ます。"],
    ["判定する", "「判定する」を押すと、ボタンのすぐ下に結果と理由が出ます。"],
    ["次へ", "正解すると次の判断へ自動で移ります。全問正解でSTEPを進めます。"],
  ] as const;
  return (
    <section className="panel blue-guide" aria-label="操作の流れ">
      <div className="blue-guide-head">
        <strong>はじめに:操作の流れ</strong>
        <button type="button" className="text-link" onClick={onClose}><X size={14} aria-hidden="true" /> 閉じる</button>
      </div>
      <ol>{steps.map(([title, text], i) => <li key={title}><span className="blue-guide-num">{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol>
    </section>
  );
}

export function BlueTeam({ session, enabled, busy, samples, recoverySamples, call, onGoRed }: { session: SessionView; enabled: boolean; busy: boolean; samples: TelemetrySample[]; recoverySamples: TelemetrySample[]; call: BlueCall; onGoRed?: () => void }) {
  const trend = useMemo(() => toTrendRows(samples), [samples]);
  const recovery = useMemo(() => toTrendRows(recoverySamples), [recoverySamples]);
  const scenario = useMemo(() => createBlueScenario({ trend, recovery }), [trend, recovery]);
  const view = session.blueProgress;
  const progress: BlueProgress = { state: session.blueState, judgments: view.judgments, recoveryObserved: view.recoveryObserved, startedAt: view.startedAt ?? "", mode: view.mode };
  const solved = solvedIds(view.judgments);
  const current = scenario.steps.find(s => s.from === session.blueState);
  const [selected, setSelected] = useState<BlueActionCode>(current?.code ?? scenario.steps.at(-1)!.code);
  const [drafts, setDrafts] = useState<Partial<Record<JudgmentId, unknown>>>({});
  const [results, setResults] = useState<Partial<Record<JudgmentId, BlueCheckResult>>>({});
  const [hints, setHints] = useState<Partial<Record<JudgmentId, BlueHint>>>({});
  const [stepError, setStepError] = useState("");
  const [pane, setPane] = useState<"materials" | "judge">("materials");
  const [pendingAdvance, setPendingAdvance] = useState(false);
  // 初回だけ操作の流れを表示する(閉じたらこのブラウザでは出さない)。
  // BlueTeam は保存済みセッションの読込後にクライアントでだけ描画されるため、初期値で localStorage を読んでも表示はずれない。
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !window.localStorage.getItem(GUIDE_KEY); } catch { return true; }
  });
  // 状況説明は、最初の判断に取り組むまでは開いておき、その後は畳んで縦の長さを抑える
  const [backgroundOpen, setBackgroundOpen] = useState(() => solvedIds(session.blueProgress.judgments).length === 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const step = scenario.steps.find(s => s.code === selected)!;
  const stepView = view.steps[step.code];
  const isCurrent = step.from === session.blueState;
  const advanceReady = isCurrent && canAdvance(scenario, progress, step.code);
  const practice = session.exerciseMode === "practice";
  const focusId = enabled && isCurrent ? focusJudgment(step, scenario, progress) : null;
  const focusSpec = focusId ? scenario.byId[focusId] : null;
  const nextStep = scenario.steps.find(s => s.step === step.step + 1);
  const totalSolved = solved.length;

  function closeGuide() {
    setShowGuide(false);
    try { window.localStorage.setItem(GUIDE_KEY, "1"); } catch { /* 保存できなくても閉じる */ }
  }
  // 固定バーの高さを測り、スクロール位置と資料欄の固定位置に使う
  useEffect(() => {
    const bar = barRef.current, root = rootRef.current;
    if (!bar || !root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => root.style.setProperty("--blue-stepbar-h", `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // 正解したら、少し間をおいて次の判断(全問正解なら状態遷移ボタン)へ移る
  useEffect(() => {
    if (!pendingAdvance) return;
    const timer = window.setTimeout(() => { setPendingAdvance(false); goNext(); }, 900);
    return () => window.clearTimeout(timer);
  });

  function goTo(id: string, nextPane?: "materials" | "judge") {
    if (nextPane) setPane(nextPane);
    window.setTimeout(() => scrollToId(id), 30);
  }
  function goJudgment(id: JudgmentId) { goTo(`judgment-${id}`, "judge"); }
  function selectStep(code: BlueActionCode) {
    setSelected(code); setStepError(""); setPendingAdvance(false);
    goTo("blue-now", "materials");
  }
  function goNext() {
    if (focusId) return goJudgment(focusId);
    if (advanceReady) return goTo("blue-advance", "judge");
    if (current && current.code !== selected) return selectStep(current.code);
    if (session.blueState === "recovered") return goTo("blue-report");
  }
  const nextLabel = focusId ? `判断 ${focusId} へ` : advanceReady ? `「${step.actionLabel}」へ` : current && current.code !== selected ? `STEP 0${current.step} へ` : session.blueState === "recovered" ? "防御レポートへ" : null;

  async function check(spec: JudgmentSpec) {
    setStepError("");
    const answer = spec.input.kind === "action" ? true : drafts[spec.id];
    const res = await call("blue-check", { judgmentId: spec.id, answer });
    if (res.error) return setStepError(res.error);
    const result = res.data!.result as BlueCheckResult;
    setResults(prev => ({ ...prev, [spec.id]: result }));
    if (result.ok) setPendingAdvance(true);
  }
  async function hint(spec: JudgmentSpec, index: number) {
    if (index === 2 && !window.confirm(`「実行例」を見ると、判断 ${spec.id} の得点の上限が ${pointsFloor(spec.points)} 点(配点の50%)になります。表示しますか?`)) return;
    setStepError("");
    const res = await call("blue-hints", { judgmentId: spec.id, index });
    if (res.error) return setStepError(res.error);
    setHints(prev => ({ ...prev, [spec.id]: res.data as unknown as BlueHint }));
  }
  async function observe() {
    setStepError("");
    const res = await call("blue-observe", {});
    if (res.error) setStepError(res.error);
  }
  async function transition() {
    setStepError("");
    const res = await call("blue-actions", { action: step.code });
    if (res.error) return setStepError(res.error);
    const next = scenario.steps.find(s => s.from === step.to);
    if (next) selectStep(next.code);
    else goTo("blue-done");
  }

  // 「いまやること」の1行
  let nowTask: ReactNode;
  let nowSource: string | null = null;
  let nowAction: { label: string; onClick: () => void } | null = null;
  if (!enabled) {
    nowTask = "Red Team の提出を終えると判断を入力できます。いまは資料を先に読んでおけます。";
  } else if (stepView.completed) {
    nowTask = <>このSTEPは完了しています({stepView.points}/{stepView.max}点)。資料はふり返りに使えます。</>;
    if (current && current.code !== selected) nowAction = { label: `いまのSTEP 0${current.step} へ`, onClick: () => selectStep(current.code) };
    else if (session.blueState === "recovered") nowAction = { label: "防御レポートへ", onClick: () => goTo("blue-report") };
  } else if (!isCurrent) {
    nowTask = `前のSTEP${current ? `(STEP 0${current.step})` : ""}を完了すると、このSTEPの判断を入力できます。資料は先に閲覧できます。`;
    if (current) nowAction = { label: `STEP 0${current.step} へ戻る`, onClick: () => selectStep(current.code) };
  } else if (focusSpec) {
    nowTask = <><span className="blue-now-id">{focusSpec.id}</span>{questionGuide[focusSpec.id].task}</>;
    nowSource = questionGuide[focusSpec.id].source;
    nowAction = { label: `判断 ${focusSpec.id} へ`, onClick: () => goJudgment(focusSpec.id) };
  } else if (advanceReady) {
    nowTask = `すべての判断が正解です。「${step.actionLabel}」を押して ${step.to} へ進んでください。`;
    nowAction = { label: `「${step.actionLabel}」へ`, onClick: () => goTo("blue-advance", "judge") };
  }

  return (
    <div className="blue-team" ref={rootRef}>
      <nav className="blue-stepbar" ref={barRef} aria-label="対応STEPの進み具合">
        <div className="blue-stepbar-top">
          <strong className="blue-stepbar-now">STEP 0{step.step} <span>/ 判断 {stepView.solved}/{stepView.total}</span>{!isCurrent && <small>{stepView.completed ? "(完了・閲覧中)" : "(閲覧中)"}</small>}</strong>
          <span className="blue-stepbar-meta">
            <span><Clock size={13} aria-hidden="true" /> <Elapsed session={session} /></span>
            <span>得点 {session.score.blueActions}/{BLUE_SCORING.actionsTotal}{practice ? "(練習)" : ""}</span>
            <span className="blue-stepbar-state" title="現在の模擬状態">{session.blueState}</span>
          </span>
          <span className="blue-stepbar-actions">
            {enabled && nextLabel && <button type="button" className="button secondary" disabled={busy} onClick={goNext}>{nextLabel} <ArrowDown size={13} aria-hidden="true" /></button>}
            <button type="button" className="blue-icon-button" aria-label="操作の流れを表示" aria-pressed={showGuide} onClick={() => setShowGuide(v => !v)}><HelpCircle size={16} aria-hidden="true" /></button>
          </span>
        </div>
        <ol className="blue-stepper">
          {scenario.steps.map(s => {
            const p = view.steps[s.code];
            const active = s.from === session.blueState;
            const status = p.completed ? "done" : active ? "active" : "todo";
            return (
              <li key={s.code} className={`status-${status}`}>
                <button type="button" aria-current={selected === s.code ? "step" : undefined} onClick={() => selectStep(s.code)}
                  aria-label={`STEP 0${s.step} ${s.title}(${p.completed ? "完了" : active ? "進行中" : "未着手"}・判断 ${p.solved}/${p.total})`}>
                  <span className="blue-stepper-num" aria-hidden="true">{p.completed ? "✓" : s.step}</span>
                  <span className="blue-stepper-title" aria-hidden="true">{s.title}</span>
                  <small aria-hidden="true">{p.solved}/{p.total}</small>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="blue-stepbar-progress" role="progressbar" aria-label="判断の進み具合" aria-valuemin={0} aria-valuemax={JUDGMENT_IDS.length} aria-valuenow={totalSolved}>
          <i style={{ width: `${(totalSolved / JUDGMENT_IDS.length) * 100}%` }} />
        </div>
      </nav>

      {showGuide && <BlueGuide onClose={closeGuide} />}

      {!enabled && (
        <div className="notice blue-gate" role="note">
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>Red Team の提出後に操作できます</strong>
            <p>5つのFLAGとRed Team調査レポートを提出すると、判断を入力できます。資料は先に閲覧できます。</p>
            <div className="blue-gate-actions">
              {onGoRed && <button type="button" className="button primary" onClick={onGoRed}>Red Team へ <ArrowRight size={13} aria-hidden="true" /></button>}
              <button type="button" className="button secondary" onClick={() => goTo("blue-now", "materials")}>資料だけ先に見る <ArrowDown size={13} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      )}

      <details className="panel blue-background" open={backgroundOpen} onToggle={e => setBackgroundOpen(e.currentTarget.open)}>
        <summary>状況説明・プロセス図{backgroundOpen ? "" : "(クリックで開く)"}</summary>
        <IncidentMemo />
        <TrainingNotice />
        <p className="term-help">点線のある用語は、カーソルを合わせるか、クリック・タップすると説明が表示されます。</p>
        <BlueProcessDiagram state={session.blueState} trend={trend} recovery={recovery} solved={solved} />
        <ProcessLegend />
      </details>

      <section className="panel blue-step-detail" aria-label={`STEP ${step.step} の作業`}>
        <div className="eyebrow">STEP 0{step.step} / {step.from} → {step.to}</div>
        <h2>{step.title}</h2>

        <div className={`blue-now ${enabled && isCurrent && !stepView.completed ? "is-active" : ""}`} id="blue-now">
          <div className="blue-now-label">いまやること</div>
          <p className="blue-now-task">{nowTask}</p>
          {nowSource && <p className="blue-now-where"><BookOpen size={13} aria-hidden="true" /> <strong>見る場所</strong> {nowSource}</p>}
          {nowAction && <button type="button" className="button primary" onClick={nowAction.onClick}>{nowAction.label} <ArrowDown size={13} aria-hidden="true" /></button>}
        </div>

        <div className="blue-pane-tabs" role="tablist" aria-label="表示の切り替え">
          <button type="button" role="tab" aria-selected={pane === "materials"} aria-controls="blue-materials" onClick={() => setPane("materials")}><BookOpen size={14} aria-hidden="true" /> 資料</button>
          <button type="button" role="tab" aria-selected={pane === "judge"} aria-controls="blue-judge" onClick={() => setPane("judge")}><CheckCircle2 size={14} aria-hidden="true" /> 判断 <small>{stepView.solved}/{stepView.total}</small></button>
        </div>

        <div className="blue-split" data-pane={pane}>
          <div className="blue-materials" id="blue-materials" role="region" aria-label="見る資料">
            <h3 className="blue-section-title">見る資料</h3>
            <StepMaterials step={step} session={session} samples={samples} solved={solved} />
            <button type="button" className="button secondary blue-pane-switch" onClick={() => goTo(focusId ? `judgment-${focusId}` : "blue-judge", "judge")}>判断欄へ <ArrowRight size={13} aria-hidden="true" /></button>
          </div>

          <div className="blue-judge" id="blue-judge" role="region" aria-label="判断・記入">
            <h3 className="blue-section-title">判断・記入</h3>
            <ol className="judgment-chips" aria-label="このSTEPの判断">
              {step.judgments.map(id => {
                const rec = view.judgments[id];
                const state = rec.solved ? "solved" : rec.wrongAttempts > 0 ? "retry" : "todo";
                const label = rec.solved ? "正解" : rec.wrongAttempts > 0 ? "やり直し" : "未回答";
                const Icon = rec.solved ? CheckCircle2 : rec.wrongAttempts > 0 ? AlertTriangle : Circle;
                return <li key={id}><button type="button" className={`judgment-chip is-${state} ${focusId === id ? "is-focus" : ""}`} onClick={() => goJudgment(id)}>
                  <Icon size={12} aria-hidden="true" /> <span className="mono">{id}</span> {label}{focusId === id && <span className="judgment-chip-now">いまここ</span>}
                </button></li>;
              })}
            </ol>
            <p className="blue-help">誤答1回ごとに−{BLUE_SCORING.mistakePenalty}点(下限は配点の50%)。ヒントの「実行例」を見た判断は配点の50%が上限です。正解した判断は固定されます。</p>
            <div className="judgment-list">
              {step.judgments.map(id => {
                const spec = scenario.byId[id];
                return (
                  <JudgmentCard key={id} spec={spec} rec={view.judgments[id]} progress={progress} enabled={enabled} busy={busy} isCurrent={isCurrent} isFocus={focusId === id}
                    draft={drafts[id]} setDraft={v => setDrafts(prev => ({ ...prev, [id]: v }))} result={results[id]} hint={hints[id]}
                    onCheck={() => void check(spec)} onHint={i => void hint(spec, i)} onShowMaterials={() => goTo("blue-materials", "materials")}
                    next={results[id]?.ok && nextLabel ? { label: nextLabel, onClick: () => { setPendingAdvance(false); goNext(); } } : null}
                    extra={<JudgmentExtra spec={spec} session={session} progress={progress} recovery={recoverySamples} enabled={enabled} busy={busy} isCurrent={isCurrent} onObserve={() => void observe()} />} />
                );
              })}
            </div>
            {stepError && <p role="alert" className="practice-error">{stepError}</p>}

            {enabled && isCurrent && (
              <div className={`blue-advance ${advanceReady ? "is-ready" : ""}`} id="blue-advance">
                <h3 className="blue-section-title">次の状態へ進む</h3>
                <button type="button" className="button primary" disabled={busy || !advanceReady} onClick={() => void transition()}>{step.actionLabel}</button>
                <p className="blue-help" aria-live="polite">{advanceReady ? `すべての判断が正解です。押すと ${step.to} へ進みます。` : `判断がすべて正解になると押せます(${stepView.solved}/${stepView.total})。`}</p>
              </div>
            )}
            {enabled && stepView.completed && nextStep && current?.code === nextStep.code && (
              <button type="button" className="button primary blue-next-step" onClick={() => selectStep(nextStep.code)}>次のSTEP 0{nextStep.step}「{nextStep.title}」へ <ArrowRight size={13} aria-hidden="true" /></button>
            )}
            {session.blueState === "recovered" && step.code === "RESTORE_SIMULATED_MONITORING" && (
              <div className="choice-feedback is-correct" id="blue-done">
                <CheckCircle2 size={14} aria-hidden="true" /> 模擬監視を復旧しました。確認のため、復旧後も独立した値との比較監視を続けます。
                <button type="button" className="button primary blue-report-link" onClick={() => { scrollToId("blue-report"); document.getElementById("blue-report")?.querySelector<HTMLElement>("textarea")?.focus({ preventScroll: true }); }}>防御レポートの提出へ進む ↓</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {enabled && <MobileActionBar busy={busy} focusSpec={focusSpec} progress={progress} advanceReady={advanceReady} actionLabel={step.actionLabel}
        onSubmit={() => { if (focusId) goJudgment(focusId); }} onAdvance={() => void transition()} next={nextLabel ? { label: nextLabel, onClick: goNext } : null} />}

      <GlossaryPanel />
    </div>
  );
}

/** スマホ用:画面下に固定する操作バー(「判定する」「次へ」) */
function MobileActionBar({ busy, focusSpec, progress, advanceReady, actionLabel, onSubmit, onAdvance, next }: {
  busy: boolean; focusSpec: JudgmentSpec | null; progress: BlueProgress; advanceReady: boolean; actionLabel: string;
  onSubmit: () => void; onAdvance: () => void; next: { label: string; onClick: () => void } | null;
}) {
  const blocked = !!focusSpec && focusSpec.lockWhenBlocked && !focusSpec.canAnswer(progress);
  return (
    <div className="blue-bottombar" role="toolbar" aria-label="操作">
      {next && <button type="button" className="button secondary" disabled={busy} onClick={next.onClick}>{next.label}</button>}
      {focusSpec
        ? <button type="submit" form={`judgment-${focusSpec.id}`} className="button primary" disabled={busy || blocked} onClick={onSubmit}>{focusSpec.id} を{focusSpec.submitLabel === "判定する" ? "判定する" : `「${focusSpec.submitLabel}」`}</button>
        : advanceReady && <button type="button" className="button primary" disabled={busy} onClick={onAdvance}>{actionLabel}</button>}
    </div>
  );
}

function JudgmentCard({ spec, rec, progress, enabled, busy, isCurrent, isFocus, draft, setDraft, result, hint, onCheck, onHint, onShowMaterials, next, extra }: {
  spec: JudgmentSpec; rec: BlueJudgmentView; progress: BlueProgress; enabled: boolean; busy: boolean; isCurrent: boolean; isFocus: boolean;
  draft: unknown; setDraft: (v: unknown) => void; result?: BlueCheckResult; hint?: BlueHint; onCheck: () => void; onHint: (index: number) => void;
  onShowMaterials: () => void; next: { label: string; onClick: () => void } | null; extra: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const answerable = spec.canAnswer(progress);
  const waiting = isCurrent && !rec.solved && !answerable && spec.lockWhenBlocked;
  const locked = !enabled || busy || !isCurrent || rec.solved || waiting;
  const working = enabled && isCurrent && !rec.solved;
  const value = rec.solved ? rec.answer : draft;
  const base = `judgment-${spec.id}`;
  const guide = questionGuide[spec.id];
  const lockReason = rec.solved ? null
    : !enabled ? "Red Team の提出後に入力できます。"
    : !isCurrent ? "前のSTEPを完了すると入力できます。"
    : waiting ? spec.blockedMessage : null;
  const status = rec.solved
    ? <><CheckCircle2 size={14} aria-hidden="true" /> 正解 {rec.points}/{spec.points}点</>
    : !isCurrent || !enabled ? <><Circle size={14} aria-hidden="true" /> 未回答 / 配点 {spec.points}点</>
    : waiting ? <><Lock size={14} aria-hidden="true" /> 前の判断の後 / 配点 {spec.points}点</>
    : rec.wrongAttempts ? <><AlertTriangle size={14} aria-hidden="true" /> やり直し(誤答 {rec.wrongAttempts} 回)/ 配点 {spec.points}点</>
    : <><PlayCircle size={14} aria-hidden="true" /> 未回答 / 配点 {spec.points}点</>;
  const collapsed = rec.solved && !open;
  return (
    <form id={base} className={`judgment-card ${rec.solved ? "is-solved" : ""} ${isFocus ? "is-focus" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-labelledby={`${base}-title`} onSubmit={e => { e.preventDefault(); if (working && !busy) onCheck(); }}>
      <div className="judgment-head">
        <h4 id={`${base}-title`}><span className="judgment-id">{spec.id}</span>{spec.title}</h4>
        <span className={`judgment-status ${rec.solved ? "is-solved" : rec.wrongAttempts ? "is-retry" : ""}`}>{status}</span>
      </div>
      {result?.ok && <div aria-live="polite"><FeedbackBox result={result} next={next} /></div>}
      {rec.solved && <button type="button" className="text-link judgment-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? "回答をたたむ" : "回答と資料を表示"}</button>}
      {!collapsed && <>
        <div className="question-guide">
          <p><strong>いまやること</strong> <span>{guide.task}</span></p>
          <p><strong>見る場所</strong> <span>{guide.source} <button type="button" className="text-link question-guide-link" onClick={onShowMaterials}><BookOpen size={12} aria-hidden="true" /> 資料を見る</button></span></p>
          {guide.terms && <p><strong>用語</strong> <span className="question-guide-terms">{guide.terms.map(t => <Term key={t} name={t} />)}</span></p>}
        </div>
        {extra}
        <JudgmentField spec={spec} id={base} value={value} locked={locked} setDraft={setDraft} />
        {lockReason && <p className="judgment-lock-reason"><Lock size={12} aria-hidden="true" /> {lockReason}</p>}
        {working && !waiting && (
          <div className="blue-actions-row">
            <button type="submit" className="button primary" disabled={busy}>{spec.submitLabel}</button>
            {(rec.wrongAttempts > 0 || rec.hintLevelUsed >= 3) && <span className="blue-help">正解したときの得点 {judgmentPoints(spec.points, { ...rec, solved: true })}/{spec.points}点</span>}
          </div>
        )}
        {!result?.ok && <div aria-live="polite">{result && <FeedbackBox result={result} next={null} />}</div>}
        {working && (
          <div className="judgment-hints">
            <div className="command-hint-heading"><div><Lightbulb size={14} aria-hidden="true" /><span>ヒント</span></div><span>「実行例」を見ると上限 {pointsFloor(spec.points)}点</span></div>
            <div className="hint-levels">{hintLabels.map((label, index) => <button key={label} type="button" disabled={busy} aria-pressed={hint?.level === index} onClick={() => onHint(index)}><span>0{index + 1}</span>{label}</button>)}</div>
            {hint && <div className="generated-hint"><small>{hintLabels[hint.level]}</small><p>{hint.hint}</p></div>}
          </div>
        )}
      </>}
    </form>
  );
}

function FeedbackBox({ result, next }: { result: BlueCheckResult; next: { label: string; onClick: () => void } | null }) {
  const m = kindMeta[result.kind];
  return (
    <div className={`choice-feedback judgment-feedback ${m.cls}`}>
      <p><m.Icon size={14} aria-hidden="true" /> <strong>{result.kind === "wrong" ? "! " : result.ok ? "✓ " : ""}{m.label}:</strong> {result.feedback}</p>
      {result.details && <ul>{result.details.map(d => <li key={d}>{d}</li>)}</ul>}
      {result.note && <p className="judgment-note"><AlertTriangle size={13} aria-hidden="true" /> <strong>注意:</strong> {result.note}(進行は止まりません。妥当性は講師が確認します)</p>}
      {next && <button type="button" className="button secondary judgment-next" onClick={next.onClick}>{next.label} <ArrowDown size={13} aria-hidden="true" /></button>}
    </div>
  );
}

function JudgmentField({ spec, id, value, locked, setDraft }: { spec: JudgmentSpec; id: string; value: unknown; locked: boolean; setDraft: (v: unknown) => void }) {
  const input = spec.input;
  switch (input.kind) {
    case "select":
      return <label htmlFor={`${id}-input`}>回答を1つ選択<select id={`${id}-input`} value={str(value)} disabled={locked} onChange={e => setDraft(e.target.value)}><option value="">選択してください</option>{input.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
    case "radio":
    case "multi":
      return (
        <fieldset className="blue-choice-group" disabled={locked}>
          <legend>{input.kind === "multi" ? "当てはまるものをすべて選択" : "1つ選択"}</legend>
          <ul className="safe-mode-choices">
            {input.options.map(o => (
              <li key={o.id}><label>
                {input.kind === "multi"
                  ? <input type="checkbox" checked={listOf(value).includes(o.id)} onChange={() => setDraft(toggle(value, o.id))} />
                  : <input type="radio" name={`${id}-radio`} checked={value === o.id} onChange={() => setDraft(o.id)} />}
                <span>{o.label}</span>
              </label></li>
            ))}
          </ul>
        </fieldset>
      );
    case "text": {
      const length = str(value).trim().length;
      return <label htmlFor={`${id}-input`}>一行で記入({input.minLength}文字以上)<input id={`${id}-input`} value={str(value)} maxLength={input.maxLength} disabled={locked} placeholder={input.placeholder} onChange={e => setDraft(e.target.value)} aria-describedby={`${id}-count`} /><small id={`${id}-count`} className="blue-help">{length} 文字{length < input.minLength ? `(あと${input.minLength - length}文字で判定できます)` : ""}</small></label>;
    }
    case "number":
      return <label htmlFor={`${id}-input`}>戻す値({input.unit})<span className="judgment-number"><input id={`${id}-input`} inputMode="decimal" value={str(value)} disabled={locked} placeholder={input.placeholder} onChange={e => setDraft(e.target.value)} /><span>{input.unit}</span></span></label>;
    case "action":
      return null;
  }
}

/** 判断ごとの補助表示(4-1 の現在値、4-4 の記録取得、4-5 の比較表など) */
function JudgmentExtra({ spec, session, progress, recovery, enabled, busy, isCurrent, onObserve }: { spec: JudgmentSpec; session: SessionView; progress: BlueProgress; recovery: TelemetrySample[]; enabled: boolean; busy: boolean; isCurrent: boolean; onObserve: () => void }) {
  const rec = session.blueProgress.judgments[spec.id];
  const fmt = (n: number) => n.toFixed(2);
  switch (spec.id) {
    case "4-1":
      return <p className="blue-help">現在の {INCIDENT.changedTag}: {rec.solved ? fmt(INCIDENT.baselineSp) : fmt(INCIDENT.changedSp)} {INCIDENT.unit}。戻す値は資料の「ベースライン台帳(PLC一覧)」で確かめます。上長承認(模擬)を得るまで値は確定しません。</p>;
    case "4-3":
      return <p className="blue-help">表示用入力: {rec.solved ? "復旧データ(切替済み)" : "隔離済み"}</p>;
    case "4-4": {
      const n = progress.recoveryObserved;
      const rows = toTrendRows(recovery.slice(0, n));
      const run = trailingNormal(rows, INCIDENT.diffThreshold);
      const canObserve = enabled && isCurrent && !rec.solved && spec.canAnswer(progress) && n < recovery.length;
      return (
        <div className="judgment-extra">
          <div className="blue-actions-row">
            <button type="button" className="button secondary" disabled={busy || !canObserve} onClick={onObserve}>次の記録を取得</button>
            <span className="blue-help" aria-live="polite">取得 {n}/{recovery.length} 件 · 末尾の閾値以内の連続 {run}/{INCIDENT.consecutiveRequired} 回</span>
          </div>
          {n > 0 && (
            <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="取得した復旧データ">
              <table className="hmi-table">
                <caption>取得した復旧データ(UTC・mg/L・訓練用の架空値)</caption>
                <thead><tr><th>時刻</th><th>モデル推定</th><th>監視表示</th><th>差</th><th>閾値({fmt(INCIDENT.diffThreshold)})</th><th>入力経路</th></tr></thead>
                <tbody>{recovery.slice(0, n).map((s, i) => { const d = trendDiff(rows[i]); const within = d <= INCIDENT.diffThreshold; return <tr key={s.timestamp} className={within ? "" : "row-exceeds"}><td>{rows[i].time}</td><td>{fmt(s.model_cl_mgl)}</td><td>{fmt(s.display_cl_mgl)}</td><td>{fmt(d)}</td><td>{within ? "✓ 以内" : "⚠ 超過"}</td><td>{s.input_feed}{i === 0 ? "(切替直後)" : ""}</td></tr>; })}</tbody>
              </table>
            </div>
          )}
        </div>
      );
    }
    case "4-5": {
      if (!spec.canAnswer(progress) && !rec.solved) return null;
      const row = recovery.find(s => s.timestamp.slice(11, 16) === INCIDENT.fieldAnalysis.at);
      if (!row) return null;
      const v = INCIDENT.fieldAnalysis.value;
      return (
        <div className="aqua-table-scroll" tabIndex={0} role="region" aria-label="現場手分析との比較">
          <table className="hmi-table">
            <caption>現場手分析(模擬)と同時刻({INCIDENT.fieldAnalysis.at})の値 / mg/L</caption>
            <thead><tr><th>項目</th><th>値</th><th>手分析との差</th></tr></thead>
            <tbody>
              <tr><td>現場手分析(浄水池出口)</td><td>{fmt(v)}</td><td>—</td></tr>
              <tr><td>モデル推定(別系統)</td><td>{fmt(row.model_cl_mgl)}</td><td>{fmt(Math.abs(v - row.model_cl_mgl))}</td></tr>
              <tr><td>監視表示(復旧データ)</td><td>{fmt(row.display_cl_mgl)}</td><td>{fmt(Math.abs(v - row.display_cl_mgl))}</td></tr>
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

function StepMaterials({ step, session, samples, solved }: { step: StepSpec; session: SessionView; samples: TelemetrySample[]; solved: readonly JudgmentId[] }) {
  // 中央監視室の状態は STEP 02・03 の判断で使うため、資料欄に置いて判断欄と並べて見られるようにする。
  const hmi = <HmiOverview blueState={session.blueState} solved={solved} showLog={false} />;
  switch (step.code) {
    case "ACKNOWLEDGE_ANOMALY":
      return <>
        <p>独立モデル推定(<Term name="独立モデル">別系統</Term>)と監視表示の差が {INCIDENT.diffThreshold.toFixed(2)} {INCIDENT.unit} を超える状態が{INCIDENT.consecutiveRequired}回連続したら異常とみなします。下限アラームが出ているかも確かめます。</p>
        <AquaTelemetry samples={samples} />
        <AlarmList state={session.blueState} />
      </>;
    case "ISOLATE_TRAINING_FEED":
      return <>
        <p>「中央監視室の状態」と資料1〜3を見比べ、ベースラインから外れた設定と、それを説明する記録を探します。</p>
        {hmi}
        <h4>資料1 PLC一覧</h4><PlcTagTable />
        <h4>資料2 設定差分</h4><SettingDiffTable />
        <h4>資料3 操作ログ</h4><OpLogTable />
      </>;
    case "ENTER_SIMULATED_SAFE_MODE":
      return <>
        <p>表示用データ入力は隔離済みです。「中央監視室の状態」で注入ポンプを確かめ、水質(消毒)を守りながら安全側に倒す対応を選びます(<Term name="フェイルセーフ">フェイルセーフ</Term>)。<Term name="インターロック">インターロック</Term>のように止めるだけが安全とは限りません。</p>
        {hmi}
      </>;
    case "VERIFY_STABLE":
      return <>
        <p>作業はすべて模擬です。<Term name="手動/自動">手動運転</Term>のまま設定を戻し、表示とは独立した確認で正常が続くことを確かめます。</p>
        <h4>資料1 ベースライン台帳(PLC一覧)</h4><PlcTagTable />
        <h4>資料2 操作ログ</h4><OpLogTable />
      </>;
    case "RESTORE_SIMULATED_MONITORING":
      return <>
        <p>正常性の確認が済みました。安全モードで変えたものを、運転 → 入力の順に戻し、自動運転(<Term name="AUTO">AUTO</Term>)に復旧します。復旧後も監視は続けます。</p>
        {hmi}
      </>;
  }
}
