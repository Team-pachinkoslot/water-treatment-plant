import type { TerminalState } from "./terminal-lessons";
import type { BlueActionCode, BlueState } from "./aqua";
export interface SessionAccess { sessionId: string; token: string }
/** 調査レポートは4項目。防御レポートは impact(影響範囲)を加えた5項目 */
export interface ReportFields { observations: string; evidence: string; timeline: string; improvements: string; impact?: string }
/** 防御パートの判断・記入。形式は STEP ごとに異なり、サーバーが StepRule で検証する */
export type BlueAnswers = Record<string, unknown>;
export interface BlueStepProgress { mistakes: number; hintLevel: number; points: number; max: number; completed: boolean }
export interface BlueProgress { startedAt: string | null; steps: Record<BlueActionCode, BlueStepProgress> }
export interface SessionView {
  id: string;
  labId: "water-01";
  mode: "simulator";
  expiresAt: string;
  completedStages: string[];
  nextStage: string | null;
  terminal: TerminalState;
  blueState: BlueState;
  blueEvidenceAccepted: boolean;
  blueProgress: BlueProgress;
  reports: { red: ReportFields | null; blue: ReportFields | null };
  score: { redFlags: number; redReport: number; blueActions: number; blueEvidence: number; total: number };
  complete: boolean;
  events: { at: string; type: string; stageId?: string }[];
}
export interface MaterialView { stageId: string; files: { path: string; content: string }[] }
export interface BlueCheckResult { ok: boolean; feedback: { kind: "ok" | "wrong" | "missing"; message: string }[] }
export interface BlueHint { hint: string; level: number; step: string }
