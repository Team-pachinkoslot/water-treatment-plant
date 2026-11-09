# PROJECT AQUA / 実行契約

`ScenarioDefinition`は学習者向けの定義、`ScenarioRuntimeAdapter`はサーバー側の実行契約です。既定は`DisabledScenarioRuntime`、明示的な`LAB_RUNTIME_MODE=simulator`で`SimulatorScenarioRuntime`を選択します。他の値は無効です。

このシミュレーターは利用者の「実VMなし、一旦テスト」の指定による追加範囲です。Phase 1の教材プレビューを維持し、テスト演習は専用の`/labs/water-treatment/practice`で実行します。カタログは実VM演習未公開の`coming_soon`を維持し、VMランタイムとブラウザテストを区別します。

## ローカルAPI

全レスポンスは`Cache-Control: private, no-store`。`disabled`時は全操作を503 / `RUNTIME_NOT_CONFIGURED`で拒否します。テスト時の変更リクエストは同じローカルHostのOriginと`application/json`が必要です。本文上限は24,000バイトです。

| メソッド・パス | 入力 | 動作 |
| --- | --- | --- |
| POST /api/lab-sessions | labId=water-01 | 24時間セッションを発行しHttpOnly Cookieを設定 |
| GET /api/lab-sessions/current | — | Cookie所有者の進捗取得 |
| GET /api/lab-sessions/{sessionId} | — | CookieとIDが一致する進捗取得 |
| GET /api/lab-sessions/{sessionId}/materials?stageId=S01 | — | 解放済みステージの教材だけ返す |
| POST /api/lab-sessions/{sessionId}/hints | stageId, index(0〜2) | ヒント表示を監査して本文を返す |
| POST /api/lab-sessions/{sessionId}/flags | stageId, flag, evidence | FLAGと段階別根拠を検証し進捗保存 |
| POST /api/lab-sessions/{sessionId}/stage5-evidence | sourceIp, firstEventTimestampUtc | 架空ログと照合し正答時のみFLAG発行 |
| POST /api/lab-sessions/{sessionId}/blue-actions | action, timestamps?, explanation? | 証拠と順序を検証して模擬状態を保存 |
| POST /api/lab-sessions/{sessionId}/report | track(red/blue), report | レポート保存と項目充足の採点 |
| POST /api/lab-sessions/{sessionId}/reset | {} | 所有セッションを無効化し新規Cookie・FLAGを発行 |

`evidence`はStage 01で`ports`、Stage 03で`risk`、Stage 04で`permission`を受け付けます。Stage 05は事前の根拠検証済みを確認します。FLAGや根拠の不正回答では次ステージへ進みません。ステージの照合はサーバー側のみで実施し、正解一覧はレスポンスに含めません。

未開始は401、他セッションは404、期限切れは410、順序不正は409、試行回数超過は429です。全セッションを共有する開始回数制限は1分10回、FLAGとStage 05根拠回答の制限は各セッションの課題ごとに1分10回です。

Cookieはランダム秘密値を持ち、DBにはCookie秘密値のSHA-256を保存します。正解FLAGはセッション／ステージ単位の暗号学的乱数です。DBにのみ保存し、S01〜04の対応する教材、S05の根拠回答成功レスポンスでのみ払い出します。ヒント閲覧・提出結果・状態遷移を履歴へ保存し、FLAG入力値や資格情報は記録しません。

## Blue Team

5FLAGとRedレポートの提出後に解放します。

| 操作 | 遷移 | 必要な証拠 |
| --- | --- | --- |
| ACKNOWLEDGE_ANOMALY | anomaly_detected → investigating | 最初の3連続不一致のUTC時刻と10文字以上の説明 |
| ISOLATE_TRAINING_FEED | investigating → input_isolated | 前段階完了 |
| ENTER_SIMULATED_SAFE_MODE | input_isolated → safe_mode | 前段階完了 |
| VERIFY_STABLE | safe_mode → verified | 復旧サンプルの3連続一致のUTC時刻 |
| RESTORE_SIMULATED_MONITORING | verified → recovered | 正常性確認完了 |

不正順序は`INVALID_STATE_TRANSITION`、正常性の根拠不足は`VERIFICATION_REQUIRED`とし状態を変更しません。証拠は固定教材から照合します。これはVMの観測値や設備の安全性確認ではありません。固定グラフは観測教材で、模擬状態の更新先はSQLite内のセッションだけです。

## 保存・得点・復元

SQLiteのトランザクションで各操作を保存し、同じCookieとDBがあれば再読込・アプリ再起動後も復帰できます。レポートの未提出の入力中テキストは保存しません。期限切れセッションは新規開始時に削除します。リセットでは対象セッションを削除し、新規ID・秘密値・FLAGを発行するので、旧CookieとFLAGは利用できません。

レポートの4項目は`observations`、`evidence`、`timeline`、`improvements`です。各10〜4000文字が必要で、Redは5FLAG後、Blueはrecovered後に提出できます。Red FLAG40点・Redレポート10点・Blue対応42点・Blue証拠とレポート8点です。文章の品質・事実の妥当性は講師確認が必要です。

完了条件は5FLAG、Redレポート、Blue recovered、Blueレポートです。セッションDTOと結果JSONには正解FLAGやCookie秘密値を含めません。

## VM連携の残り

VMware Fusionアダプター、Kali/Ubuntu ARM64、隔離とホスト側経路の検証、最小権限教材、VMスナップショット復元、アカウント認証は未実装です。VM用`local`モードは現時点では無効です。HTTP入力をシェルへ渡す処理や実PLC／ポンプへの接続は実装していません。
