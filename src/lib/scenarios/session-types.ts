import type { TerminalState } from "./terminal-lessons";
import type { BlueActionCode, BlueState } from "./aqua";
import type { BlueMode, FeedbackKind, JudgmentId, JudgmentRecord } from "./blue-steps";
export interface SessionAccess { sessionId: string; token: string }
/** 調査レポートは4項目。防御レポートは impact(影響範囲)を加えた5項目 */
export interface ReportFields { observations: string; evidence: string; timeline: string; improvements: string; impact?: string }
/** 判断ごとの進捗。points はサーバーが記録(誤答・ヒント)から計算した値 */
export interface BlueJudgmentView extends JudgmentRecord { max: number }
export interface BlueStepProgress { points: number; max: number; solved: number; total: number; completed: boolean }
export interface BlueProgressView {
  mode: BlueMode;
  startedAt: string | null;
  finishedAt: string | null;
  recoveryObserved: number;
  judgments: Record<JudgmentId, BlueJudgmentView>;
  steps: Record<BlueActionCode, BlueStepProgress>;
}
export interface SessionView {
  id: string;
  labId: "water-01";
  mode: "simulator";
  /** normal: 通常の演習 / practice: Blueだけの練習(得点は合計・完了判定に加算しない) */
  exerciseMode: BlueMode;
  expiresAt: string;
  completedStages: string[];
  nextStage: string | null;
  terminal: TerminalState;
  blueState: BlueState;
  blueEvidenceAccepted: boolean;
  blueProgress: BlueProgressView;
  reports: { red: ReportFields | null; blue: ReportFields | null };
  score: { redFlags: number; redReport: number; blueActions: number; blueEvidence: number; total: number };
  complete: boolean;
  events: { at: string; type: string; stageId?: string }[];
}
export interface MaterialView { stageId: string; files: { path: string; content: string }[] }
export interface BlueCheckResult { judgmentId: JudgmentId; ok: boolean; kind: FeedbackKind; feedback: string; details?: string[]; note?: string }
export interface BlueHint { hint: string; level: number; judgmentId: JudgmentId; title: string }
