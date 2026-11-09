# ICS Lab / PROJECT AQUA

既存のICS Lab Phase 1に、添付「PROJECT_AQUA_LAB01_Scenario_v1.0」の教材UIと固定モックデータを追加した実装です。市名は利用者の指定を優先し、**七王子市**に統一しています。今回の添付にある「青葉市」は既存の明示指定に合わせて置き換えています。

## 起動

Node.js 22.13以降の22系、24系、または26以降が必要です（開発ツールを含む）。開発確認環境はNode.js 24です。

```sh
npm ci
npm run dev
```

http://127.0.0.1:3000 を開いてください。既定でループバックにバインドします。

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
```

## 実装範囲

| パス                   | 内容                                            |
| ---------------------- | ----------------------------------------------- |
| `/`                    | 概要、PROJECT AQUA、3ラボ、学習ガイドへの導線   |
| `/labs`                | 3ラボの一覧、文字列検索、分野・難易度フィルター |
| `/labs/[slug]`         | シナリオ詳細、概要・学習内容・ルールの切り替え  |
| `/labs/water-treatment/red` | Red Team 5課題、各3段階のヒント、証拠項目、無効なFLAG提出欄 |
| `/labs/water-treatment/blue` | 添付JSONLの水位グラフ・表、アラート説明、対応5手順、復旧確認用サンプル |
| `/labs/water-treatment/results` | 採点・結果機能の未実装案内 |
| `/dashboard`           | 固定の模擬計測値、設備図、APIヘルスチェック     |
| `/guide`               | 学習の進め方、開発ロードマップ                  |
| `GET /api/health`      | アプリのヘルスと無効なランタイムの状態          |
| `GET /api/labs`        | 3ラボのカタログ                                 |
| `GET /api/labs/[slug]` | 詳細。未知のslugは構造化された404               |

| ID         | slug                 | 難易度 |
| ---------- | -------------------- | ------ |
| `water-01` | `water-treatment`    | 初級   |
| `power-01` | `power-substation`   | 中級   |
| `rail-01`  | `railway-operations` | 上級   |

カタログは `src/lib/labs.ts` を画面・APIで共有します。LAB 01の所要時間はRed 30分 + Blue 20分 = **50分**です。ID・slug・表示名とLAB 02/03は維持しています。

学習者向けの定義 `ScenarioDefinition` は `src/lib/scenarios/aqua.ts`、サーバー側の `ScenarioRuntimeAdapter` と `DisabledScenarioRuntime` は `src/lib/scenarios/runtime.server.ts` に分離しました。添付JSON全体や管理者ガイドは配信せず、課題・ヒント・対応手順のみを選んで実装しています。既存のApp RouterとCSSを再利用し、依存関係は追加していません。

`.env.example` に `LAB_RUNTIME_MODE=disabled` を明記しています。アダプターのstart / submitFlag / performBlueActionは必ず `RUNTIME_NOT_CONFIGURED` で拒否し、未知のモードを指定しても実行環境を有効にしません。開始・FLAG提出・Blue Team操作のPOST APIは今回公開していません（404、既存の読み取りAPIへのPOSTは405）。UIのボタンも無効です。

`fixtures/blue/` の3ファイルは添付からそのままコピーしています。サーバー側で読み取り、モデル値とHMI表示値、差、流量、入力経路、模擬状態を表示します。日時は**2026-11-02の固定された架空イベント（UTC）**です。復旧サンプルの表示は演習の成功・復旧完了を意味しません。15ポイント・3連続のルールは教材内の仮の判定値です。

全ラボが `status: coming_soon`、`LabRuntimeProvider` は `mode: disabled` / `connected: false` です。監視値・グラフ・設備図は固定サンプルです。FLAG正解値、実行可能な演習、採点、レポート保存、VM操作、設備制御、実ネットワーク接続、認証は実装していません。

Red Teamは5段階の調査・証拠収集、Blue Teamは検知・判断・仮想設備の模擬復旧として区別しています。Power / Railの追加プロジェクト名は独自に仕様化せず、それぞれ設備名で表示します。

## 今回変更・追加したファイル

- `src/app/labs/water-treatment/{red,blue,results}/page.tsx`：教材3画面。
- `src/components/{aqua-frame,aqua-telemetry}.tsx`：教材共通枠・グラフと表。
- `src/components/lab-detail.tsx`、`src/app/globals.css`：概要の導線・ストーリー・表示スタイル。
- `src/lib/labs.ts`、`src/lib/scenarios/{aqua.ts,runtime.server.ts,telemetry.server.ts}`：共通カタログ・教材定義・無効アダプター・固定データ読取。
- `fixtures/blue/{telemetry.jsonl,recovery_telemetry.jsonl,alerts.json}`：添付モックデータ。
- `tests/scenario.test.ts`：拒否動作と教材整合のテスト。
- `.env.example`、`docs/aqua-runtime.md`、`README.md`：設定例・将来契約・実装と検証記録。

## 後続フェーズ

1. ローカル管理アダプターとVMware Fusion / ARM64接続
2. LAB 01のセッション単位のFLAG発行・検証、段階別教材配信、Red Team採点・レポート保存、Blue Teamの状態遷移と復旧検証
3. LAB 02、LAB 03の設備モデル
4. 隔離、認証・認可、監査、採点、復元を検証して統合

VM連携ではサーバー側の固定処理と許可リストを使用し、利用者入力をシェルへ渡さない設計を前提とします。演習ネットワークはHost-onlyを想定しますが、ホスト側の経路制御は別途実装・検証が必要です。

## 表示について

チャコールを基調にオレンジと青緑を使用したレスポンシブUIです。フォントはGoogle Fontsから任意で読み込み、オフラインではシステムフォントにフォールバックします。キーボード操作、スキップリンク、フォーカス表示、モーダルのEscapeキーとフォーカス循環、動きを抑える設定に対応します。

## 検証と制限

今回の実行結果：

- `npm run dev -- --port 3000`：起動とHTTP応答を確認。
- `npm run lint`：成功。
- `npm run typecheck`：成功。
- `npm test`：19件成功（既存11件 + シナリオ境界・教材整合8件）。
- `npm run build`：成功。Red / Blue / Resultsを静的ページとして生成。
- 開発・本番HTTP：追加3画面、既存ページ・APIの200、5課題と無効ボタン、未知slugの404、未対応POSTの404/405を確認。
- ソース・生成されたHTML・ブラウザJSを検査し、FLAG実値、資格情報、Stage 05の管理者用回答の混入がないことを確認。添付のRed教材や管理者ガイドはアプリへコピーしていません。

ブラウザ接続機能が「browser access host is unavailable」で利用できなかったため、実画面でのクリック・PC／モバイルの見た目は未検証です。このディレクトリはGitリポジトリではないため、Git履歴の検査はできません。VM起動・SSH・攻撃コマンド・設備操作・外部接続の実装はありません。認証・レート制限・採点・保存・リセット・VMネットワーク検証は後続フェーズです。

将来APIの契約は [docs/aqua-runtime.md](docs/aqua-runtime.md) を参照してください。

本番依存の監査は `npm audit --omit=dev` で確認できます。開発依存にはminimatch由来の中程度の監査指摘が残ります。ESLintはNext.js配下のプラグインが宣言する互換範囲に合わせて9系を使用しています。互換性を崩す強制更新は行っていません。
