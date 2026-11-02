export const CITY_NAME = "七王子市";
export type LabSlug =
  "water-treatment" | "power-substation" | "railway-operations";
export type Lab = {
  id: string;
  slug: LabSlug;
  number: string;
  name: string;
  title: string;
  subtitle: string;
  description: string;
  level: "初級" | "中級" | "上級";
  category: "water" | "power" | "rail";
  status: "coming_soon";
  skills: string[];
  monitors: string[];
  objectives: string[];
};
export const labs: readonly Lab[] = [
  {
    id: "water-01",
    slug: "water-treatment",
    number: "01",
    name: "PROJECT AQUA",
    title: "浄水場へのサイバー攻撃",
    subtitle: `${CITY_NAME}中央浄水場`,
    description:
      "攻撃者の視点で手掛かりを集め、守る側の判断へ。架空の浄水場を舞台に、ICSセキュリティの基礎を学びます。",
    level: "初級",
    category: "water",
    status: "coming_soon",
    skills: ["偵察", "Web調査", "Linux", "ログ解析"],
    monitors: ["水位", "流量", "水質", "ポンプ状態"],
    objectives: [
      "5段階のCTFで調査と証拠収集の基礎を身につける",
      "FLAGと根拠を記載した調査レポートを提出する",
      "Blue Teamで異常検知・判断・模擬復旧を学ぶ",
    ],
  },
  {
    id: "power-01",
    slug: "power-substation",
    number: "02",
    name: "POWER SUBSTATION",
    title: "変電設備の異常対応",
    subtitle: `${CITY_NAME}変電設備`,
    description:
      "開閉器の状態と操作履歴に不整合が発生。監視値とログを照合し、不正操作を調査して模擬系統の安全を判断します。",
    level: "中級",
    category: "power",
    status: "coming_soon",
    skills: ["監視値の照合", "操作ログ", "異常対応"],
    monitors: ["電圧", "電流", "開閉器", "操作ログ"],
    objectives: [
      "監視値と操作履歴の不整合を特定する",
      "操作の主体と情報の信頼性を検証する",
      "模擬障害の拡大を防ぐ判断根拠を整理する",
    ],
  },
  {
    id: "rail-01",
    slug: "railway-operations",
    number: "03",
    name: "RAILWAY OPERATIONS",
    title: "鉄道運行管理システム",
    subtitle: `${CITY_NAME}鉄道運行管理`,
    description:
      "列車位置とダイヤに生じた矛盾を読み解く。複数の模擬データを検証し、安全確認と運行保留の判断を学びます。",
    level: "上級",
    category: "rail",
    status: "coming_soon",
    skills: ["データ照合", "安全判断", "復旧条件"],
    monitors: ["列車ID", "模擬位置", "時刻表", "運行状態"],
    objectives: [
      "列車位置・時刻表・運行状態の矛盾を見つける",
      "安全確認が取れない場合の仮想運行保留を判断する",
      "復旧に必要な条件を整理する",
    ],
  },
];
export function getLab(slug: string) {
  return labs.find((lab) => lab.slug === slug);
}
export const stages = [
  {
    title: "偵察",
    en: "RECONNAISSANCE",
    description: "訓練ネットワークと公開サービスを把握する。",
    objectives: [
      "対象ホストの情報を確認する",
      "公開ポートとサービスを把握する",
      "訓練用Webサービスの入口を特定する",
    ],
    skills: "ネットワーク基礎 / Nmapの結果の読み方",
    difficulty: 1,
  },
  {
    title: "Web調査",
    en: "WEB RECON",
    description: "ページの構造から、隠された手掛かりを探す。",
    objectives: [
      "ページ内リンクと画面構成を確認する",
      "HTMLソースに残されたヒントを探す",
      "訓練用の隠しページを見つける",
    ],
    skills: "HTTP / HTML / ブラウザ開発者ツール",
    difficulty: 2,
  },
  {
    title: "情報発見",
    en: "INFORMATION GATHERING",
    description: "演習用メモを読み解き、情報の関連性を整理する。",
    objectives: [
      "公開ファイルと演習メモを確認する",
      "情報の意味と関連性を整理する",
      "演習アカウントの手掛かりを得る",
    ],
    skills: "ファイル調査 / 情報整理 / 認証の基礎",
    difficulty: 2,
  },
  {
    title: "内部調査",
    en: "LINUX ENUMERATION",
    description: "許可されたアカウントで、ファイルと権限を調べる。",
    objectives: [
      "ホームと共有ディレクトリを確認する",
      "ユーザーとファイル権限を調べる",
      "演習用の調査ファイルを見つける",
    ],
    skills: "Linux基本コマンド / ユーザー / 権限",
    difficulty: 2,
  },
  {
    title: "証拠回収",
    en: "LOG & FLAG",
    description: "ログを時系列に整理し、FLAGと調査根拠を提出する。",
    objectives: [
      "演習ログのアクセス記録を読む",
      "イベントを時系列に並べる",
      "FLAGと調査メモを提出する",
    ],
    skills: "ログ解析 / タイムライン / 証拠保全",
    difficulty: 2,
  },
] as const;
export const roadmap = [
  "Next.js共通基盤",
  "VMware Fusion接続",
  "LAB 01 / AQUA",
  "LAB 02 / POWER",
  "LAB 03 / RAIL",
  "統合テストと公開判定",
];
