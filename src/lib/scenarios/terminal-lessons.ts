export type TerminalScene = "idle" | "recon" | "web" | "exposure" | "ssh" | "filesystem" | "logs" | "blocked" | "detect" | "isolate" | "safe-mode" | "verify" | "recover";
export interface TerminalState {
  host: "kali" | "target";
  cwd: string;
  observations: string[];
  commandCount: number;
  lastError?: string;
}
export interface TerminalResult {
  command: string;
  output: string;
  exitCode: number;
  scene: TerminalScene;
  title: string;
  explanation: string;
  observation?: string;
  terminal: TerminalState;
}
export interface CommandHint { hint: string; command?: string; explanation: string; step: string; level: number }
export interface TerminalLessonStep { observation: string; concept: string; syntax: string; command: string; explanation: string }
export const initialTerminal = (): TerminalState => ({ host: "kali", cwd: "/home/learner", observations: [], commandCount: 0 });
export const terminalLessons: Record<string, { title: string; scene: TerminalScene; steps: TerminalLessonStep[] }> = {
  S01: { title: "公開サービスを調べる", scene: "recon", steps: [
    { observation: "S01:services", concept: "最初に、演習ホストで公開されているポートとサービスを確認します。", syntax: "nmap -sT -p <ポート番号> <演習ホスト>", command: "nmap -sT -p 22,8080 aqua.lab.test", explanation: "-sTはTCP接続の調査、-pは確認するポートです。ここでは模擬結果だけを返します。" },
    { observation: "S01:discovery", concept: "HTTPサービスを見つけたら、サービス一覧のページを取得しましょう。", syntax: "curl http://<演習ホスト>:8080/training/discovery", command: "curl http://aqua.lab.test:8080/training/discovery", explanation: "curlはページの本文を表示します。レスポンスからポート情報とFLAGを読み取ります。" },
  ] },
  S02: { title: "HTMLに残る手掛かりを読む", scene: "web", steps: [
    { observation: "S02:source", concept: "Webページは見た目だけでなくHTMLソースも手掛かりになります。まずトップページを読みます。", syntax: "curl http://<演習ホスト>:8080/", command: "curl http://aqua.lab.test:8080/", explanation: "HTMLコメントは<!-- ... -->です。画面に表示されない点検資料のパスを探しましょう。" },
    { observation: "S02:inspection", concept: "HTMLコメントで見つけたパスの本文を取得します。", syntax: "curl http://<演習ホスト>:8080/<見つけたパス>", command: "curl http://aqua.lab.test:8080/training/inspection", explanation: "点検記録に進み、FLAGと次の調査先の手掛かりを読みます。" },
  ] },
  S03: { title: "公開メモの情報露出を確認する", scene: "exposure", steps: [
    { observation: "S03:memo", concept: "点検記録で案内された公開メモを取得し、情報管理の問題を探します。", syntax: "curl http://<演習ホスト>:8080/public/<公開メモ>", command: "curl http://aqua.lab.test:8080/public/maintenance-note.txt", explanation: "訓練用アカウントの案内が公開されている例です。何がリスクで、どう分離すべきか考えます。" },
  ] },
  S04: { title: "一般ユーザーのファイルと権限を調べる", scene: "filesystem", steps: [
    { observation: "S04:connected", concept: "許可された学習用アカウントで、調査端末から訓練サーバー側へ移ります。", syntax: "ssh <学習ユーザー>@<演習ホスト>", command: "ssh aquareader@aqua.lab.test", explanation: "画面内で接続状態を切り替える模擬SSHです。実サーバーやパスワードは使いません。" },
    { observation: "S04:permissions", concept: "pwdやlsで現在位置とファイルを確認します。所有者・権限の表示にはls -lを使います。", syntax: "ls -l <調査ファイルのパス>", command: "ls -l /home/aquareader/casefiles/README.txt", explanation: "-r--r--r--は全員に読み取りだけを許可する表示です。数値表現は0444です。" },
    { observation: "S04:readme", concept: "読み取りを許可されたREADMEの本文を表示しましょう。", syntax: "cat <調査ファイルのパス>", command: "cat /home/aquareader/casefiles/README.txt", explanation: "catは本文を表示します。cdでcasefilesへ移動すればcat README.txtでも読めます。" },
  ] },
  S05: { title: "ログから不審な記録を絞り込む", scene: "logs", steps: [
    { observation: "S05:log-read", concept: "まずログ全体の形式を確認します。各行にUTC時刻・送信元・URL・応答コードがあります。", syntax: "cat <アクセスログのパス>", command: "cat /srv/aqua-lab/readonly/logs/aqua-access.log", explanation: "401は認証が必要な応答です。単独で悪意を断定せず、同一IPの短時間連続記録を調べます。" },
    { observation: "S05:log-filter", concept: "grepで401の行を抽出し、送信元と最初のUTC時刻を確認します。", syntax: "grep 401 <アクセスログ> | head -n <行数>", command: "grep 401 /srv/aqua-lab/readonly/logs/aqua-access.log | head -n 3", explanation: "grepで一致行を抽出し、パイプでheadへ渡します。head -n 1なら最初の1行だけ確認できます。" },
  ] },
};
export function lessonProgress(stage: string, terminal: TerminalState) {
  const steps = terminalLessons[stage]?.steps ?? [];
  return { done: steps.filter(s => terminal.observations.includes(s.observation)).length, total: steps.length };
}
export function generateCommandHint(stage: string, terminal: TerminalState, level: number): CommandHint {
  const lesson = terminalLessons[stage];
  const next = lesson.steps.find(s => !terminal.observations.includes(s.observation));
  if (!next) return { hint: "調査に必要なコマンドは確認できました。出力からFLAGと証拠をフォームへ記録してください。", explanation: "Stage 05ではログの根拠回答が正しい場合にFLAGが払い出されます。", step: "証拠を提出", level };
  const connection = stage === "S05" && terminal.host !== "target";
  const step = connection ? terminalLessons.S04.steps[0] : next;
  const errorContext: Record<string, string> = { TARGET_NOT_ALLOWED: "調査先はaqua.lab.testに限定されています。", COMMAND_NOT_FOUND: "helpでこの演習に使えるコマンドを確認できます。", PATH_NOT_FOUND: "pwdで現在位置を確認し、絶対パスを使うと場所を間違えにくくなります。", SSH_REQUIRED: "先に模擬SSHで訓練サーバー側へ移りましょう。", INVALID_SYNTAX: "コマンドは1行で入力します。複数操作をまとめず、1つずつ実行してください。" };
  const prefix = terminal.lastError ? errorContext[terminal.lastError] : undefined;
  return { hint: [prefix, level === 0 ? step.concept : level === 1 ? `書き方：${step.syntax}` : "このコマンドを入力して実行してみましょう。"].filter(Boolean).join(" "), ...(level === 2 ? { command: step.command } : {}), explanation: step.explanation, step: connection ? "訓練サーバー側へ移動" : lesson.title, level };
}
