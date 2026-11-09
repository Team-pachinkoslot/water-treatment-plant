# ICS Lab / PROJECT AQUA

七王子市の架空施設を舞台にしたブラウザ演習です。添付シナリオの5段階Red Team調査とBlue Teamの異常確認・隔離・模擬復旧を、**Linux・VM・外部DBを使わずVercel上で実行**できます。

`/labs/water-treatment`の「演習を開始」を押すと、新規演習を開始するか、このブラウザに保存された進捗を再開します。LAB 01は利用可能、LAB 02/03は準備中です。ID・slug・名称を維持し、市名は従来の指定に合わせて七王子市へ統一しています。所要時間はRed 30分 + Blue 20分 = 合計50分です。

## Vercelへの反映

通常のNext.jsアプリとしてこのリポジトリを再デプロイしてください。

- Install Command：`npm ci`
- Build Command：`npm run build`
- Node.js：24.xを推奨（22.13以降の22系も対応）。
- 外部DB、Linuxサーバー、SSH、ストレージサービスの設定は不要です。
- `LAB_RUNTIME_MODE`未指定で演習が有効になります。以前`disabled`を登録した場合は削除するか、`simulator`へ変更して再デプロイしてください。

ビルド前に`scripts/prepare-session-key.mjs`が秘密鍵を生成し、`.aqua/session-key.json`へ保存します。`.aqua/`はGit対象外です。Next.jsの`outputFileTracingIncludes`により鍵と固定教材をサーバーFunctionだけへ同梱します。秘密鍵・FLAG一覧・管理者回答はブラウザ用JSや公開HTMLへ含めません。

既定の鍵はデプロイごとに変わります。再デプロイをまたいで演習を継続させたい場合のみ、Vercelの環境変数`AQUA_SESSION_KEY`へ暗号学的乱数の64桁16進文字列を登録します。`NEXT_PUBLIC_`は付けません。鍵を変更・削除すると、それまでの保存済み演習は再開できなくなります。

この作業環境にはVercel CLIの認証・対象プロジェクト設定がないため、今回の変更の公開反映は未実施です。

## ローカルで確認

Node.js 24を推奨します。

```sh
npm ci
npm run dev
```

[LAB 01](http://127.0.0.1:3000/labs/water-treatment)から「演習を開始」を押してください。特別な環境変数の設定なしで動きます。教材閲覧だけに制限する場合は`LAB_RUNTIME_MODE=disabled`で起動します。未知のモードも無効です。

```sh
npm run build
npm run start
```

## 実装した演習

1. 24時間有効のセッションを開始。
2. 偵察 → Web調査 → 情報発見 → 内部調査 → 証拠回収の順に、解放された教材だけを閲覧。
3. 各ステージのFLAGと必要な根拠を提出。Stage 05は模擬ログの送信元・最初の401のUTC時刻が正答した場合だけFLAGを取得。
4. 5FLAG後に調査レポートを提出。
5. Blue Teamで3連続不一致の根拠を説明し、確認 → 入力隔離 → 安全モード → 3連続正常サンプル確認 → 模擬復旧。
6. 防御レポートを提出し、得点・履歴・レポートを確認。結果はJSONで保存可能。
7. 同じブラウザで再開、またはリセットして新規セッションへ移行。

HTML・Linuxファイル・アクセスログ・センサー値は教材です。コマンドやSSH接続、設備操作は実行しません。教材のイベント日時は2026-11-02の固定された架空イベント（UTC）。15パーセントポイント・3連続は教材内の仮の判定値です。

## 保存方式

進捗はサーバーがAES-256-GCMで暗号化・認証し、ブラウザのlocalStorageへ保存します。HttpOnly / SameSite=Strict Cookieが所有者と最新チェックポイントを保持し、HTTPSではSecureも付与します。FLAG検証・証拠検証・採点は毎回サーバーで行います。

各Functionは暗号化状態から**メモリ内SQLite**を復元し、処理結果を新しい暗号化状態として返します。実行時のSQLiteファイルへの書き込みや、特定Functionのメモリの継続利用はありません。ローカルSQLiteファイル版は内部アダプターの検証用として残していますが、Web APIは常にブラウザ保存方式を使います。

- 再読込・別Functionからの処理でも、同じCookieと保存データで継続できます。
- ブラウザデータ／Cookieの削除、別ブラウザ・別ドメインへの移動で進捗は引き継げません。
- 未提出の入力中テキストは保存しません。
- 改変された暗号化状態や、現在のCookieに対応しない古い状態は拒否します。失敗した提出も新しい状態として保存し、試行回数を保持します。
- 中央データストアはありません。講師による一括集計・複数端末同期・厳密な不正対策・過去のCookieと状態を丸ごとコピーした履歴の一括失効は対象外です。学習用の自己確認方式です。

FLAGとStage 05根拠回答は各セッションの課題ごとに1分10回、開始はブラウザのCookieごとに1分10回に制限します。Cookieを消去した利用者を追跡する全体レート制限ではありません。

## 採点

Red FLAG 40点、調査レポート項目の充足10点、Blue対応42点、検知根拠と防御レポート項目の充足8点、合計100点です。レポート4項目を各10〜4000文字で記入したかを評価します。文章の妥当性や証拠品質は講師の確認が必要です。

## 画面

| パス | 内容 |
| --- | --- |
| `/`、`/labs` | 概要と3ラボのカタログ |
| `/labs/water-treatment` | 有効な「演習を開始」ボタン、ストーリー、安全ルール |
| `/labs/water-treatment/practice?start=1` | 新規開始または再開 |
| `/labs/water-treatment/red`、`/blue` | 固定教材のプレビュー。演習画面へのリンクを表示 |
| `/labs/water-treatment/results` | 保存済み演習の結果画面へ移動 |
| `/dashboard`、`/guide` | 既存の固定モック監視と学習ガイド |
| `GET /api/health` | VM未接続とブラウザ演習モードを分けて表示 |

API・実行契約は[docs/aqua-runtime.md](docs/aqua-runtime.md)を参照してください。

## 主な変更ファイル

- `src/components/lab-detail.tsx`、`src/app/labs/[slug]/page.tsx`：開始ボタンの有効化と公開状態。
- `src/components/{aqua-practice,aqua-frame,lab-card,catalog}.tsx`、`src/lib/labs.ts`：自動開始・再開、ブラウザ保存、利用可能表示。
- `src/lib/scenarios/{http.server,cloud-state.server,simulator.server,runtime.server}.ts`：HTTPS対応、暗号化チェックポイント、メモリ内実行、既定有効化。
- `src/app/labs/water-treatment/{practice,red,blue,results}/page.tsx`：演習・教材・結果の導線。
- `scripts/prepare-session-key.mjs`、`next.config.ts`、`package.json`、`.env.example`、`.gitignore`：Vercelビルドと鍵のサーバー同梱。
- `tests/cloud-session.test.ts`、既存テスト、`scripts/smoke-simulator.mjs`：新方式の検証。

## 検証

以下は今回成功しました。

```sh
npm run lint
npm run typecheck
npm test                         # 33件成功
npm run build
npm run test:smoke -- http://127.0.0.1:3010
npm run test:smoke -- http://127.0.0.1:3012 --disabled
```

スモークテストは、既定有効／明示disabledの本番サーバーを別々のポートで起動して実施しています。開始から5FLAG、2種類のレポート、順序・根拠検証、100点到達、進捗再開、リセットを確認しました。単体テストではHTTPSのVercelドメイン、Cookie、Origin、暗号化状態の改変・旧チェックポイント拒否、試行制限、リクエストサイズ制限も確認しています。

Functionのファイルトレースで秘密鍵と教材の同梱を確認しています。ブラウザ接続機能が利用できず、実画面のクリック検証は未完了です。Vercel上での公開デプロイ・実URLでの受入確認も未実施です。
