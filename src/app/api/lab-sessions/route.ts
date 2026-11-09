import { handleSessionRequest } from "@/lib/scenarios/http.server";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleSessionRequest(request); }
