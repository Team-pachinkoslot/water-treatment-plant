import { labs } from "@/lib/labs";
export function GET() {
  return Response.json({ labs, total: labs.length, dataSource: "mock" });
}
