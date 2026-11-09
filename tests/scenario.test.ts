import { describe, expect, it } from "vitest";
import { aquaScenario } from "../src/lib/scenarios/aqua";
import { getScenarioRuntime, ScenarioRuntimeError } from "../src/lib/scenarios/runtime.server";
import { readTelemetry, readTrainingAlert } from "../src/lib/scenarios/telemetry.server";
import { getLab } from "../src/lib/labs";

describe("AQUA runtime boundary", () => {
  it.each(["disabled", "mock", "enabled"])("rejects every mutation for mode %s", async mode => {
    const runtime = getScenarioRuntime(mode);
    expect(runtime.mode).toBe("disabled");
    for (const operation of [runtime.start("water-01"), runtime.executeCommand({ sessionId: "untrusted-session", token: "" }, "S01", "help"), runtime.submitFlag({ sessionId: "untrusted-session", token: "" }, "S05", "untrusted-input"), ...aquaScenario.blueActions.map(a => runtime.performBlueAction({ sessionId: "untrusted-session", token: "" }, a.code))]) {
      await expect(operation).rejects.toMatchObject({ code: "RUNTIME_NOT_CONFIGURED" });
    }
    await expect(runtime.start("unknown-lab")).rejects.toBeInstanceOf(ScenarioRuntimeError);
  });
});

describe("AQUA learner data", () => {
  it("integrates five stages and 50 minutes without changing catalog identity", () => {
    expect(getLab(aquaScenario.slug)).toMatchObject({ id: aquaScenario.id, durationMinutes: 50, status: "available" });
    expect(aquaScenario.redStages.map(s => s.id)).toEqual(["S01", "S02", "S03", "S04", "S05"]);
    expect(aquaScenario.redStages.every(s => s.hints.length === 3 && s.report)).toBe(true);
  });
  it("includes neither flag tokens nor instructor-only answer keys in learner definition", () => {
    const data = JSON.stringify(aquaScenario);
    expect(data).not.toMatch(/AQUA\{|session-token|password|sourceIp|firstEventTimestampUtc|flagSource|grading/);
  });
  it("keeps the specified sequential Blue Team flow as explanation only", () => {
    const actions = aquaScenario.blueActions;
    expect(actions[0].from).toBe("anomaly_detected");
    for (let i = 1; i < actions.length; i++) expect(actions[i].from).toBe(actions[i-1].to);
    expect(actions.at(-1)?.to).toBe("recovered");
  });
  it("reads the supplied mismatch and recovery series without simulating successful recovery", () => {
    const samples = readTelemetry();
    expect(samples).toHaveLength(5);
    expect(samples[0].display_level_pct).toBe(samples[0].model_level_pct);
    const alert = readTrainingAlert();
    expect(alert.trigger).toEqual({ metric: "absolute_percent_point_difference", threshold: 15, consecutiveSamples: 3 });
    expect(samples.slice(1,4).every(s => Math.abs(s.display_level_pct - s.model_level_pct) > alert.trigger.threshold)).toBe(true);
    const recovery = readTelemetry(true);
    expect(recovery).toHaveLength(3);
    expect(recovery.every(s => s.display_level_pct === s.model_level_pct && s.mode === "safe_mode" && s.input_feed === "isolated")).toBe(true);
  });
});
