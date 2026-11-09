import type { Metadata } from "next";
import Link from "next/link";
import { AquaFrame } from "@/components/aqua-frame";
export const metadata: Metadata = { title: "PROJECT AQUA / 演習結果" };
export default function ResultsPage() {
  return <AquaFrame track="results"><section className="panel aqua-report"><div className="eyebrow">RESULTS / COMING SOON</div><h2>演習結果はまだ利用できません</h2><p>セッション管理・FLAG検証・採点・レポート保存は未実装です。現在の教材閲覧は演習の完了や得点として記録されません。</p><p>将来の完了条件は、5つのFLAG・Red Team調査レポート・Blue Teamの手順に沿った模擬復旧・防御レポートの提出です。</p><Link className="text-link" href="/labs/water-treatment/red">Red Teamの教材を見る →</Link></section></AquaFrame>;
}
