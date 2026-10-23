# Website validation

- TanStack Start + Nitro production build and strict MkDocs build pass.
- TypeScript passes for the independent website package.
- Root formatting and diff whitespace checks pass; website source lint passes.
- Four Playwright tests cover desktop/mobile at 1440x900 and 390x844, homepage keyboard entry and reduced motion, light/dark docs accessibility, mobile navigation, real search including empty results, all local linked pages/assets, and unknown-route HTTP 404s.
- Automated axe WCAG A/AA checks pass for the homepage and get-started documentation in both themes. This is not a full screen-reader audit.
- Real screenshots inspected at both viewports; ECC evidence checker passes.
- Root desktop unit suite also ran: 58 passed, one skipped. No desktop implementation changed.

## Deployment

Vercel project `rowberry`, team `adamspiceydevs-projects`, Node 24, root `apps/web`. MkDocs and marketing ship in the same deployment.

Initial deployment `dpl_41HQDw3X5zFswNKsD1SSUuA56LgK` was built on Vercel, its homepage and a nested docs page verified, then promoted to `rowberry.spicey.dev`. The custom domain's DNS configuration is verified by Vercel. Git integration is connected to `adamspicedev/rowberry`.

All four Playwright checks also passed against `https://rowberry.spicey.dev` after promotion, including actual docs search, nested routes, assets, mobile navigation, light/dark accessibility and 404 responses.

The public site describes early-development status and source installation; it does not claim a signed public app release.
