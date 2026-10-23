# Rowberry website and wiki

TanStack Start provides the marketing site. MkDocs Material builds the wiki into `public/docs/` before Vite/Nitro builds one deployable site. Both ship together on Vercel at <https://rowberry.spicey.dev>, with documentation at `/docs/`.

This is an independent package inside the desktop repository. It has its own Bun lockfile and does not change the desktop build or install dependencies.

## Local development

Use Node.js 24, Bun 1.4.2 and Python 3.12+ with venv support:

```sh
cd apps/web
bun install --frozen-lockfile
bun run build:docs
bun run dev
```

Edit marketing routes in `src/routes/` and styles in `src/styles.css`. Edit wiki Markdown in `wiki/`; rerun `build:docs` after documentation changes. The MkDocs config and pinned Python requirements live beside `package.json`. Python dependencies install into the ignored `.venv/` folder. Set `PYTHON` to select a Python executable if needed.

For a production preview and checks:

```sh
bun run build
bun run typecheck
bunx playwright install chromium
bun run test
# Or start the production server yourself:
bun run start
```

CI selects suites from changed paths. Website-only changes run this package and formatting, without Electron, package builds or PostgreSQL fixtures. Desktop-only changes skip the website. Changes under `.github/` and manual runs execute both suites; the required `CI` gate rejects failures or unexpected skips.

The browser suite checks responsive layout, keyboard entry, accessibility, actual docs search, links, assets and HTTP 404s against the production build. `WEB_BASE_URL` can target an existing deployment instead. It writes visual evidence under `docs/qa/website/` in the repository.

## Website analytics

PostHog tracks website page views, browser errors, and explicit getting-started,
GitHub repository, and contribution-guide clicks. Generated MkDocs pages use the
same SDK version and capture options. No desktop telemetry is added.

Copy `.env.example` to `.env` and configure `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`
and `VITE_PUBLIC_POSTHOG_HOST`. These are public browser configuration, not a
personal API key. Configure both in Vercel's build environment before deploying;
they are embedded at build time and are therefore available to the deployed
process without separate runtime forwarding. Without them, the website still
works and no analytics client is initialized. Marketing development mode opts out
of capture. Production previews with configured values send events, so browser
tests intercept PostHog requests rather than sending test traffic.

Production builds upload source maps when `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`,
and `POSTHOG_HOST` are configured in the Vercel project. Keep
`POSTHOG_API_KEY` encrypted as a sensitive environment variable. Vercel's
`VERCEL_GIT_REPO_SLUG` and `VERCEL_GIT_COMMIT_SHA` system variables supply the
release name and version; both must remain available to the build. Credential-less
preview and pull-request builds continue without an upload.

Autocapture, session replay, surveys, and person profiles are disabled. Do Not
Track is respected. There is no user identification or duplicate click logging.

- [Website dashboard](https://us.posthog.com/project/683976/dashboard/2251958)
- [Original wizard report](https://us.posthog.com/project/683976/notebooks/0deaa3a9372a)

The wizard report describes its initial output; the settings above describe the
reviewed integration.

## Deployment configuration

Vercel project: `rowberry` in `adamspiceydevs-projects`.

- Root directory: `apps/web`
- Framework: TanStack Start
- Node.js: 24.x
- Install: `bun install --frozen-lockfile`
- Build: `bun run build`
- Domain: `rowberry.spicey.dev`

No database credentials are required. PostHog source-map upload uses the
build-only `POSTHOG_API_KEY` secret described above. The build needs Python with
pip/venv for MkDocs. Nitro selects the Vercel adapter in Vercel builds; local
builds use its Node server adapter. Do not publish only the marketing output
without the wiki.

Keep release claims aligned with the desktop project's actual qualification status. Screenshots are real application captures using disposable sample data. Brand assets come from `assets/branding`; Baloo 2's OFL is included alongside the font in `public/brand/`.
