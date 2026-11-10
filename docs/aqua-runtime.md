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
| POST /api/lab-sessions/{sessionId}/commands | stageId, command | 模擬コマンドを解釈し、出力・図解用メタ情報・更新したセッションを返す |
| POST /api/lab-sessions/{sessionId}/materials | stageId | 直接閲覧を廃止。409 / COMMAND_REQUIREDを返す |
| POST /api/lab-sessions/{sessionId}/hints | stageId, index(0〜2) | 進捗に応じた考え方・構文・実行例を生成し、利用を記録 |
| POST /api/lab-sessions/{sessionId}/flags | stageId, flag, evidence | FLAGと根拠を検証 |
| POST /api/lab-sessions/{sessionId}/stage5-evidence | sourceIp, firstEventTimestampUtc | 正答時のみStage 05 FLAGを払い出す |
| POST /api/lab-sessions/{sessionId}/blue-check | judgmentId, answer | 判断を1つ判定(状態は変えない)。正解なら固定、誤答は回数を記録。前提(順序)を満たさない場合は案内のみ |
| POST /api/lab-sessions/{sessionId}/blue-hints | judgmentId, index(0〜2) | 判断の「考え方・書き方・実行例」を返し、使った段階を記録 |
| POST /api/lab-sessions/{sessionId}/blue-observe | — | 4-4: 復旧データの次の記録(1分)を取得 |
| POST /api/lab-sessions/{sessionId}/blue-actions | action | `canAdvance`(STEPの判断がすべて正解)を満たした場合だけ模擬状態を遷移。到達済みの遷移の重複は何もしない |
| POST /api/lab-sessions/{sessionId}/report | track, report | 調査／防御レポート保存・項目充足の採点 |
| POST /api/lab-sessions/{sessionId}/reset | — | ブラウザの現セッションを新規ID・FLAGへ切替 |

読み取り操作も大きな暗号化状態をCookieやHTTPヘッダーへ入れず、本文で渡すためPOSTにしています。リクエストのキー・入力形式・所有者確認はサーバー側で処理します。未開始401、別セッション404、期限切れ410、不正遷移／古い状態409、試行制限429です。

`evidence`はS01で`ports`、S03で`risk`、S04で`permission`を使用します。S05は事前に根拠回答が検証されている必要があります。FLAG正解一覧は平文のセッションDTOへ含めず、各教材やS05根拠検証成功時だけ該当FLAGを返します。

## 模擬ターミナル

`terminal.server.ts`は文字列をトークン化して既定の教材へ対応付けるインタープリターです。シェル、eval、subprocess、ネットワーク通信は呼び出しません。`nmap/curl/ssh/pwd/whoami/ls/cd/cat/grep/head/exit/clear/help`だけをサポートします。対象は`aqua.lab.test`、HTTPポート8080、学習用の仮想ファイルです。

`commands`は、入力コマンド、出力、exitCode、操作scene、説明、更新したterminal状態とsessionを返します。コマンドの入力エラーはHTTP 200 / exitCode 1で端末に表示し、接続先・cwd・観測済み項目は変更しません。セッション不正・未解放ステージは通常のHTTPエラーです。コマンドは512文字以内、1分60回までです。

`session.terminal`は`host`、`cwd`、`observations`、`commandCount`、`lastError`です。既存セッションで未設定なら初期状態へ補完します。FLAG提出には各ステージの必須観測が必要で、未調査なら`COMMAND_REQUIRED`です。S05の根拠回答にもログの読み取りと絞り込みを要求します。

`hints`は`hint`、`step`、`explanation`、`level`、任意の`command`と更新したsessionを返します。外部AI APIは使わず、サーバーが進捗と入力エラーに対応する説明・次の操作例を組み立てます。端末の表示履歴と入力履歴はブラウザメモリだけに置き、暗号化状態や監査履歴へFLAG出力や入力コマンド文字列を保存しません。

## 状態と得点

5FLAGと調査レポート後にBlue Teamを解放します。本文に `slot: "practice"` を付けると、Blueだけの練習セッション(別Cookie `aqua_practice_session`・`aqua_practice_checkpoint`)として扱い、最初からBlueを操作できます。練習の得点は合計(`score.total`)と完了判定に加算しません。

| 操作 | 遷移 | 必要な証拠 |
| --- | --- | --- |
| ACKNOWLEDGE_ANOMALY | anomaly_detected → investigating | 連続超過の開始(14:03)・確定(14:05)、単発を除外した理由 |
| ISOLATE_TRAINING_FEED | investigating → input_isolated | PLC-03 / CL2_DOSE_SP、原因候補(承認外の設定変更・表示側の停滞)、操作ログの引用、隔離の判断 |
| ENTER_SIMULATED_SAFE_MODE | input_isolated → safe_mode | 適切な4対応をすべて選び、不適切な対応を選ばない |
| VERIFY_STABLE | safe_mode → verified | 承認つきでベースラインへ戻す・maint_tmp無効化・復旧データへ切替・3回連続の正常確認・現場手分析 |
| RESTORE_SIMULATED_MONITORING | verified → recovered | AUTOへ戻す・隔離解除・復旧後の比較監視 |

判定ルールは `src/lib/scenarios/blue-steps.ts` の `JudgmentSpec`(16判断の validate・canAnswer・配点・ヒント)と `canAdvance` に集約し、選択肢とフィードバックは `incident.ts` に置いて、画面とサーバーが同じ定義を使います。数値は `src/lib/scenarios/incident.ts` の `INCIDENT` に集約しています。

不正順序は`INVALID_STATE_TRANSITION`、正常性の根拠不足は`VERIFICATION_REQUIRED`として状態を変えません。これらは固定された架空教材の検証で、実設備の安全確認ではありません。

調査レポート項目は`observations`、`evidence`、`timeline`、`improvements`、防御レポートはこれに`impact`(影響範囲)を加えた5項目で、それぞれ10〜4000文字です。Red FLAG40、調査レポート10、Blue操作42(16判断: STEP 01 8・02 12・03 6・04 10・05 6)、検知根拠と防御レポート8の合計100点です。Blue操作は判断ごとに減点します(誤答 −1/回・下限は配点の50%切り上げ、「実行例」を見た判断は50%が上限)。得点は保存せず、回答・誤答回数・ヒント段階から毎回計算します。防御レポートは提出後に変更できません(`REPORT_ALREADY_SUBMITTED`)。レポート本文の品質評価は講師確認が必要です。

24時間の期限、ヒント・操作の直近100件の履歴、各課題の1分10試行を保持します。開始制限もブラウザのCookie単位で1分10回です。未提出の入力途中テキストは保存しません。履歴にFLAG入力値は保存しません。
