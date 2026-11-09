import { ScenarioRuntimeError, LabError } from "./errors.server";
import { getScenarioMode, getScenarioRuntime, type StartedSession } from "./runtime.server";
import type { SessionAccess, ReportFields } from "./session-types";
import type { BlueActionCode } from "./aqua";

const COOKIE = "aqua_session";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function fail(code: string, message: string, status = 400): never { throw new LabError(code, message, status); }
function checkRequest(request: Request, mutation = false) {
  if (getScenarioMode() !== "simulator") throw new ScenarioRuntimeError();
  const url = new URL(request.url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) fail("LOCAL_ONLY", "テスト演習はローカル環境専用です。", 403);
  // Next.js may normalize request.url to localhost even for a 127.0.0.1 request.
  // Validate both authorities as loopback; compare Origin to the actual Host header.
  const host = request.headers.get("host") ?? url.host;
  let authority: URL;
  try { authority = new URL(`${url.protocol}//${host}`); } catch { return fail("LOCAL_ONLY", "接続先を確認してください。", 403); }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(authority.hostname) || authority.port !== url.port || authority.username || authority.password || authority.host !== host) fail("LOCAL_ONLY", "接続先を確認してください。", 403);
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
function response(value: unknown, status = 200, started?: StartedSession) {
  return Response.json(value, { status, headers: { ...noStore, ...(started ? { "Set-Cookie": `${COOKIE}=${started.sessionId}.${started.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` } : {}) } });
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
    if (length > 24_000) { await reader.cancel(); fail("BODY_TOO_LARGE", "入力が長すぎます。", 413); }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("INVALID_BODY", "入力を確認してください。");
    return data;
  } catch { return fail("INVALID_BODY", "入力を確認してください。"); }
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function evidenceFields(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === "string")) as Record<string, string>;
}
export async function handleSessionRequest(request: Request, id?: string, operation?: string) {
  try {
    checkRequest(request, request.method !== "GET");
    const runtime = getScenarioRuntime();
    if (request.method === "POST" && !id) {
      const data = await body(request);
      const started = await runtime.start(text(data.labId));
      return response({ session: started.session }, 201, started);
    }
    const access = sessionAccess(request, id);
    if (request.method === "GET" && !operation) return response({ session: await runtime.getSession(access) });
    if (request.method === "GET" && operation === "materials") return response(await runtime.getMaterials(access, new URL(request.url).searchParams.get("stageId") ?? ""));
    if (request.method !== "POST") return fail("NOT_FOUND", "操作が見つかりません。", 404);
    const data = await body(request);
    if (operation === "reset") {
      const started = await runtime.reset(access);
      return response({ session: started.session }, 201, started);
    }
    if (operation === "flags") return response({ session: await runtime.submitFlag(access, text(data.stageId), text(data.flag), evidenceFields(data.evidence)) });
    if (operation === "hints") return response(await runtime.getHint(access, text(data.stageId), Number(data.index)));
    if (operation === "stage5-evidence") return response(await runtime.stage5Evidence(access, { sourceIp: text(data.sourceIp), firstEventTimestampUtc: text(data.firstEventTimestampUtc) }));
    if (operation === "report") {
      const fields = evidenceFields(data.report);
      const report: ReportFields = { observations: text(fields.observations), evidence: text(fields.evidence), timeline: text(fields.timeline), improvements: text(fields.improvements) };
      return response({ session: await runtime.submitReport(access, text(data.track) as "red" | "blue", report) });
    }
    if (operation === "blue-actions") {
      return response({ session: await runtime.performBlueAction(access, text(data.action) as BlueActionCode, { timestamps: Array.isArray(data.timestamps) ? data.timestamps.filter((v): v is string => typeof v === "string") : [], explanation: text(data.explanation) }) });
    }
    return fail("NOT_FOUND", "操作が見つかりません。", 404);
  } catch (error) {
    if (error instanceof LabError) return response({ error: { code: error.code, message: error.message } }, error.status);
    // Never serialize DB paths, cookies, answers or raw exceptions.
    return response({ error: { code: "INTERNAL_ERROR", message: "保存処理に失敗しました。少し待って再試行してください。" } }, 500);
  }
}
