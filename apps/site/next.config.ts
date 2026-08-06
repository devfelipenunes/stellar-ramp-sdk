import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repo is a pnpm workspace; the site's output trace must root at the repo,
  // not at the site's own lockfile (silences the "inferred workspace root" warning).
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
