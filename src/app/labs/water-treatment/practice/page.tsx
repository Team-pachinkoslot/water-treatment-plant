import type { Metadata } from "next";
import { connection } from "next/server";
import { AquaPractice } from "@/components/aqua-practice";
import { getScenarioMode } from "@/lib/scenarios/runtime.server";
import { readTelemetry } from "@/lib/scenarios/telemetry.server";
export const metadata: Metadata = { title: "PROJECT AQUA / テスト演習" };
export default async function PracticePage() {
  await connection();
  return <AquaPractice enabled={getScenarioMode() === "simulator"} samples={readTelemetry()} recoverySamples={readTelemetry(true)} />;
}
