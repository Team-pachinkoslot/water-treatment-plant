import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
export default function NotFound() {
  return (
    <div className="page empty-state">
      <Search size={35} />
      <div className="eyebrow">404 / NOT FOUND</div>
      <h1>ページが見つかりません</h1>
      <p>URLを確認するか、演習ラボからシナリオを選択してください。</p>
      <Link className="button primary" href="/labs">
        <ArrowLeft size={15} /> 演習ラボへ
      </Link>
    </div>
  );
}
