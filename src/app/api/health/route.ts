import { getHealth } from "@/lib/runtime";
export function GET() {
  return Response.json(getHealth());
}
