import { env } from "node:process";
import type { BlueActionCode } from "./aqua";
import type { SessionAccess, SessionView, ReportFields, BlueEvidence, MaterialView } from "./session-types";
import { SimulatorScenarioRuntime } from "./simulator.server";
import { ScenarioRuntimeError } from "./errors.server";
export { ScenarioRuntimeError } from "./errors.server";
export type ScenarioMode = "disabled" | "simulator";
export interface StartedSession { sessionId: string; token: string; session: SessionView }
export interface ScenarioRuntimeAdapter {
  readonly mode: ScenarioMode;
  start(labId: string): Promise<StartedSession>;
  getSession(access: SessionAccess): Promise<SessionView>;
  reset(access: SessionAccess): Promise<StartedSession>;
  getMaterials(access: SessionAccess, stage: string): Promise<MaterialView>;
  getHint(access: SessionAccess, stage: string, index: number): Promise<{ hint: string }>;
  submitFlag(access: SessionAccess, stage: string, flag: string, evidence?: Record<string, string>): Promise<SessionView>;
  stage5Evidence(access: SessionAccess, answer: { sourceIp: string; firstEventTimestampUtc: string }): Promise<{ flag: string }>;
  submitReport(access: SessionAccess, track: "red" | "blue", report: ReportFields): Promise<SessionView>;
  performBlueAction(access: SessionAccess, action: BlueActionCode, evidence?: BlueEvidence): Promise<SessionView>;
}
export class DisabledScenarioRuntime implements ScenarioRuntimeAdapter {
  readonly mode = "disabled" as const;
  async start(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getSession(): Promise<never> { throw new ScenarioRuntimeError(); }
  async reset(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getMaterials(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getHint(): Promise<never> { throw new ScenarioRuntimeError(); }
  async submitFlag(): Promise<never> { throw new ScenarioRuntimeError(); }
  async stage5Evidence(): Promise<never> { throw new ScenarioRuntimeError(); }
  async submitReport(): Promise<never> { throw new ScenarioRuntimeError(); }
  async performBlueAction(): Promise<never> { throw new ScenarioRuntimeError(); }
}
export function getScenarioMode(mode = env.LAB_RUNTIME_MODE): ScenarioMode {
  return mode === undefined || mode === "" || mode === "simulator" ? "simulator" : "disabled";
}
export function getScenarioRuntime(mode = env.LAB_RUNTIME_MODE): ScenarioRuntimeAdapter {
  return getScenarioMode(mode) === "simulator" ? new SimulatorScenarioRuntime() : new DisabledScenarioRuntime();
}
