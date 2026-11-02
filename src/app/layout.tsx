import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "ICS Lab — 産業システムを、守る力へ。",
    template: "%s | ICS Lab",
  },
  description:
    "七王子市の架空設備を舞台にしたICSセキュリティ学習プラットフォーム。Phase 1の開発プレビュー。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <a className="skip-link" href="#main-content">
          本文へスキップ
        </a>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
