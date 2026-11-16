import { aquaScenario } from "./scenarios/aqua";
export const CITY_NAME = "七王子市";
export type LabSlug = "water-treatment";
export type Lab = {
  id: string;
  slug: LabSlug;
  number: string;
  name: string;
  title: string;
  subtitle: string;
  description: string;
  level: "初級" | "中級" | "上級";
  category: "water";
  status: "available";
  durationMinutes?: number;
  skills: string[];
  monitors: string[];
  objectives: string[];
};
export const labs: readonly Lab[] = [
  {
    id: "water-01",
    slug: "water-treatment",
    number: "01",
    durationMinutes: aquaScenario.durationMinutes.total,
    name: "PROJECT AQUA",
    title: "浄水場の調査から復旧まで",
    subtitle: `${CITY_NAME}中央浄水場`,
    description:
      "攻撃者の視点で手掛かりと証拠を集め、守る側として異常を検知し、模擬復旧までを判断する。架空の浄水場を舞台に、ICSセキュリティの基礎を学びます。",
    level: "初級",
    category: "water",
    status: "available",
    skills: ["調査", "異常検知", "復旧", "ログ解析"],
    monitors: ["水位", "流量", "水質", "ポンプ状態"],
    objectives: [
      "5段階のCTFで調査と証拠収集の基礎を身につける",
      "FLAGと根拠を記載した調査レポートを提出する",
      "Blue Teamで異常検知・判断・模擬復旧を学ぶ",
    ],
  },
];
export function getLab(slug: string) {
  return labs.find((lab) => lab.slug === slug);
}
export const stages = aquaScenario.redStages.map((stage) => ({
  title: stage.title,
  en: stage.skill,
  description: stage.studentTask,
  objectives: [stage.studentTask, `調査記録：${stage.report}`],
  skills: stage.skill,
  difficulty: stage.difficulty,
}));
export const roadmap = [
  "Next.js共通基盤",
  "VMware Fusion接続",
  "LAB 01 / AQUA",
  "統合テストと公開判定",
];
