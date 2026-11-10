import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/lab-sessions{,/**}": ["./.aqua/session-key.json", "./fixtures/**/*"],
  },
};
export default nextConfig;
