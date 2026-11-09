import type { Metadata } from "next";
import Link from "next/link";
import { AquaFrame } from "@/components/aqua-frame";
export const metadata: Metadata = { title: "PROJECT AQUA / 演習結果" };
export default function ResultsPage() {
  return <AquaFrame track="results"><section className="panel aqua-report"><div className="eyebrow">RESULTS / COMING SOON</div><h2>実VM演習の結果はまだ利用できません</h2><p>教材プレビューの閲覧は演習の完了や得点として記録されません。ブラウザ内テストの進捗・結果はテスト演習画面で確認できます。</p><p>将来の完了条件は、5つのFLAG・Red Team調査レポート・Blue Teamの手順に沿った模擬復旧・防御レポートの提出です。</p><Link className="text-link" href="/labs/water-treatment/practice">テスト演習・結果を開く →</Link></section></AquaFrame>;
}
