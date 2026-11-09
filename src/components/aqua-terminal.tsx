"use client";
import { useRef, useState } from "react";
import { ArrowUp, Lightbulb, Terminal, ChevronRight, CheckCircle2 } from "lucide-react";
import { AttackVisualization } from "./attack-visualization";
import { initialTerminal, lessonProgress, terminalLessons, type CommandHint, type TerminalResult, type TerminalState } from "@/lib/scenarios/terminal-lessons";

interface Entry { command: string; output: string; error: boolean }
export function AquaTerminal({ stageId, terminal = initialTerminal(), busy, execute, hint }: { stageId: string; terminal?: TerminalState; busy: boolean; execute: (command: string) => Promise<TerminalResult>; hint: (index: number) => Promise<CommandHint> }) {
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [phase, setPhase] = useState<"sending" | "processing" | "complete" | "error">("complete");
  const [sequence, setSequence] = useState(0);
  const [generated, setGenerated] = useState<CommandHint | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const lesson = terminalLessons[stageId];
  const progress = lessonProgress(stageId, terminal);
  const disabled = busy || pending || hintLoading;
  async function submit() {
    const value = command.trim(); if (!value || disabled) return;
    setPending(true); setCommand(""); setHistoryIndex(-1); setPhase("sending"); setSequence(n => n+1);
    setCommands(previous => [...previous, value].slice(-50));
    const began = Date.now();
    const processing = setTimeout(() => setPhase("processing"), 240);
    try {
      const response = await execute(value);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 750 - (Date.now() - began))));
      setResult(response); setPhase(response.exitCode === 0 ? "complete" : "error");
      if (value === "clear" && response.exitCode === 0) setEntries([]);
      else setEntries(previous => [...previous, { command: value, output: response.output, error: response.exitCode !== 0 }].slice(-30));
      if (response.observation) { setGenerated(null); setHintLevel(0); }
    } catch (error) {
      setPhase("error");
      setEntries(previous => [...previous, { command: value, output: error instanceof Error ? error.message : "実行結果を取得できませんでした。", error: true }].slice(-30));
    } finally {
      clearTimeout(processing); setPending(false);
      requestAnimationFrame(() => { input.current?.focus(); log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); });
    }
  }
  async function generate(level: number) {
    if (disabled) return;
    setHintLoading(true);
    try { setGenerated(await hint(level)); setHintLevel(level); }
    catch (error) { setEntries(previous => [...previous, { command: "[ヒント]", output: error instanceof Error ? error.message : "ヒントを取得できませんでした。", error: true }]); }
    finally { setHintLoading(false); }
  }
  return <div className="terminal-workspace">
    <div className="terminal-primary">
      <section className="training-terminal" aria-label="ブラウザ内の模擬ターミナル">
        <header className="terminal-titlebar"><span className="terminal-window-dots"><i/><i/><i/></span><span><Terminal size={14}/> AQUA TERMINAL</span><strong>SIMULATED</strong></header>
        <div className="terminal-context"><span>{terminal.host === "target" ? "aquareader@aqua.lab.test" : "learner@ics-kali"}</span><span>{terminal.cwd}</span></div>
        <div className="terminal-log" ref={log} role="log" aria-label="コマンド実行履歴" aria-live="polite" aria-relevant="additions text">
          <div className="terminal-welcome"><strong>PROJECT AQUA / STAGE {stageId.slice(1)}</strong><p>コマンドを入力して、調査結果を読み取ってください。<br/>使い方はhelp、書き方の案内は「ヒントを生成」。</p><p className="terminal-muted">実Linuxへ接続しない、演習用の仮想端末です。</p></div>
          {entries.map((entry,i) => <div className="terminal-entry" key={i}><div className="terminal-command"><span aria-hidden="true">❯</span> {entry.command}</div>{entry.output && <pre className={entry.error ? "terminal-output terminal-error" : "terminal-output"}>{entry.output}</pre>}</div>)}
          {pending && <div className="terminal-pending" role="status"><span/> {phase === "sending" ? "コマンドを確認しています…" : "教材の応答を再現しています…"}</div>}
        </div>
        <form className="terminal-command-form" onSubmit={e => { e.preventDefault(); void submit(); }}><label className="sr-only" htmlFor={`command-${stageId}`}>模擬ターミナルのコマンド</label><ChevronRight size={17}/><input ref={input} id={`command-${stageId}`} name="command" value={command} onChange={e => setCommand(e.target.value)} placeholder="コマンドを入力 / help" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} disabled={disabled} onKeyDown={e => {
          if (e.key === "ArrowUp") { e.preventDefault(); const index = historyIndex < 0 ? commands.length-1 : Math.max(0,historyIndex-1); setHistoryIndex(index); setCommand(commands[index] ?? ""); }
          else if (e.key === "ArrowDown") { e.preventDefault(); const index = historyIndex + 1; setHistoryIndex(index >= commands.length ? -1 : index); setCommand(commands[index] ?? ""); }
        }}/><button type="submit" disabled={disabled || !command.trim()} aria-label="コマンドを実行"><ArrowUp size={17}/><span>実行</span></button></form>
        <footer className="terminal-footer"><span>Enterで実行 / ↑↓で入力履歴</span><button type="button" disabled={disabled} onClick={() => { setCommand("help"); input.current?.focus(); }}>helpを入力</button></footer>
      </section>
      <section className="command-hint-panel panel" aria-label="進捗に応じたコマンドヒント">
        <div className="command-hint-heading"><div><Lightbulb size={18}/><h3>何を入力すればいい？</h3></div><span>次の一手を案内</span></div>
        <p>いまの調査状況と入力エラーに合わせて、段階的にヒントを作ります。</p>
        <div className="hint-levels">{["考え方", "書き方", "実行例"].map((label,index) => <button key={label} disabled={disabled} aria-pressed={generated?.level === index} onClick={() => void generate(index)}><span>0{index+1}</span>{label}</button>)}</div>
        {!generated ? <button className="button secondary" disabled={disabled} onClick={() => void generate(0)}>{hintLoading ? "ヒントを生成中…" : "ヒントを生成"}</button> : <div className="generated-hint"><small>{generated.step}</small><p>{generated.hint}</p>{generated.command && <div className="command-example"><code>{generated.command}</code><button disabled={disabled} onClick={() => { setCommand(generated.command!); input.current?.focus(); }}>入力欄に入れる</button></div>}<p className="hint-explanation">{generated.explanation}</p>{hintLevel < 2 && <button className="text-link" disabled={disabled} onClick={() => void generate(hintLevel + 1)}>もう少し具体的なヒント →</button>}<button className="text-link hint-refresh" disabled={disabled} onClick={() => void generate(hintLevel)}>現在の進捗で作り直す</button></div>}
      </section>
    </div>
    <div className="terminal-visual-column">
      <AttackVisualization scene={result?.scene ?? (pending ? lesson.scene : "idle")} phase={phase} title={result?.title} explanation={result?.explanation} sequence={sequence}/>
      <section className="panel terminal-observations"><div className="eyebrow">INVESTIGATION CHECKPOINTS</div><h3>確認できたこと <span>{progress.done} / {progress.total}</span></h3><ul>{lesson.steps.map(step => <li key={step.observation} className={terminal.observations.includes(step.observation) ? "is-observed" : ""}><CheckCircle2 size={16}/><span>{step.concept}</span></li>)}</ul><p>コマンドの結果はターミナルに表示されます。FLAGと根拠を読み取り、下のフォームへ提出してください。</p></section>
    </div>
  </div>;
}
