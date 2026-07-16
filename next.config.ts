import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  serverExternalPackages: ["pg", "nodemailer"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
