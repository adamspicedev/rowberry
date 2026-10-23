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

## Deployment

Vercel project: `rowberry` in `adamspiceydevs-projects`.

- Root directory: `apps/web`
- Framework: TanStack Start
- Node.js: 24.x
- Install: `bun install --frozen-lockfile`
- Build: `bun run build`
- Domain: `rowberry.spicey.dev`

No database credentials or application secrets are required. The build needs Python with pip/venv for MkDocs. Nitro selects the Vercel adapter in Vercel builds; local builds use its Node server adapter. Do not publish only the marketing output without the wiki.

Keep release claims aligned with the desktop project's actual qualification status. Screenshots are real application captures using disposable sample data. Brand assets come from `assets/branding`; Baloo 2's OFL is included alongside the font in `public/brand/`.
