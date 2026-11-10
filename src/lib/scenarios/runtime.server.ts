import type { TerminalResult, CommandHint } from "./terminal-lessons";
import { env } from "node:process";
import type { BlueActionCode } from "./aqua";
import type { SessionAccess, SessionView, ReportFields, BlueCheckResult, BlueHint, MaterialView } from "./session-types";
import type { BlueMode } from "./blue-steps";
import { SimulatorScenarioRuntime } from "./simulator.server";
import { ScenarioRuntimeError } from "./errors.server";
export { ScenarioRuntimeError } from "./errors.server";
export type ScenarioMode = "disabled" | "simulator";
export interface StartedSession { sessionId: string; token: string; session: SessionView }
export interface ScenarioRuntimeAdapter {
  readonly mode: ScenarioMode;
  start(labId: string, mode?: BlueMode): Promise<StartedSession>;
  getSession(access: SessionAccess): Promise<SessionView>;
  reset(access: SessionAccess): Promise<StartedSession>;
  getMaterials(access: SessionAccess, stage: string): Promise<MaterialView>;
  executeCommand(access: SessionAccess, stage: string, command: string): Promise<{ result: TerminalResult; session: SessionView }>;
  getHint(access: SessionAccess, stage: string, index: number): Promise<CommandHint>;
  submitFlag(access: SessionAccess, stage: string, flag: string, evidence?: Record<string, string>): Promise<SessionView>;
  stage5Evidence(access: SessionAccess, answer: { sourceIp: string; firstEventTimestampUtc: string }): Promise<{ flag: string }>;
  submitReport(access: SessionAccess, track: "red" | "blue", report: ReportFields): Promise<SessionView>;
  /** STEP の状態遷移。canAdvance を満たすときだけ遷移する(同じ遷移の重複は何もしない) */
  performBlueAction(access: SessionAccess, action: BlueActionCode): Promise<SessionView>;
  /** 判断を1つ判定する。正解なら固定し、誤答は回数を記録する */
  checkBlueJudgment(access: SessionAccess, judgmentId: string, answer: unknown): Promise<{ result: BlueCheckResult; session: SessionView }>;
  getBlueHint(access: SessionAccess, judgmentId: string, index: number): Promise<BlueHint>;
  /** 4-4: 復旧データの次の記録を取得する */
  observeRecovery(access: SessionAccess): Promise<SessionView>;
}
export class DisabledScenarioRuntime implements ScenarioRuntimeAdapter {
  readonly mode = "disabled" as const;
  async start(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getSession(): Promise<never> { throw new ScenarioRuntimeError(); }
  async reset(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getMaterials(): Promise<never> { throw new ScenarioRuntimeError(); }
  async executeCommand(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getHint(): Promise<never> { throw new ScenarioRuntimeError(); }
  async submitFlag(): Promise<never> { throw new ScenarioRuntimeError(); }
  async stage5Evidence(): Promise<never> { throw new ScenarioRuntimeError(); }
  async submitReport(): Promise<never> { throw new ScenarioRuntimeError(); }
  async performBlueAction(): Promise<never> { throw new ScenarioRuntimeError(); }
  async checkBlueJudgment(): Promise<never> { throw new ScenarioRuntimeError(); }
  async getBlueHint(): Promise<never> { throw new ScenarioRuntimeError(); }
  async observeRecovery(): Promise<never> { throw new ScenarioRuntimeError(); }
}
export function getScenarioMode(mode = env.LAB_RUNTIME_MODE): ScenarioMode {
  return mode === undefined || mode === "" || mode === "simulator" ? "simulator" : "disabled";
}
export function getScenarioRuntime(mode = env.LAB_RUNTIME_MODE): ScenarioRuntimeAdapter {
  return getScenarioMode(mode) === "simulator" ? new SimulatorScenarioRuntime() : new DisabledScenarioRuntime();
}
