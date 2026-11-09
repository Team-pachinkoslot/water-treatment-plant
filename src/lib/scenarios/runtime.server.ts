import { env } from "node:process";
import type { BlueActionCode, BlueState } from "./aqua";

export class ScenarioRuntimeError extends Error {
  readonly code = "RUNTIME_NOT_CONFIGURED";
  constructor() {
    super("演習環境は準備中です。開始・FLAG提出・状態変更は利用できません。");
    this.name = "ScenarioRuntimeError";
  }
}

// Contract only. Future adapters require authenticated, authorized sessions.
export interface ScenarioRuntimeAdapter {
  readonly mode: "disabled" | "local";
  start(labId: string): Promise<{ sessionId: string }>;
  submitFlag(sessionId: string, stageId: string, flag: string): Promise<{ accepted: boolean }>;
  performBlueAction(sessionId: string, action: BlueActionCode): Promise<{ state: BlueState }>;
}

export class DisabledScenarioRuntime implements ScenarioRuntimeAdapter {
  readonly mode = "disabled" as const;

  async start(labId: string): Promise<never> {
    void labId;
    throw new ScenarioRuntimeError();
  }

  async submitFlag(sessionId: string, stageId: string, flag: string): Promise<never> {
    void [sessionId, stageId, flag];
    throw new ScenarioRuntimeError();
  }

  async performBlueAction(sessionId: string, action: BlueActionCode): Promise<never> {
    void [sessionId, action];
    throw new ScenarioRuntimeError();
  }
}

// No executable adapter exists in Phase 1: unknown modes also fail closed.
export function getScenarioRuntime(mode = env.LAB_RUNTIME_MODE): ScenarioRuntimeAdapter {
  void mode;
  return new DisabledScenarioRuntime();
}
