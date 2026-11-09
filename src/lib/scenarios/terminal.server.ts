import { initialTerminal, type TerminalResult, type TerminalScene, type TerminalState } from "./terminal-lessons";
import type { MaterialView } from "./session-types";

interface Context { state: TerminalState; command: string; stageId: string; read: (stageId: string) => MaterialView }
const LOG = "/srv/aqua-lab/readonly/logs/aqua-access.log";
const README = "/home/aquareader/casefiles/README.txt";
const DIRECTORIES = ["/home/aquareader", "/home/aquareader/casefiles", "/srv/aqua-lab/readonly/logs"];
class CommandError extends Error { constructor(readonly code: string, message: string) { super(message); } }
function reject(code: string, message: string): never { throw new CommandError(code, message); }
// Tokenization only: no eval, shell, subprocess, fetch or real network call.
function parse(command: string): string[][] {
  if (!command.trim() || command.length > 512 || /[\r\n;&<>`$\\]/.test(command)) reject("INVALID_SYNTAX", "1行に1つのコマンドを入力してください。シェル展開・書き込み・連結は使いません。");
  const segments: string[][] = [[]]; let token = ""; let quoted = ""; let started = false;
  const push = () => { if (started) segments[segments.length - 1].push(token); token = ""; started = false; };
  for (const c of command.trim()) {
    if (quoted) { if (c === quoted) quoted = ""; else token += c; started = true; continue; }
    if (c === '"' || c === "'") { quoted = c; started = true; }
    else if (c === "|") { push(); segments.push([]); }
    else if (/\s/.test(c)) push();
    else { token += c; started = true; }
  }
  if (quoted) reject("INVALID_SYNTAX", "引用符を閉じてください。");
  push();
  if (segments.length > 3 || segments.some(s => !s.length)) reject("INVALID_SYNTAX", "パイプはgrep・headを使う3操作までです。");
  return segments;
}
function pathFor(input: string, cwd: string): string {
  const expanded = input === "~" || input.startsWith("~/") ? input.replace(/^~/, "/home/aquareader") : input;
  const parts = (expanded.startsWith("/") ? expanded : `${cwd}/${expanded}`).split("/");
  const resolved: string[] = [];
  for (const p of parts) { if (p === "..") resolved.pop(); else if (p && p !== ".") resolved.push(p); }
  return `/${resolved.join("/")}`;
}
export function simulateCommand(context: Context): TerminalResult {
  const state = { ...(context.state ?? initialTerminal()), observations: [...(context.state?.observations ?? [])] };
  const observe = (id: string) => { if (!state.observations.includes(id)) state.observations.push(id); };
  let scene: TerminalScene = "idle"; let title = "端末の操作"; let explanation = "ブラウザ内の仮想端末で操作しています。";
  let observation: string | undefined;
  let sourceIsLog = false;
  const accessFile = (path: string) => {
    if (state.host !== "target") reject("SSH_REQUIRED", "このファイルは訓練サーバー側にあります。ssh aquareader@aqua.lab.testで模擬接続してください。");
    if (path === README) { scene = "filesystem"; title = "許可されたファイルを読む"; explanation = "一般ユーザーが読み取れるREADMEの本文を確認します。"; observe("S04:readme"); observation = "S04:readme"; return context.read("S04").files[0].content; }
    if (path === LOG) { sourceIsLog = true; scene = "logs"; title = "アクセスログを調査"; explanation = "架空の通信記録を読み、送信元・UTC時刻・応答コードを照合します。"; const value = context.read("S05").files[0].content; observe("S05:log-read"); observation = "S05:log-read"; return value; }
    reject("PATH_NOT_FOUND", "そのパスは教材にありません。pwd・lsで場所を確認してください。");
  };
  try {
    const segments = parse(context.command);
    state.commandCount++;
    const [name, ...args] = segments[0]; let output = "";
    if (segments.length > 1 && !["cat", "grep"].includes(name)) reject("INVALID_SYNTAX", "パイプはcatまたはgrepの読み取り結果にだけ使用できます。");
    if (name === "help") {
      scene = "idle"; title = "コマンドの使い方を確認";
      output = "PROJECT AQUA / 模擬ターミナル\n使えるコマンド: nmap, curl, ssh, pwd, whoami, ls, cd, cat, grep, head, exit, clear, help\n対象ホスト: aqua.lab.test / HTTP 8080\nパイプ: cat・grepの出力をgrep・headへ渡せます。\n困ったら画面の「ヒントを生成」を使ってください。実Linuxへのコマンド実行は行いません。";
    } else if (name === "nmap") {
      if (args.at(-1) !== "aqua.lab.test") reject("TARGET_NOT_ALLOWED", "調査先は演習用ホストaqua.lab.testだけです。");
      const options = args.slice(0,-1);
      for (let i = 0; i < options.length; i++) {
        if (options[i] === "-sT") continue;
        if (options[i] === "-p" && options[i+1]?.split(",").sort().join(",") === "22,8080") { i++; continue; }
        reject("INVALID_SYNTAX", "この演習ではnmap -sT -p 22,8080 aqua.lab.testを使います。");
      }
      scene = "recon"; title = "公開ポートを偵察"; explanation = "調査端末から公開サービスの有無を確認する流れを模擬しています。設備の設定は変更しません。";
      output = "Nmap training simulation — aqua.lab.test\nHost is up (simulated).\nPORT      STATE SERVICE\n22/tcp    open  ssh\n8080/tcp  open  http\n調査対象は閉域の架空ホストです。実パケットは送信していません。";
      observe("S01:services"); observation = "S01:services";
    } else if (name === "curl") {
      const urls = args.filter(a => !["-s", "-sS"].includes(a));
      if (urls.length !== 1) reject("INVALID_SYNTAX", "curlの後に教材のURLを1つ入力してください。");
      let url: URL;
      try { url = new URL(urls[0]); } catch { reject("TARGET_NOT_ALLOWED", "http://aqua.lab.test:8080/で始まる教材URLを入力してください。"); }
      if (url.protocol !== "http:" || url.hostname !== "aqua.lab.test" || url.port !== "8080" || url.username || url.password || url.search || url.hash) reject("TARGET_NOT_ALLOWED", "HTTP 8080のaqua.lab.test以外へは接続できません。");
      const resources: Record<string, { stage: string; index: number; seen: string }> = {
        "/training/discovery": { stage: "S01", index: 0, seen: "S01:discovery" },
        "/": { stage: "S02", index: 0, seen: "S02:source" },
        "/training/inspection": { stage: "S02", index: 1, seen: "S02:inspection" },
        "/public/maintenance-note.txt": { stage: "S03", index: 0, seen: "S03:memo" },
      };
      const resource = resources[url.pathname];
      if (!resource) reject("PATH_NOT_FOUND", "そのURLは教材にありません。ページ内の手掛かりを確認してください。");
      output = context.read(resource.stage).files[resource.index].content;
      scene = resource.stage === "S03" ? "exposure" : "web"; title = resource.stage === "S03" ? "公開メモの情報露出を確認" : "Webの応答を読む";
      explanation = resource.stage === "S03" ? "公開領域に残った学習用アカウントの案内を読み、情報漏えいのリスクを評価します。" : "仮想HTTPサービスからHTML・JSON・テキストを取得し、応答内の手掛かりを探します。";
      observe(resource.seen); observation = resource.seen;
    } else if (name === "ssh") {
      if (args.length !== 1 || args[0] !== "aquareader@aqua.lab.test") reject("TARGET_NOT_ALLOWED", "学習用アカウントはaquareader@aqua.lab.testです。");
      context.read("S04"); state.host = "target"; state.cwd = "/home/aquareader";
      observe("S04:connected"); observation = "S04:connected"; scene = "ssh"; title = "一般ユーザーで模擬接続"; explanation = "接続先の表示を調査端末から訓練サーバーへ切り替えます。実SSH接続や認証情報の入力はありません。";
      output = "[模擬SSH] aquareader@aqua.lab.test\n許可範囲: ~/casefiles と /srv/aqua-lab/readonly/logs\n現在位置: /home/aquareader\n一般ユーザーとして読み取り調査を開始します。";
    } else if (name === "pwd" || name === "whoami") {
      if (args.length) reject("INVALID_SYNTAX", "このコマンドに引数は不要です。");
      output = name === "pwd" ? state.cwd : state.host === "target" ? "aquareader" : "learner"; scene = "filesystem"; title = "調査する場所とユーザーを確認"; explanation = "現在位置やユーザーを確認して、許可範囲を把握します。";
    } else if (name === "ls" || name === "cd") {
      if (state.host !== "target") reject("SSH_REQUIRED", "先にssh aquareader@aqua.lab.testで訓練サーバー側へ移ってください。");
      const options = args.filter(a => a.startsWith("-")); const paths = args.filter(a => !a.startsWith("-"));
      if (paths.length > 1 || options.some(o => !["-l", "-a", "-la", "-al"].includes(o)) || (name === "cd" && options.length)) reject("INVALID_SYNTAX", "ls [-l] [パス] またはcd [パス]を使ってください。");
      const path = pathFor(paths[0] ?? (name === "cd" ? "~" : "."), state.cwd);
      if (path === LOG || path === "/srv/aqua-lab/readonly/logs") context.read("S05"); else context.read("S04");
      scene = "filesystem"; title = name === "cd" ? "許可されたフォルダへ移動" : "ファイルの所在と権限を確認"; explanation = "仮想ファイルの所有者・読み取り権限を確認します。実ファイルは変更しません。";
      if (name === "cd") { if (!DIRECTORIES.includes(path)) reject("PATH_NOT_FOUND", "その場所へは移動できません。許可された教材フォルダを指定してください。"); state.cwd = path; output = ""; }
      else if (path === README || path === "/home/aquareader/casefiles") {
        if (options.some(o => o.includes("l"))) { observe("S04:permissions"); observation = "S04:permissions"; output = "-r--r--r-- 1 aquareader aquareader 256 Nov 02 2026 README.txt\n読み取り専用 / 数値表現: 0444"; }
        else output = "README.txt";
      } else if (path === LOG || path === "/srv/aqua-lab/readonly/logs") output = options.some(o => o.includes("l")) ? "-r--r--r-- 1 aquareader aquareader aqua-access.log" : "aqua-access.log";
      else if (path === "/home/aquareader") output = options.some(o => o.includes("l")) ? "dr-xr-xr-x 2 aquareader aquareader casefiles" : "casefiles/";
      else reject("PATH_NOT_FOUND", "そのパスは教材にありません。");
    } else if (name === "cat") {
      if (args.length !== 1 || args[0].startsWith("-")) reject("INVALID_SYNTAX", "catの後に読み取るファイルを1つ指定してください。");
      output = accessFile(pathFor(args[0], state.cwd));
    } else if (name === "grep") {
      const parts = args.filter(a => a !== "-n");
      if (parts.length !== 2 || args.some(a => a.startsWith("-") && a !== "-n")) reject("INVALID_SYNTAX", "grep [-n] <探す文字> <教材ファイル>を使います。");
      const text = accessFile(pathFor(parts[1], state.cwd));
      output = text.split("\n").map((line,i) => ({ line, number: i+1 })).filter(x => x.line.includes(parts[0])).map(x => `${args.includes("-n") ? `${x.number}:` : ""}${x.line}`).join("\n");
      if (pathFor(parts[1], state.cwd) === LOG && output) { observe("S05:log-filter"); observation = "S05:log-filter"; }
    } else if (name === "head") {
      if (args.length !== 3 || args[0] !== "-n" || !/^\d+$/.test(args[1]) || Number(args[1]) > 50) reject("INVALID_SYNTAX", "head -n <1〜50> <教材ファイル>を使います。");
      output = accessFile(pathFor(args[2], state.cwd)).split("\n").slice(0,Number(args[1])).join("\n");
    } else if (name === "exit") { if (args.length) reject("INVALID_SYNTAX", "exitに引数は不要です。"); state.host = "kali"; state.cwd = "/home/learner"; output = "模擬SSH接続を終了しました。"; }
    else if (name === "clear") { if (args.length) reject("INVALID_SYNTAX", "clearに引数は不要です。"); output = ""; }
    else reject("COMMAND_NOT_FOUND", "この演習では未対応のコマンドです。helpか「ヒントを生成」を使ってください。sudo・設定変更・実シェルの実行は行いません。");
    for (const [filter, ...args] of segments.slice(1)) {
      if (filter === "grep" && args.length === 1 && !args[0].startsWith("-")) {
        output = output.split("\n").filter(line => line.includes(args[0])).join("\n");
        if (sourceIsLog && output) { observe("S05:log-filter"); observation = "S05:log-filter"; }
      } else if (filter === "head" && args.length === 2 && args[0] === "-n" && /^[1-9]\d?$/.test(args[1]) && Number(args[1]) <= 50) output = output.split("\n").slice(0,Number(args[1])).join("\n");
      else reject("INVALID_SYNTAX", "パイプの後はgrep <文字>またはhead -n <1〜50>を使ってください。");
    }
    state.lastError = undefined;
    return { command: context.command, output: output.slice(0,12_000), exitCode: 0, scene, title, explanation, observation, terminal: state };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    // A rejected command never changes the simulated host, directory or observations.
    const unchanged = { ...context.state, observations: [...context.state.observations], lastError: error.code, commandCount: state.commandCount };
    return { command: context.command, output: error.message, exitCode: 1, scene: "blocked", title: "入力を確認してください", explanation: "コマンドは実シェルに渡さず、演習で認めた書き方と対象だけを解釈します。", terminal: unchanged };
  }
}
