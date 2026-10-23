# Rowberry website design contract

Purpose: explain the local PostgreSQL desktop product and help a developer try it responsibly.
Audience: PostgreSQL users who work with tables, SQL and nested JSON.
Primary action: Get started, linking to honest source-install instructions.
Hierarchy: product identity and concrete promise, real desktop screenshot, three core workflows, local data model, release status and questions, contribution links.
Direction: quiet editorial layout, warm off-white paper, charcoal text, existing purple and mint accents. Baloo 2 wordmark and system body fonts. No remote fonts, decorative gradients, invented endorsements or download claims.
References: existing Rowberry logo/palette and local app screenshots; user preference for compact practical UI. The existing JSON inspector demonstrates the product rather than an imagined mockup.
Targets: 390x844 and 1440x900. Navigation stays visible on mobile; screenshots retain aspect ratio and can be opened full size. No hover-only actions.
Docs: MkDocs Material under /docs/, same colors and identity, local search, accessible keyboard navigation and clear return to the website.
States: marketing is static; 404 has recovery, docs search has loading/results/empty states. No account or permission-gated content. Image alt text preserves meaning if assets are unavailable.
Validation: production build, TypeScript, browser navigation/search/404/keyboard checks, both viewport screenshots, no horizontal overflow or missing local assets.
