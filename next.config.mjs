import { execSync } from "node:child_process";

function resolveBuildRevision() {
  const providerRevision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.NEXT_PUBLIC_BUILD_REVISION;
  if (providerRevision) return providerRevision.slice(0, 7);

  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "LOCAL";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_REVISION: resolveBuildRevision(),
  },
};

export default nextConfig;
