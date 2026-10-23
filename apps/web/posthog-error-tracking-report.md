# PostHog error tracking report

> ⚠️ **Needs your attention**
> - In the Vercel project `rowberry` (`adamspiceydevs-projects`), add `POSTHOG_API_KEY` as a sensitive environment variable, plus `POSTHOG_PROJECT_ID` and `POSTHOG_HOST`, for every environment that performs a deploy build.
> - Ensure `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` are configured in Vercel for runtime browser analytics.
> - Ensure Vercel system variables `VERCEL_GIT_REPO_SLUG` and `VERCEL_GIT_COMMIT_SHA` are exposed to builds, then redeploy.

## What you still need to do

1. Create a personal API key with the **Source map upload** preset at https://us.posthog.com/settings/user-api-keys. The preset provides the error-tracking write scope needed for source-map uploads.
2. In Vercel project `rowberry` (`adamspiceydevs-projects`), add the API key as the sensitive `POSTHOG_API_KEY` environment variable. Add `POSTHOG_PROJECT_ID` with value `683976` and `POSTHOG_HOST` with the configured PostHog host to every environment that runs the production build. Keep `POSTHOG_API_KEY` secret.
3. In the same Vercel project, keep `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` configured for the browser build, and expose the Vercel system variables `VERCEL_GIT_REPO_SLUG` and `VERCEL_GIT_COMMIT_SHA`. Redeploy after saving the settings.

## What error tracking does now

Uncaught browser errors and unhandled promise rejections are automatically captured by the PostHog Web SDK through `capture_exceptions: true` in `src/analytics-options.ts`. React rendering errors are covered by the root `PostHogErrorBoundary` in `src/routes/__root.tsx`. The existing PostHog browser initialization remains in that root route; no second initializer or server-side initializer was added because the app has no application-owned server handler or middleware entry point.

The app already had PostHog initialized, and it continues to use the existing runtime variables `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST`.

## Source-map upload

Source-map upload is wired in:

- `vite.config.ts`
- `package.json`
- `bun.lock`
- `README.md`

The exact production build command is `bun run build`. It is configured to upload source maps when `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `POSTHOG_HOST` are available where the build runs. The Vercel production build is `bun run build`, so every production build with those variables uploads its symbol sets and removes uploaded maps from the deploy artifact.

The verified credentialed build passed. It created release `rowberry@dd2f2b95931dc1d53333bc98514a7104ac68d609` and uploaded 22 files total: 2 client chunks, 5 SSR chunks, and 15 Nitro chunks, with 0 skipped in each phase. The build emitted only existing non-fatal warnings.

Vercel builds pair `VERCEL_GIT_REPO_SLUG` and `VERCEL_GIT_COMMIT_SHA` as the uploader release name and version when both are present. This is source-map release metadata for the build. Release linking that injects a `POSTHOG_RELEASE_ID` into the running app was not wired; therefore no claim is made that runtime exceptions currently carry a release ID. Local runs, tests, and pull-request verification builds remain unchanged.

## How to verify

Trigger an error in the deployed app, then inspect [PostHog Error Tracking](https://us.posthog.com/project/683976/error_tracking). Uploaded symbol sets appear at [Error Tracking configuration](https://us.posthog.com/project/683976/error_tracking/configuration). After the next Vercel production deploy, confirm the new symbol set is present and that minified stack traces resolve using the uploaded release metadata.
