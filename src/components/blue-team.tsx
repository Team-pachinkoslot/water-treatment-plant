"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, Info, Lightbulb, Lock, PlayCircle, XCircle } from "lucide-react";
import { aquaScenario, type BlueActionCode } from "@/lib/scenarios/aqua";
import {
  BLUE_SCORING, canAdvance, createBlueScenario, judgmentPoints, pointsFloor, solvedIds, toTrendRows, trailingNormal, trendDiff,
  type BlueProgress, type FeedbackKind, type JudgmentId, type JudgmentSpec, type StepSpec,
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
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const listOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const toggle = (values: unknown, id: string) => { const l = listOf(values); return l.includes(id) ? l.filter(v => v !== id) : [...l, id]; };

// 正誤は色だけでなく、アイコンと文言でも示す。
const kindMeta: Record<FeedbackKind, { Icon: typeof CheckCircle2; label: string; cls: string }> = {
  ok: { Icon: CheckCircle2, label: "正解", cls: "is-correct" },
  wrong: { Icon: XCircle, label: "見直し", cls: "is-wrong" },
  missing: { Icon: AlertTriangle, label: "未判定", cls: "is-missing" },
  info: { Icon: Info, label: "案内", cls: "is-info" },
};

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
  return <span className={e.over ? "is-over" : ""}>経過 {e.text} / 目安 {limit}:00{e.over ? "(目安超過)" : ""}</span>;
}

export function BlueTeam({ session, enabled, busy, samples, recoverySamples, call }: { session: SessionView; enabled: boolean; busy: boolean; samples: TelemetrySample[]; recoverySamples: TelemetrySample[]; call: BlueCall }) {
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
  const step = scenario.steps.find(s => s.code === selected)!;
  const stepView = view.steps[step.code];
  const isCurrent = step.from === session.blueState;
  const advanceReady = isCurrent && canAdvance(scenario, progress, step.code);
  const practice = session.exerciseMode === "practice";

  async function check(spec: JudgmentSpec) {
    setStepError("");
    const answer = spec.input.kind === "action" ? true : drafts[spec.id];
    const res = await call("blue-check", { judgmentId: spec.id, answer });
    if (res.error) return setStepError(res.error);
    const result = res.data!.result as BlueCheckResult;
    setResults(prev => ({ ...prev, [spec.id]: result }));
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
    if (next) setSelected(next.code);
  }

  return (
    <div className="blue-team">
      <IncidentMemo />
      <TrainingNotice />
      <div className="blue-common">
        <section className="panel blue-status" aria-label="現在の状態">
          <div><small>現在の状態</small><strong className="mono">{session.blueState}</strong></div>
          <div><small>経過時間</small><strong><Clock size={14} aria-hidden="true" /> <Elapsed session={session} /></strong></div>
          <div><small>対応操作の得点{practice ? "(練習・合計に加算しません)" : ""}</small><strong>{session.score.blueActions} / {BLUE_SCORING.actionsTotal}</strong></div>
        </section>
        <BlueProcessDiagram state={session.blueState} trend={trend} recovery={recovery} solved={solved} />
        <ProcessLegend />
        <HmiOverview blueState={session.blueState} solved={solved} showLog={false} />
      </div>

      <ol className="aqua-actions blue-step-cards" aria-label="対応STEP">
        {scenario.steps.map(s => {
          const p = view.steps[s.code];
          const active = s.from === session.blueState;
          const status = p.completed ? "完了" : active ? "進行中" : "未着手";
          return (
            <li key={s.code} className={`panel ${selected === s.code ? "is-selected" : ""} status-${p.completed ? "done" : active ? "active" : "todo"}`}>
              <button type="button" className="blue-card-button" aria-pressed={selected === s.code} onClick={() => { setSelected(s.code); setStepError(""); }}>
                <div className="eyebrow">STEP 0{s.step}</div>
                <h3>{s.title}</h3>
                <p className="blue-card-meta">
                  <span>{p.completed ? <CheckCircle2 size={13} aria-hidden="true" /> : active ? <PlayCircle size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />} {status}</span>
                  <span>判断 {p.solved}/{p.total}</span>
                  <span>{p.points}/{p.max}点</span>
                </p>
                <p className="aqua-state">{s.from} → {s.to}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel blue-step-detail" aria-label={`STEP ${step.step} の作業`}>
        <div className="eyebrow">STEP 0{step.step} / {step.from} → {step.to}</div>
        <h2>{step.title}</h2>
        {!enabled && <p className="notice">5つのFLAGとRed Team調査レポートの提出後に操作できます。資料は先に閲覧できます。</p>}
        {stepView.completed && <p className="choice-feedback is-correct"><CheckCircle2 size={14} aria-hidden="true" /> このSTEPは完了しています({stepView.points}/{stepView.max}点)。資料はふり返りに使えます。</p>}
        {enabled && !stepView.completed && !isCurrent && <p className="choice-feedback"><Lock size={14} aria-hidden="true" /> 未着手のSTEPです。資料は閲覧できます。前のSTEPを完了すると、判断を入力できます。</p>}

        <h3 className="blue-section-title">1. 見る資料</h3>
        <StepMaterials step={step} session={session} samples={samples} />

        <h3 className="blue-section-title">2. 判断・記入</h3>
        <p className="blue-help">各判断の「判定する」で正誤を確かめます。正解した判断は固定されます。誤答1回ごとに−{BLUE_SCORING.mistakePenalty}点(下限は配点の50%)、ヒントの「実行例」を見た判断は配点の50%が上限です。</p>
        <div className="judgment-list">
          {step.judgments.map(id => {
            const spec = scenario.byId[id];
            return (
              <JudgmentCard key={id} spec={spec} rec={view.judgments[id]} progress={progress} enabled={enabled} busy={busy} isCurrent={isCurrent}
                draft={drafts[id]} setDraft={v => setDrafts(prev => ({ ...prev, [id]: v }))} result={results[id]} hint={hints[id]}
                onCheck={() => void check(spec)} onHint={i => void hint(spec, i)}
                extra={<JudgmentExtra spec={spec} session={session} progress={progress} recovery={recoverySamples} enabled={enabled} busy={busy} isCurrent={isCurrent} onObserve={() => void observe()} />} />
            );
          })}
        </div>
        {stepError && <p role="alert" className="practice-error">{stepError}</p>}

        {enabled && isCurrent && (
          <>
            <h3 className="blue-section-title">3. 状態遷移</h3>
            <button type="button" className="button primary" disabled={busy || !advanceReady} onClick={() => void transition()}>{step.actionLabel}</button>
            <p className="blue-help" aria-live="polite">{advanceReady ? `すべての判断が正解です。押すと ${step.to} へ進みます。` : `判断がすべて正解になると押せます(${stepView.solved}/${stepView.total})。`}</p>
          </>
        )}
        {session.blueState === "recovered" && step.code === "RESTORE_SIMULATED_MONITORING" && (
          <div className="choice-feedback is-correct">
            <CheckCircle2 size={14} aria-hidden="true" /> 模擬監視を復旧しました。確認のため、復旧後も独立した値との比較監視を続けます。
            <button type="button" className="button primary blue-report-link" onClick={() => { const el = document.getElementById("blue-report"); el?.scrollIntoView({ behavior: "smooth" }); el?.querySelector<HTMLElement>("textarea")?.focus(); }}>防御レポートの提出へ進む ↓</button>
          </div>
        )}
      </section>

      <GlossaryPanel />
    </div>
  );
}

function JudgmentCard({ spec, rec, progress, enabled, busy, isCurrent, draft, setDraft, result, hint, onCheck, onHint, extra }: {
  spec: JudgmentSpec; rec: BlueJudgmentView; progress: BlueProgress; enabled: boolean; busy: boolean; isCurrent: boolean;
  draft: unknown; setDraft: (v: unknown) => void; result?: BlueCheckResult; hint?: BlueHint; onCheck: () => void; onHint: (index: number) => void; extra: ReactNode;
}) {
  const answerable = spec.canAnswer(progress);
  const waiting = isCurrent && !rec.solved && !answerable && spec.lockWhenBlocked;
  const locked = !enabled || busy || !isCurrent || rec.solved || waiting;
  const working = enabled && isCurrent && !rec.solved;
  const value = rec.solved ? rec.answer : draft;
  const base = `judgment-${spec.id}`;
  const status = rec.solved
    ? <><CheckCircle2 size={14} aria-hidden="true" /> 正解 {rec.points}/{spec.points}点</>
    : !isCurrent ? <><Circle size={14} aria-hidden="true" /> 未着手 / 配点 {spec.points}点</>
    : waiting ? <><Lock size={14} aria-hidden="true" /> 前の判断の後 / 配点 {spec.points}点</>
    : <><PlayCircle size={14} aria-hidden="true" /> 未判定 / 配点 {spec.points}点{rec.wrongAttempts ? `(誤答 ${rec.wrongAttempts} 回)` : ""}</>;
  return (
    <form className={`judgment-card ${rec.solved ? "is-solved" : ""}`} aria-labelledby={`${base}-title`} onSubmit={e => { e.preventDefault(); if (working && !busy) onCheck(); }}>
      <div className="judgment-head">
        <h4 id={`${base}-title`}><span className="judgment-id">{spec.id}</span>{spec.title}</h4>
        <span className={`judgment-status ${rec.solved ? "is-solved" : ""}`}>{status}</span>
      </div>
      {extra}
      <JudgmentField spec={spec} id={base} value={value} locked={locked} setDraft={setDraft} />
      {waiting && <p className="blue-help"><Lock size={12} aria-hidden="true" /> {spec.blockedMessage}</p>}
      {working && (
        <div className="blue-actions-row">
          <button type="submit" className="button secondary" disabled={busy || waiting}>{spec.submitLabel}</button>
          {(rec.wrongAttempts > 0 || rec.hintLevelUsed >= 3) && <span className="blue-help">正解したときの得点 {judgmentPoints(spec.points, { ...rec, solved: true })}/{spec.points}点</span>}
        </div>
      )}
      <div aria-live="polite">{result && <FeedbackBox result={result} />}</div>
      {working && (
        <div className="judgment-hints">
          <div className="command-hint-heading"><div><Lightbulb size={14} aria-hidden="true" /><span>ヒント</span></div><span>「実行例」を見ると上限 {pointsFloor(spec.points)}点</span></div>
          <div className="hint-levels">{hintLabels.map((label, index) => <button key={label} type="button" disabled={busy} aria-pressed={hint?.level === index} onClick={() => onHint(index)}><span>0{index + 1}</span>{label}</button>)}</div>
          {hint && <div className="generated-hint"><small>{hintLabels[hint.level]}</small><p>{hint.hint}</p></div>}
        </div>
      )}
    </form>
  );
}

function FeedbackBox({ result }: { result: BlueCheckResult }) {
  const m = kindMeta[result.kind];
  return (
    <div className={`choice-feedback judgment-feedback ${m.cls}`}>
      <p><m.Icon size={14} aria-hidden="true" /> <strong>{m.label}:</strong> {result.feedback}</p>
      {result.details && <ul>{result.details.map(d => <li key={d}>{d}</li>)}</ul>}
      {result.note && <p className="judgment-note"><AlertTriangle size={13} aria-hidden="true" /> <strong>注意:</strong> {result.note}(進行は止まりません。妥当性は講師が確認します)</p>}
    </div>
  );
}

function JudgmentField({ spec, id, value, locked, setDraft }: { spec: JudgmentSpec; id: string; value: unknown; locked: boolean; setDraft: (v: unknown) => void }) {
  const input = spec.input;
  switch (input.kind) {
    case "select":
      return <label htmlFor={`${id}-input`}>選択<select id={`${id}-input`} value={str(value)} disabled={locked} onChange={e => setDraft(e.target.value)}><option value="">選択してください</option>{input.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
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

function StepMaterials({ step, session, samples }: { step: StepSpec; session: SessionView; samples: TelemetrySample[] }) {
  switch (step.code) {
    case "ACKNOWLEDGE_ANOMALY":
      return <>
        <p>独立モデル推定(<Term name="独立モデル">別系統</Term>)と監視表示の差が {INCIDENT.diffThreshold.toFixed(2)} {INCIDENT.unit} を超える状態が{INCIDENT.consecutiveRequired}回連続したら異常とみなします。下限アラームが出ているかも確かめます。</p>
        <AquaTelemetry samples={samples} />
        <AlarmList state={session.blueState} />
      </>;
    case "ISOLATE_TRAINING_FEED":
      return <>
        <p>上の「中央監視室の状態」と資料1〜3を見比べ、ベースラインから外れた設定と、それを説明する記録を探します。</p>
        <h4>資料1 PLC一覧</h4><PlcTagTable />
        <h4>資料2 設定差分</h4><SettingDiffTable />
        <h4>資料3 操作ログ</h4><OpLogTable />
      </>;
    case "ENTER_SIMULATED_SAFE_MODE":
      return <p>表示用データ入力は隔離済みです。上の「中央監視室の状態」で注入ポンプを確かめ、水質(消毒)を守りながら安全側に倒す対応を選びます(<Term name="フェイルセーフ">フェイルセーフ</Term>)。<Term name="インターロック">インターロック</Term>のように止めるだけが安全とは限りません。</p>;
    case "VERIFY_STABLE":
      return <>
        <p>作業はすべて模擬です。<Term name="手動/自動">手動運転</Term>のまま設定を戻し、表示とは独立した確認で正常が続くことを確かめます。</p>
        <h4>資料1 ベースライン台帳(PLC一覧)</h4><PlcTagTable />
        <h4>資料2 操作ログ</h4><OpLogTable />
      </>;
    case "RESTORE_SIMULATED_MONITORING":
      return <p>正常性の確認が済みました。安全モードで変えたものを、運転 → 入力の順に戻し、自動運転(<Term name="AUTO">AUTO</Term>)に復旧します。復旧後も監視は続けます。</p>;
  }
}
