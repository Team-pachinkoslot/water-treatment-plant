import type { Metadata } from "next";
import { connection } from "next/server";
import { AquaPractice } from "@/components/aqua-practice";
import { getScenarioMode } from "@/lib/scenarios/runtime.server";
import { readTelemetry } from "@/lib/scenarios/telemetry.server";
export const metadata: Metadata = { title: "PROJECT AQUA / ブラウザ演習" };
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ start?: string; track?: string; practice?: string }> }) {
  await connection();
  const query = await searchParams;
  const autoStart = query.start === "1";
  const initialTrack = query.track === "blue" || query.track === "results" ? query.track : "red";
  return <AquaPractice initialTrack={initialTrack} autoStart={autoStart} initialPractice={query.practice === "1"} enabled={getScenarioMode() === "simulator"} samples={readTelemetry()} recoverySamples={readTelemetry(true)} />;
}
