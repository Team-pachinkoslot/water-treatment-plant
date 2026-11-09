export class LabError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "LabError";
  }
}
export class ScenarioRuntimeError extends LabError {
  constructor() {
    super("RUNTIME_NOT_CONFIGURED", "演習環境は準備中です。開始・FLAG提出・状態変更は利用できません。", 503);
    this.name = "ScenarioRuntimeError";
  }
}
