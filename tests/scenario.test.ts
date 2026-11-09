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
  it("reads the chlorine mismatch and recovery series without simulating successful recovery", () => {
    const samples = readTelemetry();
    expect(samples).toHaveLength(7);
    expect(Math.abs(samples[0].display_cl_mgl - samples[0].model_cl_mgl)).toBeLessThanOrEqual(0.2);
    const alert = readTrainingAlert();
    expect(alert.trigger).toEqual({ metric: "absolute_mgl_difference", threshold: 0.2, consecutiveSamples: 3 });
    // 14:03/14:04/14:05 の3連続が閾値を超え、14:01 の単発は連続しない。
    expect(samples.slice(3,6).every(s => Math.abs(s.display_cl_mgl - s.model_cl_mgl) > alert.trigger.threshold)).toBe(true);
    expect(Math.abs(samples[2].display_cl_mgl - samples[2].model_cl_mgl)).toBeLessThanOrEqual(alert.trigger.threshold);
    const recovery = readTelemetry(true);
    expect(recovery).toHaveLength(3);
    expect(recovery.every(s => Math.abs(s.display_cl_mgl - s.model_cl_mgl) <= alert.trigger.threshold && s.mode === "safe_mode" && s.input_feed === "isolated")).toBe(true);
  });
});
