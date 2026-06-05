import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The run dashboard drives kg-gen by spawning its CLI as a child process
  // (see server/run-registry.ts) — no kg-gen code is bundled into the app, so
  // none of its native deps (whisper, ffmpeg, pdf2json) touch the Next build.
  reactStrictMode: true,
  // This app has its own lockfile but lives inside the kg-gen repo (which also
  // has one); pin the tracing root to this dir so Next doesn't pick the parent.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
