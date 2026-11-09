import { handleSessionRequest } from "@/lib/scenarios/http.server";
export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string; operation: string }> };
export async function GET(request: Request, context: Context) {
  const { sessionId, operation } = await context.params;
  return handleSessionRequest(request, sessionId, operation);
}
export async function POST(request: Request, context: Context) {
  const { sessionId, operation } = await context.params;
  return handleSessionRequest(request, sessionId, operation);
}
