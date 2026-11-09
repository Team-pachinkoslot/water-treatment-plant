import { ScenarioRuntimeError, LabError } from "./errors.server";
import { getScenarioMode, type StartedSession } from "./runtime.server";
import type { SessionAccess, ReportFields } from "./session-types";
import type { BlueActionCode } from "./aqua";
import { SimulatorScenarioRuntime } from "./simulator.server";
import { restoreCloudState, encodeCloudState, checkpointCookie, recentStarts } from "./cloud-state.server";

const COOKIE = "aqua_session";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function fail(code: string, message: string, status = 400): never { throw new LabError(code, message, status); }
function checkRequest(request: Request, mutation = false) {
  if (getScenarioMode() !== "simulator") throw new ScenarioRuntimeError();
  const url = new URL(request.url);
  // Vercel HTTPS origins and loopback development are supported. No target hosts are contacted.
  const local = (hostname: string) => ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
  const host = request.headers.get("host") ?? url.host;
  let authority: URL;
  try { authority = new URL(`${url.protocol}//${host}`); } catch { return fail("ORIGIN_REJECTED", "接続先を確認してください。", 403); }
  const matches = authority.host === url.host || (local(authority.hostname) && local(url.hostname) && authority.port === url.port);
  if (!matches || authority.username || authority.password || authority.host !== host || (authority.protocol !== "https:" && !local(authority.hostname))) fail("ORIGIN_REJECTED", "接続先を確認してください。", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") fail("ORIGIN_REJECTED", "同じサイトから操作してください。", 403);
  if (mutation) {
    if (request.headers.get("origin") !== authority.origin) fail("ORIGIN_REJECTED", "同じサイトから操作してください。", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) fail("INVALID_CONTENT_TYPE", "JSONで送信してください。", 415);
  }
}
export function sessionAccess(request: Request, id?: string): SessionAccess {
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const match = cookie?.match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!match) fail("AUTHENTICATION_REQUIRED", "テスト演習を開始してください。", 401);
  if (id && id !== "current" && id !== match[1]) fail("SESSION_NOT_FOUND", "セッションが見つかりません。", 404);
  return { sessionId: match[1], token: match[2] };
}
function response(value: Record<string, unknown>, request: Request, status = 200, runtime?: SimulatorScenarioRuntime, starts: number[] = [], started?: StartedSession) {
  const headers = new Headers(noStore);
  if (runtime) {
    const snapshot = runtime.cloudSnapshot();
    if (JSON.parse(snapshot).sessions.length === 1) {
      const cloudState = encodeCloudState(snapshot);
      value = { ...value, cloudState };
      headers.append("Set-Cookie", checkpointCookie(cloudState, starts, new URL(request.url).protocol === "https:"));
    }
  }
  if (started) headers.append("Set-Cookie", `${COOKIE}=${started.sessionId}.${started.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return Response.json(value, { status, headers });
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) fail("INVALID_BODY", "入力を確認してください。");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 512_000) { await reader.cancel(); fail("BODY_TOO_LARGE", "入力が長すぎます。", 413); }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("INVALID_BODY", "入力を確認してください。");
    return data;
  } catch { return fail("INVALID_BODY", "入力を確認してください。"); }
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function answersObject(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}
function evidenceFields(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === "string")) as Record<string, string>;
}
export async function handleSessionRequest(request: Request, id?: string, operation?: string) {
  let runtime: SimulatorScenarioRuntime | undefined;
  let starts: number[] = [];
  try {
    checkRequest(request, request.method !== "GET");
    const data = request.method === "POST" ? await body(request) : {};
    if (request.method === "POST" && !id) {
      starts = recentStarts(request);
      runtime = SimulatorScenarioRuntime.fromCloudSnapshot(undefined, starts);
      const started = await runtime.start(text(data.labId));
      starts.push(Date.now());
      return response({ session: started.session }, request, 201, runtime, starts, started);
    }
    const access = sessionAccess(request, id);
    const snapshot = restoreCloudState(request, data.cloudState);
    starts = recentStarts(request);
    runtime = SimulatorScenarioRuntime.fromCloudSnapshot(snapshot, starts);
    const ok = (value: Record<string, unknown>) => response(value, request, 200, runtime, starts);
    if ((!operation && request.method === "GET") || (operation === "restore" && request.method === "POST")) return ok({ session: await runtime.getSession(access) });
    if (operation === "materials") return fail("COMMAND_REQUIRED", "教材はターミナルのコマンドで調査してください。", 409);
    if (operation === "commands") return ok(await runtime.executeCommand(access, text(data.stageId), text(data.command)));
    if (request.method !== "POST") return fail("NOT_FOUND", "操作が見つかりません。", 404);
    if (operation === "reset") {
      const started = await runtime.reset(access);
      return response({ session: started.session }, request, 201, runtime, starts, started);
    }
    if (operation === "flags") return ok({ session: await runtime.submitFlag(access, text(data.stageId), text(data.flag), evidenceFields(data.evidence)) });
    if (operation === "hints") {
      const hint = await runtime.getHint(access, text(data.stageId), typeof data.index === "number" ? data.index : -1);
      return ok({ ...hint, session: await runtime.getSession(access) });
    }
    if (operation === "stage5-evidence") return ok(await runtime.stage5Evidence(access, { sourceIp: text(data.sourceIp), firstEventTimestampUtc: text(data.firstEventTimestampUtc) }));
    if (operation === "report") {
      const fields = evidenceFields(data.report);
      const report: ReportFields = { observations: text(fields.observations), evidence: text(fields.evidence), timeline: text(fields.timeline), improvements: text(fields.improvements), ...(text(data.track) === "blue" ? { impact: text(fields.impact) } : {}) };
      return ok({ session: await runtime.submitReport(access, text(data.track) as "red" | "blue", report) });
    }
    if (operation === "blue-actions") {
      return ok({ session: await runtime.performBlueAction(access, text(data.action) as BlueActionCode, answersObject(data.answers)) });
    }
    if (operation === "blue-check") return ok(await runtime.checkBlueStep(access, text(data.action) as BlueActionCode, answersObject(data.answers)));
    if (operation === "blue-hints") {
      const hint = await runtime.getBlueHint(access, text(data.action) as BlueActionCode, typeof data.index === "number" ? data.index : -1);
      return ok({ ...hint, session: await runtime.getSession(access) });
    }
    return fail("NOT_FOUND", "操作が見つかりません。", 404);
  } catch (error) {
    if (error instanceof LabError) {
      const maySave = ![401, 404, 410, 503].includes(error.status);
      return response({ error: { code: error.code, message: error.message } }, request, error.status, maySave ? runtime : undefined, starts);
    }
    return response({ error: { code: "INTERNAL_ERROR", message: "演習データを処理できませんでした。再読込してお試しください。" } }, request, 500);
  } finally { runtime?.dispose(); }
}
