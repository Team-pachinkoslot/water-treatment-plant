import { getHealth } from "@/lib/runtime";
import { getScenarioMode } from "@/lib/scenarios/runtime.server";
export function GET() {
  return Response.json({ ...getHealth(), scenarioRuntime: { mode: getScenarioMode(), vmConnected: false } }, { headers: { "Cache-Control": "no-store" } });
}
