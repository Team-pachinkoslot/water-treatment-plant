# ICS Lab / PROJECT AQUA

七王子市の架空施設を舞台にした学習アプリです。添付「PROJECT_AQUA_LAB01_Scenario_v1.0」に基づく教材プレビューに、利用者指定の**実VMを使わないブラウザ内テスト演習**を追加しています。既存の市名指定を優先し、添付の青葉市は七王子市へ統一しています。

## 起動

Node.js 24を推奨します。組み込みSQLiteを使用するため、Node.js 22系は22.13以降が必要です。

```sh
npm ci
npm run dev:simulator
```

[テスト演習](http://127.0.0.1:3000/labs/water-treatment/practice)を開き、「テスト演習を開始」を押してください。VMの用意は不要です。通常の開発サーバーが3000番を使用している場合は、停止して切り替えるか、`npm run dev:simulator -- --port 3010`で別のポートを使います。

教材の閲覧のみで起動する場合は以下です。

```sh
npm run dev
```

`.env.example`の既定値は`LAB_RUNTIME_MODE=disabled`です。`simulator`を明示した場合だけテスト操作を受け付けます。未指定・未知の値は無効になります。開発・本番のサーバーは127.0.0.1にバインドします。

本番ビルドでのテスト：

```sh
npm run build
npm run start:simulator
```

## テスト演習でできること

1. ブラウザ専用の24時間セッションを開始する。
2. 偵察 → Web調査 → 情報発見 → 内部調査 → 証拠回収の順に、教材を閲覧しFLAGと根拠を提出する。
3. Stage 05で模擬アクセスログの送信元と最初の401応答のUTC時刻を答え、正答後にFLAGを取得する。
4. 5FLAG完了後に調査レポートを提出する。
5. Blue Teamで3連続の不一致を説明し、異常確認 → 入力隔離 → 安全モード → 3連続正常サンプル確認 → 模擬復旧の順に操作する。
6. 防御レポートを提出し、得点・操作履歴・保存済みレポートを確認する。結果はJSONでダウンロードできる。
7. 再読込で提出済み進捗を復元する。リセットでは現在のセッションとFLAGを無効化し、新規セッションへ切り替える。

画面に表示するHTMLソースやLinuxファイルは**文字列の教材**です。シェル・SSH・VM・実設備の操作は行いません。Stage 03は情報露出の例示で、パスワード自体は発行しません。

採点はRed FLAG 40点、調査レポート項目の充足10点、Blue対応42点、検知根拠と防御レポート項目の充足8点、合計100点です。レポートは各4項目を10文字以上4000文字以内で記入したかを評価します。文章の妥当性や証拠品質を自動判定するものではなく、講師の確認が必要です。

## モードと保存

| 項目 | disabled | simulator |
| --- | --- | --- |
| 教材プレビュー | 閲覧可能 | 閲覧可能 |
| テストセッション・提出・模擬状態変更 | 503 / RUNTIME_NOT_CONFIGURED | ローカルで利用可能 |
| VM・SSH・設備接続 | なし | なし |
| カタログの状態 | coming_soon | coming_soon（実VM演習は未公開） |

進捗・レポート・セッション固有FLAGは`.local/aqua.sqlite`に保存します。`.local/`はGit対象外です。SQLiteはファイル権限0600、親ディレクトリ新規作成時0700で扱います。再起動後も同じファイルから復元します。Cookieを削除した場合やホスト名をlocalhostと127.0.0.1の間で変更した場合は、同じセッションへ復帰できません。レポートの未提出の入力中テキストは保存しません。

認証はHttpOnly / SameSite=StrictのセッションCookieによる所持確認です。アカウント認証ではありません。セッション・ステージ単位の暗号学的乱数FLAGを生成し、対応する教材だけで配信します。状態APIにFLAG一覧・Cookie秘密値は含めません。変更APIではローカルHostとOriginを検証し、他人のセッション・不正順序・証拠不足を拒否します。FLAGとStage 05根拠回答は各1分10試行、開始は全体で1分10回に制限し、ヒントと結果を監査履歴へ残します。提出されたFLAG入力値は履歴に記録しません。

## 画面・API

| パス | 内容 |
| --- | --- |
| `/`、`/labs` | 概要、既存3ラボ、検索・フィルター |
| `/labs/[slug]` | シナリオ概要、安全ルール、テスト演習への導線 |
| `/labs/water-treatment/red` | Red Teamの固定教材プレビュー |
| `/labs/water-treatment/blue` | 固定JSONLの監視グラフ・表・手順説明 |
| `/labs/water-treatment/results` | 実VM演習の未公開案内、テスト結果への導線 |
| `/labs/water-treatment/practice` | ブラウザ内テストの開始・進行・結果・保存 |
| `/dashboard`、`/guide` | 既存の固定モック監視と学習ガイド |
| `GET /api/health` | アプリ状態、実VM未接続、テストランタイムのモード |
| `GET /api/labs`、`GET /api/labs/[slug]` | 共通カタログ |
| `/api/lab-sessions`以下 | Cookie所有権確認付きの演習API。詳細は[実行契約](docs/aqua-runtime.md) |

共通カタログは`src/lib/labs.ts`です。`water-01 / water-treatment`、`power-01 / power-substation`、`rail-01 / railway-operations`のID・slug・表示名を維持しています。LAB 01はRed 30分 + Blue 20分 = 50分です。

教材日時は2026-11-02の固定された架空イベントで、UTCで表示します。15パーセントポイント・3連続は教材内の判定値です。実施設の安全基準を表しません。既存のApp RouterとCSSを再利用し、新しい外部依存は追加していません。

## 主な変更ファイル

- `src/components/aqua-practice.tsx`、`src/app/labs/water-treatment/practice/page.tsx`：テスト操作画面。
- `src/lib/scenarios/simulator.server.ts`：SQLite保存、FLAG・根拠照合、採点、状態遷移、リセット。
- `src/lib/scenarios/runtime.server.ts`、`errors.server.ts`、`session-types.ts`：モード選択・実行契約・公開型。
- `src/lib/scenarios/http.server.ts`、`src/app/api/lab-sessions/`：Cookie所有権、Origin、入力サイズの検証とAPI。
- `fixtures/red/logs/aqua-access.log`：添付の架空ログ。サーバー側から解放済みStage 05にのみ配信。
- `src/components/{aqua-frame,lab-detail}.tsx`、`src/app/globals.css`、`src/app/labs/water-treatment/results/page.tsx`：導線・表示。
- `src/app/api/health/route.ts`：実VMとテストランタイムの状態を区別。
- `tests/{scenario,simulator}.test.ts`、`scripts/smoke-simulator.mjs`：単体・統合検証。
- `.gitignore`、`.env.example`、`package.json`、`docs/aqua-runtime.md`、`README.md`：保存除外・起動・仕様。

## 検証

今回、以下を実行して成功しました。

```sh
npm run lint
npm run typecheck
npm test                       # 29件成功
npm run build
```

起動中の本番サーバーに対する検証：

```sh
npm run test:smoke -- http://127.0.0.1:3010
npm run test:smoke -- http://127.0.0.1:3012 --disabled
```

前者は`simulator`、後者は`disabled`で起動したサーバーを指定します。開始、5FLAG、2種類のレポート、順序と証拠の拒否、100点到達、進捗再取得、リセット、旧セッション拒否、既存ページと実VM未接続を確認しました。スモークテストは自身のテストセッションを作成し、終了時に新規状態へリセットします。

単体テストでは、別セッションのFLAG拒否、保存ファイル再読込、期限切れ、試行回数制限、ヒント監査、Cookie所有権、Origin検証、入力サイズ制限も確認しています。

ブラウザ接続機能は利用できず、ネイティブChromeで初期画面を確認しましたが、ブラウザ操作と競合したため一連のクリック検証は未完了です。接続判定の修正後はHTTPで全フローを確認しました。PC／モバイルの最終的な見た目とダウンロード操作は未検証です。

## 次の実装範囲

実VMの起動・SSH・VM教材の配置・Host-onlyとホスト側経路の検証・スナップショット復元は未実装です。演習専用Kali ARM64 / Ubuntu ARM64が用意された段階で、固定の管理処理と許可リストを使うVMware Fusionアダプターを追加します。ブラウザテストの完了はVM隔離の検証完了を意味しません。

複数利用者向けアカウント認証・講師評価・共有ホスティング、LAB 02/03の実行環境も後続範囲です。テストモードはローカル専用です。
