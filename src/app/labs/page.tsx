import { Catalog } from "@/components/catalog";
export const metadata = { title: "演習ラボ" };
export default function LabsPage() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCENARIO LIBRARY</div>
          <h1>演習ラボ</h1>
          <p>架空のインフラを舞台に、調査と防御のスキルを段階的に学ぶ。</p>
        </div>
        <span className="count-badge">03 SCENARIOS</span>
      </div>
      <Catalog />
      <div className="notice catalog-notice">
        Phase
        1：シナリオの内容をご覧いただけます。演習の開始・FLAG提出は後続フェーズで対応します。
      </div>
    </div>
  );
}
