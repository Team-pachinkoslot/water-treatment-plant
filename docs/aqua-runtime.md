# PROJECT AQUA / Vercel内で完結する実行契約

既定は`simulator`です。`LAB_RUNTIME_MODE=disabled`または未知の値で演習操作を503 / `RUNTIME_NOT_CONFIGURED`として拒否します。Linux・VM・外部DB・SSHへの接続はありません。

## Functionとブラウザ間の状態

開始時にサーバーがセッション・ステージ別の暗号学的乱数FLAGを発行します。`cloudState`は、秘密値を含む内部状態をAES-256-GCMで暗号化し、deflateしたopaqueなデータです。クライアントは復号・採点せずlocalStorageへ保存します。毎回のリクエスト本文で最新`cloudState`を返し、サーバーが所有者・期限・認証タグ・チェックポイント・課題の条件を検証します。

`aqua_session` Cookieはセッション所有者、`aqua_checkpoint` Cookieは最新状態のダイジェストとブラウザごとの開始回数を保持します。チェックポイントCookieも暗号化・認証します。CookieはHttpOnly / SameSite=Strictで、HTTPSではSecureです。サーバーは失敗した提出も新しい暗号化状態として返すため、クライアントはエラーを表示する前に`cloudState`を保存します。

Function内はリクエストごとのメモリ内SQLiteです。前回Functionの実行メモリや書込可能ディスクを前提にしません。状態を持つのはブラウザだけで、全体の集中集計・サーバー側の全履歴失効・利用者をまたぐ厳密な制限はありません。過去のCookieと暗号化状態を丸ごと保存した利用者の再現操作を、共有ストアなしで一括失効させるものではありません。正式な成績管理向けではなく自己学習用です。

## 鍵

`npm run build`前に`.aqua/session-key.json`を生成し、`outputFileTracingIncludes`でサーバーFunctionへ同梱します。Gitと公開ディレクトリには追加しません。鍵はブラウザへ渡しません。

任意の`AQUA_SESSION_KEY`（64桁16進文字列）があればそちらを優先します。固定した環境変数を設定すれば再デプロイをまたいで状態を復号できます。未指定ならデプロイ単位の鍵で、再デプロイ後は新しい演習を開始する方式です。`NEXT_PUBLIC_`変数には保存しません。

## HTTPS API

リクエストは同一オリジンのJSON POSTで、開始以外はCookieと`cloudState`が必要です。Vercelを含むHTTPSドメイン、またはローカル開発のループバックHTTPを許可します。Host不一致・別Origin・cross-siteリクエストを拒否します。レスポンスは`Cache-Control: private, no-store`、本文上限は512,000バイトです。

| メソッド・パス | cloudState以外の入力 | 動作 |
| --- | --- | --- |
| POST /api/lab-sessions | labId=water-01 | 新規セッションとCookie、暗号化状態を発行 |
| POST /api/lab-sessions/current/restore | — | 保存済み演習を再開 |
| POST /api/lab-sessions/{sessionId}/restore | — | 所有セッションの進捗取得 |
| POST /api/lab-sessions/{sessionId}/materials | stageId | 解放済みステージだけの教材を返す |
| POST /api/lab-sessions/{sessionId}/hints | stageId, index(0〜2) | ヒント利用を記録 |
| POST /api/lab-sessions/{sessionId}/flags | stageId, flag, evidence | FLAGと根拠を検証 |
| POST /api/lab-sessions/{sessionId}/stage5-evidence | sourceIp, firstEventTimestampUtc | 正答時のみStage 05 FLAGを払い出す |
| POST /api/lab-sessions/{sessionId}/blue-actions | action, timestamps?, explanation? | 模擬状態を遷移 |
| POST /api/lab-sessions/{sessionId}/report | track, report | 調査／防御レポート保存・項目充足の採点 |
| POST /api/lab-sessions/{sessionId}/reset | — | ブラウザの現セッションを新規ID・FLAGへ切替 |

読み取り操作も大きな暗号化状態をCookieやHTTPヘッダーへ入れず、本文で渡すためPOSTにしています。リクエストのキー・入力形式・所有者確認はサーバー側で処理します。未開始401、別セッション404、期限切れ410、不正遷移／古い状態409、試行制限429です。

`evidence`はS01で`ports`、S03で`risk`、S04で`permission`を使用します。S05は事前に根拠回答が検証されている必要があります。FLAG正解一覧は平文のセッションDTOへ含めず、各教材やS05根拠検証成功時だけ該当FLAGを返します。

## 状態と得点

5FLAGと調査レポート後にBlue Teamを解放します。

| 操作 | 遷移 | 必要な証拠 |
| --- | --- | --- |
| ACKNOWLEDGE_ANOMALY | anomaly_detected → investigating | 最初の3連続不一致のUTC時刻と説明 |
| ISOLATE_TRAINING_FEED | investigating → input_isolated | 前段階完了 |
| ENTER_SIMULATED_SAFE_MODE | input_isolated → safe_mode | 前段階完了 |
| VERIFY_STABLE | safe_mode → verified | 復旧教材の3連続正常のUTC時刻 |
| RESTORE_SIMULATED_MONITORING | verified → recovered | 正常性確認完了 |

不正順序は`INVALID_STATE_TRANSITION`、正常性の根拠不足は`VERIFICATION_REQUIRED`として状態を変えません。これらは固定された架空教材の検証で、実設備の安全確認ではありません。

レポート項目は`observations`、`evidence`、`timeline`、`improvements`で、それぞれ10〜4000文字です。Red FLAG40、調査レポート10、Blue操作42、検知根拠と防御レポート8の合計100点です。レポート本文の品質評価は講師確認が必要です。

24時間の期限、ヒント・操作の直近100件の履歴、各課題の1分10試行を保持します。開始制限もブラウザのCookie単位で1分10回です。未提出の入力途中テキストは保存しません。履歴にFLAG入力値は保存しません。
