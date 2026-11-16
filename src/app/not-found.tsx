import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
export default function NotFound() {
  return (
    <div className="page empty-state">
      <Search size={35} />
      <div className="eyebrow">404 / NOT FOUND</div>
      <h1>ページが見つかりません</h1>
      <p>URLを確認するか、演習シナリオのページへ移動してください。</p>
      <Link className="button primary" href="/labs/water-treatment">
        <ArrowLeft size={15} /> 演習シナリオへ
      </Link>
    </div>
  );
}
