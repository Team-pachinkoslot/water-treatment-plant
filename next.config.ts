import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/lab-sessions{,/**}": ["./.aqua/session-key.json", "./fixtures/**/*"],
  },
  // 公開シナリオは浄水場(LAB 01)のみ。一覧と非公開シナリオのURLは浄水場のシナリオ詳細へ一時リダイレクトする。
  redirects() {
    return [
      { source: "/labs", destination: "/labs/water-treatment", permanent: false },
      ...["power-substation", "railway-operations"].map((slug) => ({
        source: `/labs/${slug}/:path*`,
        destination: "/labs/water-treatment",
        permanent: false,
      })),
    ];
  },
};
export default nextConfig;
