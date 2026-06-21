import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack never mis-infers it from an unrelated
  // parent-directory lockfile on a developer's machine. In CI the checkout is
  // isolated, but this keeps local builds deterministic and warning-free.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
