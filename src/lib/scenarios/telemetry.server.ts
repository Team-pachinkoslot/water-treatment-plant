import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TelemetrySample {
  timestamp: string;
  model_level_pct: number;
  display_level_pct: number;
  flow_lpm: number;
  input_feed: "normal" | "untrusted" | "isolated";
  mode: "normal" | "safe_mode" | "recovered";
}

export function readTelemetry(recovery = false): TelemetrySample[] {
  const name = recovery ? "recovery_telemetry.jsonl" : "telemetry.jsonl";
  return readFileSync(join(process.cwd(), "fixtures/blue", name), "utf8")
    .trim().split(/\r?\n/).map((line) => JSON.parse(line) as TelemetrySample);
}

export function readTrainingAlert(): { title: string; message: string; trigger: { threshold: number; consecutiveSamples: number } } {
  const alert = JSON.parse(readFileSync(join(process.cwd(), "fixtures/blue/alerts.json"), "utf8"));
  // Only the learner-facing description and rule are exposed, not instructor answers.
  return { title: alert.title, message: alert.message, trigger: alert.trigger };
}
