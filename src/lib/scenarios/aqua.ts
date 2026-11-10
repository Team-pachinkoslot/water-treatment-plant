// Learner-safe scenario definition. Instructor answers and session secrets are excluded.
export type BlueState = "anomaly_detected" | "investigating" | "input_isolated" | "safe_mode" | "verified" | "recovered";
export type BlueActionCode = "ACKNOWLEDGE_ANOMALY" | "ISOLATE_TRAINING_FEED" | "ENTER_SIMULATED_SAFE_MODE" | "VERIFY_STABLE" | "RESTORE_SIMULATED_MONITORING";
export interface ScenarioDefinition {
  readonly id: "water-01";
  readonly slug: "water-treatment";
  readonly durationMinutes: { readonly red: number; readonly blue: number; readonly total: number };
  readonly redStages: readonly { id: string; title: string; skill: string; difficulty: number; studentTask: string; hints: readonly string[]; report: string }[];
  readonly blueActions: readonly { code: BlueActionCode; from: BlueState; to: BlueState; label: string }[];
}
export const aquaScenario = {
  "id": "water-01",
  "slug": "water-treatment",
  "durationMinutes": {
    "red": 30,
    "blue": 20,
    "total": 50
  },
  "redStages": [
    {
      "id": "S01",
      "title": "偵察",
      "skill": "Recon",
      "difficulty": 1,
      "studentTask": "SSH 22番・HTTP 8080番の公開サービスを把握する",
      "hints": [
        "対象のIPを確認",
        "SSHとHTTPに注目",
        "22番と8080番を確認"
      ],
      "report": "対象IP、公開ポート、サービス名、レスポンス"
    },
    {
      "id": "S02",
      "title": "Web調査",
      "skill": "Web Recon",
      "difficulty": 2,
      "studentTask": "HTMLコメントから点検資料を見つける",
      "hints": [
        "開発者ツールを利用",
        "HTMLコメントを確認",
        "/training/inspectionを開く"
      ],
      "report": "ページURL、手掛かりの位置、ページの意味"
    },
    {
      "id": "S03",
      "title": "情報発見",
      "skill": "Information Gathering",
      "difficulty": 2,
      "studentTask": "公開メモに残る訓練用認証情報の取り扱いを評価する",
      "hints": [
        "点検資料を確認",
        "公開メモを探す",
        "maintenance-note.txtを確認"
      ],
      "report": "露出情報の種類、リスク、改善策"
    },
    {
      "id": "S04",
      "title": "内部調査",
      "skill": "Linux Enumeration",
      "difficulty": 2,
      "studentTask": "aquareaderで許可されたファイルの所有者と権限を確認する",
      "hints": [
        "pwd/lsで現在位置を確認",
        "ls -lで権限表示",
        "~/casefiles/README.txtを確認"
      ],
      "report": "ファイルパス、所有者・権限、権限管理の理由"
    },
    {
      "id": "S05",
      "title": "証拠回収",
      "skill": "Log Analysis",
      "difficulty": 2,
      "studentTask": "連続401応答を発生させたIPと最初のUTC時刻を調べる",
      "hints": [
        "401応答を抽出",
        "同一IPの短時間連続記録",
        "最初の401イベントのUTC時刻"
      ],
      "report": "送信元、最初のUTC時刻、根拠ログ行、対処案"
    }
  ],
  "blueActions": [
    {
      "code": "ACKNOWLEDGE_ANOMALY",
      "from": "anomaly_detected",
      "to": "investigating",
      "label": "異常を確認する"
    },
    {
      "code": "ISOLATE_TRAINING_FEED",
      "from": "investigating",
      "to": "input_isolated",
      "label": "表示用入力を隔離する"
    },
    {
      "code": "ENTER_SIMULATED_SAFE_MODE",
      "from": "input_isolated",
      "to": "safe_mode",
      "label": "安全モードへ移行する"
    },
    {
      "code": "VERIFY_STABLE",
      "from": "safe_mode",
      "to": "verified",
      "label": "正常性を確認する"
    },
    {
      "code": "RESTORE_SIMULATED_MONITORING",
      "from": "verified",
      "to": "recovered",
      "label": "模擬監視を復旧する"
    }
  ]
} as const satisfies ScenarioDefinition;
