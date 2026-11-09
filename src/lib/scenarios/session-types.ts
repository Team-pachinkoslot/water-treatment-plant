import type { BlueState } from "./aqua";
export interface SessionAccess { sessionId: string; token: string }
export interface ReportFields { observations: string; evidence: string; timeline: string; improvements: string }
export interface BlueEvidence { timestamps?: string[]; explanation?: string }
export interface SessionView {
  id: string;
  labId: "water-01";
  mode: "simulator";
  expiresAt: string;
  completedStages: string[];
  nextStage: string | null;
  blueState: BlueState;
  blueEvidenceAccepted: boolean;
  reports: { red: ReportFields | null; blue: ReportFields | null };
  score: { redFlags: number; redReport: number; blueActions: number; blueEvidence: number; total: number };
  complete: boolean;
  events: { at: string; type: string; stageId?: string }[];
}
export interface MaterialView { stageId: string; files: { path: string; content: string }[] }
