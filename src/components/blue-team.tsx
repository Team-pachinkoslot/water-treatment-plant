"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock, Lightbulb, PlayCircle } from "lucide-react";
import { aquaScenario, type BlueActionCode } from "@/lib/scenarios/aqua";
import { BLUE_SCORING, chlorineScenario, createStepRules, toTrendRows, trendDiff, type BlueAnswers, type StepRule } from "@/lib/scenarios/blue-steps";
import { INCIDENT, causeCandidates, fieldCheckChoices, isolationDecisions, opLog, plcTags, restoreTasks, safeModeChoices } from "@/lib/scenarios/incident";
import type { TelemetrySample } from "@/lib/scenarios/telemetry.server";
import type { BlueCheckResult, BlueHint, SessionView } from "@/lib/scenarios/session-types";
import { AquaTelemetry } from "./aqua-telemetry";
import { BlueProcessDiagram } from "./blue-process-diagram";
import { AlarmList, GlossaryPanel, HmiOverview, IncidentMemo, OpLogTable, PlcTagTable, ProcessLegend, SettingDiffTable, TrainingNotice } from "./blue-hmi";
import { Term } from "./glossary";

export type BlueCall = (operation: "blue-check" | "blue-hints" | "blue-actions", payload: Record<string, unknown>) => Promise<{ data?: Record<string, unknown>; error?: string }>;
type Check = { key: string; result: BlueCheckResult };
const hintLabels = ["考え方", "書き方", "実行例"] as const;
const keyOf = (a: BlueAnswers | undefined) => JSON.stringify(a ?? {});
const toggle = (values: unknown, id: string) => { const list = Array.isArray(values) ? (values as string[]) : []; return list.includes(id) ? list.filter(v => v !== id) : [...list, id]; };
const has = (values: unknown, id: string) => Array.isArray(values) && values.includes(id);

function Elapsed({ session }: { session: SessionView }) {
  const [now, setNow] = useState(() => Date.now());
  const startedAt = session.blueProgress.startedAt;
  const finishedAt = session.events.find(e => e.type === "RESTORE_SIMULATED_MONITORING")?.at;
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, finishedAt]);
  const limit = aquaScenario.durationMinutes.blue;
  if (!startedAt) return <span>未開始 / 目安 {limit}:00</span>;
  const sec = Math.max(0, Math.floor(((finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt)) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0"), ss = String(sec % 60).padStart(2, "0");
  return <span className={sec > limit * 60 ? "is-over" : ""}>経過 {mm}:{ss} / 目安 {limit}:00</span>;
}

export function BlueTeam({ session, enabled, busy, samples, recoverySamples, call }: { session: SessionView; enabled: boolean; busy: boolean; samples: TelemetrySample[]; recoverySamples: TelemetrySample[]; call: BlueCall }) {
  const trend = useMemo(() => toTrendRows(samples), [samples]);
  const recovery = useMemo(() => toTrendRows(recoverySamples), [recoverySamples]);
  const rules = useMemo(() => createStepRules(chlorineScenario, { trend, recovery }), [trend, recovery]);
  const current = rules.find(r => r.from === session.blueState);
  const [selected, setSelected] = useState<BlueActionCode>(current?.code ?? rules.at(-1)!.code);
  const [answers, setAnswers] = useState<Partial<Record<BlueActionCode, BlueAnswers>>>({});
  const [checks, setChecks] = useState<Partial<Record<BlueActionCode, Check>>>({});
  const [hints, setHints] = useState<Partial<Record<BlueActionCode, BlueHint>>>({});
  const [stepError, setStepError] = useState("");
  const rule = rules.find(r => r.code === selected)!;
  const a = answers[selected] ?? {};
  const set = (patch: BlueAnswers) => setAnswers(prev => ({ ...prev, [selected]: { ...(prev[selected] ?? {}), ...patch } }));
  const progress = session.blueProgress.steps;
  const isCurrent = rule.from === session.blueState;
  const done = progress[rule.code]?.completed;
  const check = checks[selected];
  const checkFresh = !!check && check.key === keyOf(a);
  const canTransition = enabled && !busy && isCurrent && checkFresh && check.result.ok;

  async function runCheck() {
    setStepError("");
    const res = await call("blue-check", { action: rule.code, answers: a });
    if (res.error) return setStepError(res.error);
    setChecks(prev => ({ ...prev, [rule.code]: { key: keyOf(a), result: res.data!.result as BlueCheckResult } }));
  }
  async function runHint(index: number) {
    setStepError("");
    const res = await call("blue-hints", { action: rule.code, index });
    if (res.error) return setStepError(res.error);
    setHints(prev => ({ ...prev, [rule.code]: res.data as unknown as BlueHint }));
  }
  async function runTransition() {
    setStepError("");
    const res = await call("blue-actions", { action: rule.code, answers: a });
    if (res.error) return setStepError(res.error);
    const next = rules.find(r => r.from === rule.to);
    if (next) setSelected(next.code);
  }

  return (
    <div className="blue-team">
      <IncidentMemo />
      <TrainingNotice />
      <div className="blue-common">
        <section className="panel blue-status" aria-label="現在の状態">
          <div><small>現在の状態</small><strong className="mono">{session.blueState}</strong></div>
          <div><small>経過時間</small><strong><Clock size={14} /> <Elapsed session={session} /></strong></div>
          <div><small>対応操作の得点</small><strong>{session.score.blueActions} / {BLUE_SCORING.actionsTotal}</strong></div>
        </section>
        <BlueProcessDiagram state={session.blueState} trend={trend} recovery={recovery} />
        <ProcessLegend />
      </div>

      <ol className="aqua-actions blue-step-cards" aria-label="対応STEP">
        {rules.map((r, i) => {
          const p = progress[r.code];
          const status = p?.completed ? "完了" : r.from === session.blueState ? "進行中" : "未着手";
          const count = p?.completed ? r.decisions.length : r.progress(answers[r.code] ?? {});
          return (
            <li key={r.code} className={`panel ${selected === r.code ? "is-selected" : ""} status-${p?.completed ? "done" : r.from === session.blueState ? "active" : "todo"}`}>
              <button type="button" className="blue-card-button" aria-pressed={selected === r.code} onClick={() => { setSelected(r.code); setStepError(""); }}>
                <div className="eyebrow">STEP 0{i + 1}</div>
                <h3>{r.title}</h3>
                <p className="blue-card-meta">
                  <span>{p?.completed ? <CheckCircle2 size={13} /> : r.from === session.blueState ? <PlayCircle size={13} /> : <Circle size={13} />} {status}</span>
                  <span>判断 {count}/{r.decisions.length}</span>
                  {p?.completed && <span>{p.points}/{p.max}点</span>}
                </p>
                <p className="aqua-state">{r.from} → {r.to}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel blue-step-detail" aria-label={`STEP ${rules.indexOf(rule) + 1} の作業`}>
        <div className="eyebrow">STEP 0{rules.indexOf(rule) + 1} / {rule.from} → {rule.to}</div>
        <h2>{rule.title}</h2>
        {!enabled && <p className="notice">5つのFLAGと調査レポートの提出後に判断・判定できます。資料は先に閲覧できます。</p>}
        {done && <p className="choice-feedback is-correct">このSTEPは完了しています({progress[rule.code].points}/{progress[rule.code].max}点)。資料はふり返りに使えます。</p>}
        {!done && !isCurrent && <p className="choice-feedback">前のSTEPを完了すると、このSTEPの判断ができます。</p>}

        <h3 className="blue-section-title">1. 見る資料</h3>
        <StepMaterials rule={rule} session={session} samples={samples} recoverySamples={recoverySamples} a={a} />

        <h3 className="blue-section-title">2. 判断・記入</h3>
        <fieldset className="blue-inputs" disabled={!enabled || busy || !isCurrent}>
          <StepInputs rule={rule} a={a} set={set} trend={trend} recovery={recovery} />
        </fieldset>

        {isCurrent && enabled && (
          <>
            <h3 className="blue-section-title">3. 判定</h3>
            <div className="blue-actions-row">
              <button type="button" className="button secondary" disabled={busy} onClick={() => void runCheck()}>判断を判定する</button>
              <span className="blue-help">判断 {rule.progress(a)}/{rule.decisions.length}{rule.penalizeMistakes ? " ・ 不適切な選択は減点されます" : ""}</span>
            </div>
            {check && (
              <ul className="blue-feedback" aria-live="polite">
                {!checkFresh && <li className="choice-feedback">入力が変わりました。もう一度判定してください。</li>}
                {check.result.feedback.map((f, i) => <li key={i} className={`choice-feedback ${f.kind === "ok" ? "is-correct" : "is-wrong"}`}>{f.kind === "ok" ? "✓ " : f.kind === "wrong" ? "✗ " : "△ "}{f.message}</li>)}
              </ul>
            )}
            <div className="blue-hints">
              <div className="command-hint-heading"><div><Lightbulb size={16} /><h3>ヒント</h3></div><span>「書き方」−{BLUE_SCORING.hintPenalty[2]}点、「実行例」−{BLUE_SCORING.hintPenalty[3]}点</span></div>
              <div className="hint-levels">{hintLabels.map((label, index) => <button key={label} type="button" disabled={busy} aria-pressed={hints[rule.code]?.level === index} onClick={() => void runHint(index)}><span>0{index + 1}</span>{label}</button>)}</div>
              {hints[rule.code] && <div className="generated-hint"><small>{hintLabels[hints[rule.code]!.level]}</small><p>{hints[rule.code]!.hint}</p></div>}
            </div>
            {stepError && <p role="alert" className="practice-error">{stepError}</p>}
            <h3 className="blue-section-title">4. 状態遷移</h3>
            <button type="button" className="button primary" disabled={!canTransition} onClick={() => void runTransition()}>
              {aquaScenario.blueActions.find(x => x.code === rule.code)!.label}
            </button>
            {!canTransition && <p className="blue-help">判定で条件を満たすと押せるようになります。</p>}
          </>
        )}
        {session.blueState === "recovered" && rule.code === "RESTORE_SIMULATED_MONITORING" && (
          <div className="choice-feedback is-correct">
            自動運転(AUTO)へ復旧しました。確認のため、数分間は独立モデルとの比較監視を続けます。
            <button type="button" className="button primary blue-report-link" onClick={() => document.getElementById("blue-report")?.scrollIntoView({ behavior: "smooth" })}>防御レポートの提出へ進む ↓</button>
          </div>
        )}
      </section>

      <HmiOverview blueState={session.blueState} />
      <GlossaryPanel />
    </div>
  );
}

function StepMaterials({ rule, session, samples, recoverySamples, a }: { rule: StepRule; session: SessionView; samples: TelemetrySample[]; recoverySamples: TelemetrySample[]; a: BlueAnswers }) {
  switch (rule.code) {
    case "ACKNOWLEDGE_ANOMALY":
      return <>
        <p>独立モデル推定(<Term name="独立モデル">別系統</Term>)と監視表示の差が {INCIDENT.diffThreshold.toFixed(2)} {INCIDENT.unit} を超える状態が{INCIDENT.consecutiveRequired}回連続したら異常とみなします。下限アラームが出ているかも確かめます。</p>
        <AquaTelemetry samples={samples} />
        <AlarmList state={session.blueState} />
      </>;
    case "ISOLATE_TRAINING_FEED":
      return <>
        <p>資料1〜3を見比べ、ベースラインから外れた設定と、それを説明する記録を探します。注記: 旧称「訓練データ入力を隔離」に相当する作業です。</p>
        <h4>資料1 PLC一覧</h4><PlcTagTable />
        <h4>資料2 設定差分</h4><SettingDiffTable />
        <h4>資料3 操作ログ</h4><OpLogTable />
      </>;
    case "ENTER_SIMULATED_SAFE_MODE":
      return <>
        <p>表示用データ入力は隔離済みです。注入ポンプの状態を確認し、水質(消毒)を守りながら安全側に倒す対応を選びます(<Term name="フェイルセーフ">フェイルセーフ</Term>)。<Term name="インターロック">インターロック</Term>のように止めるだけが安全とは限りません。</p>
        <HmiOverview blueState={session.blueState} showLog={false} />
      </>;
    case "VERIFY_STABLE":
      return <>
        <p>作業はすべて模擬です。<Term name="手動/自動">手動運転</Term>のまま設定を戻し、表示とは独立した確認で正常が続くことを確かめます。</p>
        {a.feedSwitched === true ? <AquaTelemetry samples={recoverySamples} recovery /> : <p className="blue-help">復旧データは、表示用入力を復旧データへ切り替えると表示されます。</p>}
      </>;
    case "RESTORE_SIMULATED_MONITORING":
      return <p>正常性の確認が済みました。安全モードで変えたものを元に戻し、自動運転(<Term name="AUTO">AUTO</Term>)に復旧します。復旧後も数分間は比較監視を続けます。</p>;
  }
}

function StepInputs({ rule, a, set, trend, recovery }: { rule: StepRule; a: BlueAnswers; set: (p: BlueAnswers) => void; trend: ReturnType<typeof toTrendRows>; recovery: ReturnType<typeof toTrendRows> }) {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (rule.code) {
    case "ACKNOWLEDGE_ANOMALY":
      return <>
        <div className="blue-grid-2">
          <label>連続超過の開始時刻<select value={str(a.start)} onChange={e => set({ start: e.target.value })}><option value="">選択</option>{trend.map(r => <option key={r.time} value={r.time}>{r.time}(差 {trendDiff(r).toFixed(2)})</option>)}</select></label>
          <label>異常の確定時刻<select value={str(a.confirmed)} onChange={e => set({ confirmed: e.target.value })}><option value="">選択</option>{trend.map(r => <option key={r.time} value={r.time}>{r.time}(差 {trendDiff(r).toFixed(2)})</option>)}</select></label>
        </div>
        <label>単発の超過を除外した理由(一行・10文字以上)<input value={str(a.reason)} maxLength={200} onChange={e => set({ reason: e.target.value })} placeholder="例: 次の回で閾値以内に戻り、連続していないため" /></label>
      </>;
    case "ISOLATE_TRAINING_FEED": {
      const users = [...new Set(opLog.map(r => r.user))];
      return <>
        <label>異常のあるPLCとタグ<select value={str(a.target)} onChange={e => set({ target: e.target.value })}><option value="">選択</option>{plcTags.map(t => <option key={t.plc} value={`${t.plc}:${t.tag}`}>{t.plc} / {t.tag}({t.area})</option>)}</select></label>
        <fieldset className="blue-choice-group"><legend>原因の候補(証拠を読んで複数選択)</legend>
          <ul className="safe-mode-choices">{causeCandidates.map(c => <li key={c.id}><label><input type="checkbox" checked={has(a.causes, c.id)} onChange={() => set({ causes: toggle(a.causes, c.id) })} /><span><strong>{c.label}</strong><br /><small>証拠: {c.evidence}</small></span></label></li>)}</ul>
        </fieldset>
        <fieldset className="blue-choice-group"><legend>根拠: 操作ログから引用する</legend>
          <div className="blue-grid-3">
            <label>変更者<select value={str(a.citeUser)} onChange={e => set({ citeUser: e.target.value })}><option value="">選択</option>{users.map(u => <option key={u}>{u}</option>)}</select></label>
            <label>時刻<select value={str(a.citeTime)} onChange={e => set({ citeTime: e.target.value })}><option value="">選択</option>{opLog.map(r => <option key={r.at}>{r.at}</option>)}</select></label>
            <label>変更管理票<select value={str(a.citeTicket)} onChange={e => set({ citeTicket: e.target.value })}><option value="">選択</option><option value="exists">あり</option><option value="none">なし</option></select></label>
          </div>
        </fieldset>
        <fieldset className="blue-choice-group"><legend>表示用データ入力をどう扱うか</legend>
          <ul className="safe-mode-choices">{isolationDecisions.map(d => <li key={d.id}><label><input type="radio" name="isolation-decision" checked={a.decision === d.id} onChange={() => set({ decision: d.id })} /><span>{d.label}</span></label></li>)}</ul>
        </fieldset>
      </>;
    }
    case "ENTER_SIMULATED_SAFE_MODE":
      return <fieldset className="blue-choice-group"><legend>安全側に倒す対応(複数選択)</legend>
        <ul className="safe-mode-choices">{safeModeChoices.map(c => <li key={c.id}><label><input type="checkbox" checked={has(a.actions, c.id)} onChange={() => set({ actions: toggle(a.actions, c.id) })} /><span>{c.label}</span></label></li>)}</ul>
      </fieldset>;
    case "VERIFY_STABLE": {
      const confirmed = Array.isArray(a.confirmed) ? (a.confirmed as string[]) : [];
      const need = INCIDENT.consecutiveRequired;
      const next = recovery[confirmed.length];
      const fieldRow = recovery.find(r => r.time === INCIDENT.fieldAnalysis.at);
      return <>
        <ol className="blue-work-list">
          <li>
            <span>{INCIDENT.changedTag} をベースライン {INCIDENT.baselineSp.toFixed(2)} {INCIDENT.unit} に戻す(<Term name="変更管理票">変更管理票</Term>つき)</span>
            <button type="button" className="button secondary" disabled={a.approved === true} onClick={() => set({ approved: true })}>{a.approved ? "✓ 上長承認済み(模擬)" : "上長承認を依頼する(模擬)"}</button>
            <button type="button" className="button secondary" disabled={a.approved !== true || a.spRestored === true} onClick={() => set({ spRestored: true })}>{a.spRestored ? "✓ ベースラインへ戻した" : "ベースラインへ戻す"}</button>
          </li>
          <li>
            <span>不要アカウント {INCIDENT.extraAdminAccount} を無効化する(<Term name="最小権限">最小権限</Term>)</span>
            <button type="button" className="button secondary" disabled={a.accountDisabled === true} onClick={() => set({ accountDisabled: true })}>{a.accountDisabled ? "✓ 無効化した" : "無効化する"}</button>
          </li>
          <li>
            <span>表示用入力を復旧データへ切り替える</span>
            <button type="button" className="button secondary" disabled={a.feedSwitched === true} onClick={() => set({ feedSwitched: true })}>{a.feedSwitched ? "✓ 切り替えた" : "切り替える"}</button>
          </li>
          <li>
            <span>差が閾値({INCIDENT.diffThreshold.toFixed(2)} {INCIDENT.unit})以内を{need}回連続で確認する: <strong>{confirmed.length}/{need}</strong></span>
            <button type="button" className="button secondary" disabled={a.feedSwitched !== true || !next || confirmed.length >= need} onClick={() => set({ confirmed: [...confirmed, next.time] })}>次のサンプルを確認</button>
            <button type="button" className="text-link" disabled={!confirmed.length} onClick={() => set({ confirmed: [] })}>やり直す</button>
            {confirmed.length > 0 && <ul className="blue-confirmed">{confirmed.map(t => { const r = recovery.find(x => x.time === t); return <li key={t}>{t} 推定 {r?.model.toFixed(2)} / 表示 {r?.display.toFixed(2)} / 差 {r ? trendDiff(r).toFixed(2) : "—"} {r && trendDiff(r) <= INCIDENT.diffThreshold ? "✓ 閾値以内" : "✗"}</li>; })}</ul>}
            {confirmed.length > 0 && confirmed.length < need && <p className="blue-help">あと{need - confirmed.length}回。{need}回連続で確認するまで次へ進めません。</p>}
          </li>
          <li>
            <span><Term name="現場手分析">現場手分析</Term>の結果(模擬): {INCIDENT.fieldAnalysis.at} 浄水池出口 {INCIDENT.fieldAnalysis.value.toFixed(2)} {INCIDENT.unit}(同時刻の独立モデル推定 {fieldRow?.model.toFixed(2) ?? "—"} {INCIDENT.unit})</span>
            <div className="blue-inline-choices">{fieldCheckChoices.map(c => <label key={c.id}><input type="radio" name="field-check" checked={a.fieldCheck === c.id} onChange={() => set({ fieldCheck: c.id })} /> {c.label}</label>)}</div>
          </li>
        </ol>
      </>;
    }
    case "RESTORE_SIMULATED_MONITORING":
      return <ul className="safe-mode-choices">{restoreTasks.map(t => <li key={t.id}><label><input type="checkbox" checked={has(a.tasks, t.id)} onChange={() => set({ tasks: toggle(a.tasks, t.id) })} /><span>{t.label}</span></label></li>)}</ul>;
  }
}
