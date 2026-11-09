import { DashboardPreview } from "@/components/dashboard-preview";
export const metadata = { title: "開発プレビュー" };
export default function Dashboard() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEVELOPMENT WORKSPACE</div>
          <h1>開発プレビュー</h1>
          <p>画面とAPIの共通基盤を確認する、Phase 1のワークスペース。</p>
        </div>
        <span className="phase-badge">
          <i className="dot amber" /> MOCK DATA
        </span>
      </div>
      <DashboardPreview />
    </div>
  );
}
