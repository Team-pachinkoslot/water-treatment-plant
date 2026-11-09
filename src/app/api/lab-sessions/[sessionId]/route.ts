import { handleSessionRequest } from "@/lib/scenarios/http.server";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return handleSessionRequest(request, (await context.params).sessionId);
}
