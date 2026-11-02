export interface LabRuntimeProvider {
  readonly mode: "disabled";
  readonly connected: false;
  readonly reason: string;
}
export const runtimeProvider: LabRuntimeProvider = Object.freeze({
  mode: "disabled",
  connected: false,
  reason:
    "Phase 1は画面とモックAPIのみです。VM操作・設備制御・FLAG採点は未実装です。",
});
export function getHealth() {
  return {
    status: "ok",
    phase: 1,
    dataSource: "mock",
    runtime: runtimeProvider,
  } as const;
}
