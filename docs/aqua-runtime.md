# PROJECT AQUA / 実行境界と将来契約

今回の実装はPhase 1の教材プレビューのみ。`LAB_RUNTIME_MODE=disabled`、`status=coming_soon`、既存ID `water-01` / slug `water-treatment` を維持する。

`ScenarioDefinition` は受講者に配信できる課題・ヒント・説明のみ。`ScenarioRuntimeAdapter` はサーバー側の契約。`DisabledScenarioRuntime` の全変更操作は `RUNTIME_NOT_CONFIGURED` を投げ、セッションや模擬状態を生成・保存しない。環境変数を書き換えても実行アダプターは選択されない。現時点で以下のAPIは公開していない。

## 後続フェーズのAPI案（未実装）

| メソッド・パス | 入力 | 将来の役割 |
| --- | --- | --- |
| POST /api/lab-sessions | labId | 認証、参加権限、隔離環境の検証後にセッション発行 |
| GET /api/lab-sessions/{sessionId} | — | 本人所有のセッションの進捗確認 |
| POST /api/lab-sessions/{sessionId}/flags | stageId, flag | 順序と試行回数を検証してサーバー側で照合 |
| POST /api/lab-sessions/{sessionId}/stage5-evidence | sourceIp, firstEventTimestampUtc, logLines | 正答時のみStage 05のFLAGを払い出す |
| GET /api/lab-sessions/{sessionId}/telemetry | — | 許可されたセッションの模擬値を返す |
| POST /api/lab-sessions/{sessionId}/blue-actions | action | 許可操作と証拠を検証して状態遷移 |
| POST /api/lab-sessions/{sessionId}/report | track, report | 調査・防御レポート保存と評価 |

認証なし・他人のセッションを拒否する。FLAGはセッション・ステージごとの暗号学的乱数で生成し、正解をサーバー側のみで保持する。資格情報やトークンを監査ログへ記録しない。ヒント利用と提出試行を監査し、試行回数を制限する。

## Blue Teamの将来の状態遷移

`anomaly_detected` → `investigating` → `input_isolated` → `safe_mode` → `verified` → `recovered`

操作コードと説明は `src/lib/scenarios/aqua.ts` を参照。不正順序は `INVALID_STATE_TRANSITION`（409相当）、正常性の証拠不足は `VERIFICATION_REQUIRED` とし状態を変えない。Phase 1ではこの遷移自体が無効で、画面は固定教材を表示する。

復旧サンプルは固定の観測教材であり、セッションの正常判定として流用しない。VM/SSH統合は別フェーズで実装し、Host-onlyとホスト側経路の検証、最小権限、リセットを確認する。実PLCやポンプに命令を送る接続処理は追加しない。
