import { simulateCommand } from "./terminal.server";
import { initialTerminal, generateCommandHint, terminalLessons, type TerminalState } from "./terminal-lessons";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, chmodSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { aquaScenario, type BlueActionCode, type BlueState } from "./aqua";
import { LabError } from "./errors.server";
import { readTelemetry } from "./telemetry.server";
import { BLUE_SCORING, chlorineScenario, createStepRules, stepScore, toTrendRows, type StepRule } from "./blue-steps";
import type { SessionAccess, SessionView, ReportFields, BlueAnswers, BlueCheckResult, BlueHint, BlueProgress, MaterialView } from "./session-types";
import type { ScenarioRuntimeAdapter } from "./runtime.server";

type StageId = (typeof aquaScenario.redStages)[number]["id"];
interface StoredSession {
  id: string;
  ownerHash: string;
  expiresAt: string;
  flags: Record<string, string>;
  completedStages: string[];
  stage5Verified: boolean;
  terminal?: TerminalState;
  attempts: Record<string, { count: number; since: number }>;
  blueState: BlueState;
  blueEvidenceAccepted: boolean;
  blue?: { startedAt?: string; steps: Partial<Record<BlueActionCode, { mistakes: number; hintLevel: number }>> };
  reports: { red: ReportFields | null; blue: ReportFields | null };
  events: SessionView["events"];
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(code: string, message: string, status = 400): never { throw new LabError(code, message, status); }
function stageId(value: string): StageId {
  if (!aquaScenario.redStages.some(s => s.id === value)) fail("INVALID_STAGE", "ステージが見つかりません。");
  return value as StageId;
}
function record(s: StoredSession, type: string, id?: string) {
  s.events.push({ at: new Date().toISOString(), type, ...(id ? { stageId: id } : {}) });
  s.events = s.events.slice(-100);
}
function nextStage(s: StoredSession) { return aquaScenario.redStages.find(x => !s.completedStages.includes(x.id))?.id ?? null; }
function requireStage(s: StoredSession, id: StageId) {
  const current = nextStage(s);
  if (!s.completedStages.includes(id) && id !== current) fail("STAGE_LOCKED", "前のステージを完了してください。", 409);
}
function attempt(s: StoredSession, key: string, limit = 10) {
  const now = Date.now();
  let bucket = s.attempts[key];
  if (!bucket || now - bucket.since >= 60_000) bucket = s.attempts[key] = { count: 0, since: now };
  if (bucket.count >= limit) fail("RATE_LIMITED", "試行回数の上限です。1分後に再試行してください。", 429);
  bucket.count++;
}
const fieldOk = (v: unknown) => typeof v === "string" && v.trim().length >= 10 && v.length <= 4000;
function reportComplete(r: ReportFields | null, track: "red" | "blue" = "red"): boolean {
  return !!r && [r.observations, r.evidence, r.timeline, r.improvements, ...(track === "blue" ? [r.impact] : [])].every(fieldOk);
}
// 防御パートの StepRule。固定教材(fixtures/blue)から一度だけ組み立てる。
let rulesCache: readonly StepRule[] | undefined;
function blueRules() {
  return rulesCache ??= createStepRules(chlorineScenario, { trend: toTrendRows(readTelemetry()), recovery: toTrendRows(readTelemetry(true)) });
}
const blueOrder: BlueState[] = ["anomaly_detected", "investigating", "input_isolated", "safe_mode", "verified", "recovered"];
function blueProgress(s: StoredSession): BlueProgress {
  const reached = blueOrder.indexOf(s.blueState);
  const steps = Object.fromEntries(blueRules().map(rule => {
    const rec = s.blue?.steps[rule.code] ?? { mistakes: 0, hintLevel: 0 };
    const completed = blueOrder.indexOf(rule.to) <= reached;
    return [rule.code, { ...rec, completed, max: rule.points, points: completed ? stepScore(rule, rec) : 0 }];
  })) as BlueProgress["steps"];
  return { startedAt: s.blue?.startedAt ?? null, steps };
}
function view(s: StoredSession): SessionView {
  const progress = blueProgress(s);
  const blueActions = Object.values(progress.steps).reduce((sum, step) => sum + step.points, 0);
  const score = { redFlags: s.completedStages.length * 8, redReport: reportComplete(s.reports.red) ? 10 : 0, blueActions, blueEvidence: s.blueEvidenceAccepted && reportComplete(s.reports.blue, "blue") ? BLUE_SCORING.reportPoints : 0, total: 0 };
  score.total = score.redFlags + score.redReport + score.blueActions + score.blueEvidence;
  return { id: s.id, labId: "water-01", mode: "simulator", expiresAt: s.expiresAt, completedStages: s.completedStages, nextStage: nextStage(s), terminal: s.terminal ?? initialTerminal(), blueState: s.blueState, blueEvidenceAccepted: s.blueEvidenceAccepted, blueProgress: progress, reports: s.reports, score, complete: s.completedStages.length === 5 && reportComplete(s.reports.red) && s.blueState === "recovered" && reportComplete(s.reports.blue, "blue"), events: s.events };
}
function logs() { return readFileSync(join(process.cwd(), "fixtures/red/logs/aqua-access.log"), "utf8").trim(); }
function stage5Answer() {
  const groups = new Map<string, string[]>();
  for (const line of logs().split("\n")) {
    const [time, ip, , , status] = line.trim().split(/\s+/);
    if (status === "401") groups.set(ip, [...(groups.get(ip) ?? []), time]);
  }
  const matches = [...groups].filter(([, times]) => times.length >= 3 && Date.parse(times[2]) - Date.parse(times[0]) <= 60_000);
  if (matches.length !== 1) fail("FIXTURE_INVALID", "ログ教材の正解を一意に決定できません。", 500);
  return { ip: matches[0][0], time: matches[0][1][0] };
}

export class SimulatorScenarioRuntime implements ScenarioRuntimeAdapter {
  readonly mode = "simulator" as const;
  private memoryDb?: DatabaseSync;
  constructor(private readonly databasePath = resolve(process.cwd(), ".local/aqua.sqlite")) {}

  private open() {
    if (this.memoryDb) return this.memoryDb;
    const memory = this.databasePath === ":memory:";
    if (!memory) mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(this.databasePath, { timeout: 5000 });
    if (!memory) chmodSync(this.databasePath, 0o600);
    db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS starts (at INTEGER NOT NULL);");
    if (memory) this.memoryDb = db;
    return db;
  }
  private release(db: DatabaseSync) { if (db !== this.memoryDb) db.close(); }
  dispose() { this.memoryDb?.close(); this.memoryDb = undefined; }

  // A Vercel request uses a fresh in-memory DB. No writable filesystem or shared process is needed.
  static fromCloudSnapshot(snapshot?: string, starts: number[] = []) {
    const runtime = new SimulatorScenarioRuntime(":memory:");
    const db = runtime.open();
    if (snapshot) {
      const data = JSON.parse(snapshot) as { version: number; sessions: { id: string; data: string }[] };
      if (data.version !== 1 || !Array.isArray(data.sessions) || data.sessions.length !== 1) {
        runtime.dispose();
        fail("INVALID_CLOUD_STATE", "演習データの形式が正しくありません。", 409);
      }
      for (const row of data.sessions) db.prepare("INSERT INTO sessions(id, data) VALUES (?, ?)").run(row.id, row.data);
    }
    for (const at of starts) db.prepare("INSERT INTO starts(at) VALUES (?)").run(at);
    return runtime;
  }
  cloudSnapshot() {
    if (!this.memoryDb) fail("INVALID_CLOUD_STATE", "演習データがありません。", 409);
    return JSON.stringify({ version: 1, sessions: this.memoryDb.prepare("SELECT id, data FROM sessions").all() });
  }
  private insert(db: DatabaseSync) {
    const token = randomBytes(32).toString("hex");
    const s: StoredSession = { id: randomUUID(), ownerHash: hash(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), flags: Object.fromEntries(aquaScenario.redStages.map(stage => [stage.id, `AQUA{${stage.id}_${randomBytes(24).toString("hex")}}`])), completedStages: [], stage5Verified: false, terminal: initialTerminal(), attempts: {}, blueState: "anomaly_detected", blueEvidenceAccepted: false, reports: { red: null, blue: null }, events: [] };
    record(s, "SESSION_STARTED");
    db.prepare("INSERT INTO sessions (id, data) VALUES (?, ?)").run(s.id, JSON.stringify(s));
    return { sessionId: s.id, token, session: view(s) };
  }
  private transaction<T>(access: SessionAccess, operation: (s: StoredSession, db: DatabaseSync) => T): T {
    const db = this.open();
    let s: StoredSession | undefined;
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db.prepare("SELECT data FROM sessions WHERE id = ?").get(access.sessionId) as { data: string } | undefined;
      if (!row || !/^[a-f0-9]{64}$/.test(access.token)) fail("SESSION_NOT_FOUND", "セッションが見つかりません。", 404);
      s = JSON.parse(row.data) as StoredSession;
      if (!timingSafeEqual(Buffer.from(s.ownerHash, "hex"), Buffer.from(hash(access.token), "hex"))) fail("SESSION_NOT_FOUND", "セッションが見つかりません。", 404);
      if (Date.parse(s.expiresAt) <= Date.now()) fail("SESSION_EXPIRED", "セッションの有効期限が切れました。新しく開始してください。", 410);
      const result = operation(s, db);
      db.prepare("UPDATE sessions SET data = ? WHERE id = ?").run(JSON.stringify(s), s.id);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      // Preserve failed attempts and audit events, but never submitted secret values.
      if (s && error instanceof LabError && !["SESSION_NOT_FOUND", "SESSION_EXPIRED"].includes(error.code)) {
        record(s, `REJECTED_${error.code}`);
        db.prepare("UPDATE sessions SET data = ? WHERE id = ?").run(JSON.stringify(s), s.id);
        db.exec("COMMIT");
      } else db.exec("ROLLBACK");
      throw error;
    } finally { this.release(db); }
  }
  async start(labId: string) {
    if (labId !== "water-01") fail("LAB_NOT_FOUND", "テスト演習はLAB 01のみ対応しています。", 404);
    const db = this.open();
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("DELETE FROM starts WHERE at < ?").run(Date.now() - 60_000);
      db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.expiresAt') <= ?").run(new Date().toISOString());
      const count = db.prepare("SELECT count(*) as n FROM starts").get() as { n: number };
      if (count.n >= 10) fail("RATE_LIMITED", "開始回数の上限です。1分後に再試行してください。", 429);
      db.prepare("INSERT INTO starts(at) VALUES (?)").run(Date.now());
      const result = this.insert(db);
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; } finally { this.release(db); }
  }
  async getSession(access: SessionAccess) { return this.transaction(access, s => view(s)); }
  async reset(access: SessionAccess) {
    return this.transaction(access, (_s, db) => {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(access.sessionId);
      return this.insert(db);
    });
  }
  private material(s: StoredSession, stage: string): MaterialView {
    const id = stageId(stage); requireStage(s, id);
      const flag = s.flags[id];
      const materials: Record<StageId, MaterialView["files"]> = {
        S01: [{ path: "/training/discovery", content: JSON.stringify({ trainingOnly: true, target: "aqua.lab.test (ブラウザ内教材・接続先ではありません)", services: [{ port: 22, name: "SSH" }, { port: 8080, name: "HTTP" }], flag }, null, 2) }],
        S02: [{ path: "/ (HTMLソースの教材)", content: '<h1>七王子市中央浄水場 / 点検記録</h1>\n<!-- 点検資料: /training/inspection -->' }, { path: "/training/inspection", content: `点検記録は読み取り専用です。\n公開メモ: /public/maintenance-note.txt\nStage 02 FLAG: ${flag}` }],
        S03: [{ path: "/public/maintenance-note.txt", content: `公開すべきでない訓練用ログイン案内が残された例です。\n学習専用ユーザー: aquareader\nパスワード: このテストでは発行せず、SSH接続も行いません。\n改善策と情報漏えいリスクを記録してください。\nStage 03 FLAG: ${flag}` }],
        S04: [{ path: "/home/aquareader/casefiles/README.txt (仮想ファイル)", content: `-r--r--r-- 1 aquareader aquareader README.txt\nこの仮想ファイルの権限は0444（読み取り専用）です。\nStage 04 FLAG: ${flag}` }],
        S05: [{ path: "/srv/aqua-lab/readonly/logs/aqua-access.log (架空・UTC)", content: logs() }],
      };
      // Return only this stage's material; never serialize the complete dictionary.
      return { stageId: id, files: materials[id] };
  }
  async getMaterials(access: SessionAccess, stage: string): Promise<MaterialView> {
    return this.transaction(access, s => this.material(s, stage));
  }
  async executeCommand(access: SessionAccess, stage: string, command: string) {
    return this.transaction(access, s => {
      const id = stageId(stage); requireStage(s, id);
      attempt(s, "terminal-commands", 60);
      const result = simulateCommand({ state: s.terminal ?? initialTerminal(), stageId: id, command, read: requested => this.material(s, requested) });
      s.terminal = result.terminal;
      record(s, result.exitCode === 0 ? `COMMAND_${result.scene.toUpperCase()}` : `COMMAND_REJECTED_${result.terminal.lastError}`, id);
      return { result, session: view(s) };
    });
  }
  async getHint(access: SessionAccess, stage: string, index: number) {
    return this.transaction(access, s => {
      const id = stageId(stage); requireStage(s, id);
      if (!Number.isInteger(index) || index < 0 || index > 2) fail("INVALID_HINT", "ヒントを選び直してください。");
      record(s, `HINT_${index + 1}_VIEWED`, id);
      return generateCommandHint(id, s.terminal ?? initialTerminal(), index);
    });
  }
  async stage5Evidence(access: SessionAccess, answer: { sourceIp: string; firstEventTimestampUtc: string }) {
    return this.transaction(access, s => {
      requireStage(s, "S05"); attempt(s, "evidence-S05");
      if (!terminalLessons.S05.steps.every(step => s.terminal?.observations.includes(step.observation))) fail("COMMAND_REQUIRED", "ターミナルでログを読み、grepで記録を絞り込んでください。", 409);
      const expected = stage5Answer();
      if (answer.sourceIp !== expected.ip || answer.firstEventTimestampUtc !== expected.time) fail("EVIDENCE_INCORRECT", "送信元と最初のUTC時刻をログで確認してください。");
      s.stage5Verified = true; record(s, "STAGE5_EVIDENCE_ACCEPTED", "S05");
      return { flag: s.flags.S05 };
    });
  }
  async submitFlag(access: SessionAccess, stage: string, flag: string, evidence: Record<string, string> = {}) {
    return this.transaction(access, s => {
      const id = stageId(stage); requireStage(s, id);
      if (s.completedStages.includes(id)) return view(s);
      attempt(s, `flag-${id}`);
      if (typeof flag !== "string" || flag.length > 160 || hash(flag) !== hash(s.flags[id])) fail("FLAG_INCORRECT", "FLAGが一致しません。教材を確認してください。");
      if (!terminalLessons[id].steps.every(step => s.terminal?.observations.includes(step.observation))) fail("COMMAND_REQUIRED", "先にターミナルでこのステージの調査を行ってください。", 409);
      if (id === "S01" && evidence.ports?.split(/[,、\s]+/).filter(Boolean).sort().join(",") !== "22,8080") fail("EVIDENCE_REQUIRED", "公開ポートを2つ記録してください。");
      if (id === "S03" && (!evidence.risk || evidence.risk.trim().length < 10)) fail("EVIDENCE_REQUIRED", "情報公開のリスクを10文字以上で記述してください。");
      if (id === "S04" && !["0444", "444", "-r--r--r--", "r--r--r--"].includes(evidence.permission)) fail("EVIDENCE_REQUIRED", "読み取り専用ファイルの権限を記録してください。");
      if (id === "S05" && !s.stage5Verified) fail("EVIDENCE_REQUIRED", "ログの根拠回答を先に提出してください。");
      s.completedStages.push(id); record(s, "FLAG_ACCEPTED", id);
      return view(s);
    });
  }
  async submitReport(access: SessionAccess, track: "red" | "blue", report: ReportFields) {
    return this.transaction(access, s => {
      if (!["red", "blue"].includes(track)) fail("INVALID_TRACK", "トラックを選び直してください。");
      if (!reportComplete(report, track)) fail("REPORT_INCOMPLETE", "各項目を10文字以上4000文字以内で記入してください。");
      if (s.completedStages.length !== 5 || (track === "blue" && s.blueState !== "recovered")) fail("REPORT_LOCKED", "必要な演習手順を先に完了してください。", 409);
      // Copy only the documented fields to persistence and response.
      s.reports[track] = { observations: report.observations.trim(), evidence: report.evidence.trim(), timeline: report.timeline.trim(), improvements: report.improvements.trim(), ...(track === "blue" ? { impact: report.impact!.trim() } : {}) };
      record(s, `${track.toUpperCase()}_REPORT_SAVED`);
      return view(s);
    });
  }
  // 防御パート共通: 解放条件・現在の STEP・判断の評価と誤選択の記録。
  private blueStep(s: StoredSession, action: BlueActionCode) {
    if (s.completedStages.length !== 5 || !s.reports.red) fail("BLUE_LOCKED", "5つのFLAGと調査レポートを先に提出してください。", 409);
    const rule = blueRules().find(r => r.code === action);
    if (!rule) return fail("INVALID_STATE_TRANSITION", "対応手順が見つかりません。", 409);
    if (rule.from !== s.blueState) fail("INVALID_STATE_TRANSITION", "対応手順の順番が正しくありません。", 409);
    s.blue ??= { steps: {} };
    s.blue.startedAt ??= new Date().toISOString();
    return rule;
  }
  private judgeBlue(s: StoredSession, rule: StepRule, answers: BlueAnswers) {
    attempt(s, `blue-${rule.code}`, 20);
    const result = rule.evaluate(answers);
    if (!result.ok && result.inappropriate) {
      const rec = s.blue!.steps[rule.code] ??= { mistakes: 0, hintLevel: 0 };
      rec.mistakes++;
    }
    return result;
  }
  async checkBlueStep(access: SessionAccess, action: BlueActionCode, answers: BlueAnswers = {}): Promise<{ result: BlueCheckResult; session: SessionView }> {
    return this.transaction(access, s => {
      const rule = this.blueStep(s, action);
      const { ok, feedback } = this.judgeBlue(s, rule, answers);
      record(s, ok ? "BLUE_CHECK_PASSED" : "BLUE_CHECK_REJECTED", rule.code);
      return { result: { ok, feedback }, session: view(s) };
    });
  }
  async getBlueHint(access: SessionAccess, action: BlueActionCode, index: number): Promise<BlueHint> {
    return this.transaction(access, s => {
      const rule = this.blueStep(s, action);
      if (!Number.isInteger(index) || index < 0 || index > 2) fail("INVALID_HINT", "ヒントを選び直してください。");
      const rec = s.blue!.steps[rule.code] ??= { mistakes: 0, hintLevel: 0 };
      rec.hintLevel = Math.max(rec.hintLevel, index + 1);
      record(s, `BLUE_HINT_${index + 1}_VIEWED`, rule.code);
      return { hint: rule.hints[index], level: index, step: rule.title };
    });
  }
  async performBlueAction(access: SessionAccess, action: BlueActionCode, answers: BlueAnswers = {}) {
    return this.transaction(access, s => {
      const rule = this.blueStep(s, action);
      // 状態遷移は StepRule.canAdvance(evaluate().ok)を満たしたときだけ。誤りは理由つきで返す。
      const result = this.judgeBlue(s, rule, answers);
      if (!result.ok) {
        const message = result.feedback.map(f => f.message).join(" ");
        if (action === "VERIFY_STABLE") fail("VERIFICATION_REQUIRED", message, 409);
        fail("EVIDENCE_REQUIRED", message);
      }
      if (action === "ACKNOWLEDGE_ANOMALY") s.blueEvidenceAccepted = true;
      s.blueState = rule.to; record(s, action);
      return view(s);
    });
  }
}
