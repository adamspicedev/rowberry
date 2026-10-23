import posthog from "@posthog/rollup-plugin";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default ({ mode }: { mode: string }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };

  const vercelRepository = process.env.VERCEL_GIT_REPO_SLUG;
  const vercelCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  const vercelRelease =
    vercelRepository && vercelCommit
      ? { releaseName: vercelRepository, releaseVersion: vercelCommit }
      : {};

  return defineConfig({
    plugins: [
      tanstackStart(),
      nitro(),
      react(),
      posthog({
        personalApiKey: process.env.POSTHOG_API_KEY ?? "",
        projectId: process.env.POSTHOG_PROJECT_ID,
        host: process.env.POSTHOG_HOST,
        sourcemaps: {
          enabled: Boolean(
            process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID,
          ),
          deleteAfterUpload: true,
          ...vercelRelease,
        },
      }),
    ],
  });
};
