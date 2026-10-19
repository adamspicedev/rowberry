# Rowberry asset provenance

Approved source artwork: `/Users/spicey/Documents/Codex/2026-10-20/task/rowberry-artwork/exec-882a3ffc-0a34-4809-9662-a9a7a8b76a2b.png`, 1536 × 1024 PNG, 1,219,482 bytes. The actual source pixels were viewed on 20 October 2026 before drawing these assets.

The SVG masters are clean geometric reconstructions of the approved berry/cursor identity, not crops or embedded bitmaps. `rowberry-mark.svg` contains rounded berry cells in the 3, 3, 2, 1 pattern and the mint cursor/leaf. `rowberry-wordmark.svg` uses original hand-drawn vector letterforms with rounded caps, joins and bowls, preserving the lowercase rounded treatment. No font is embedded, outlined, downloaded, or required. `rowberry-lockup.svg` combines these masters. `rowberry-app.svg` adds the charcoal rounded-square tile for desktop icons.

`src/renderer/assets` contains copies of the mark and wordmark for Vite. Update these copies when editing the masters. Packaging uses `rowberry.icns` on macOS, `rowberry.ico` on Windows, and `icons/` PNGs on Linux. `scripts/generate-icons.mjs` renders the app SVG locally in Electron at every supplied size and writes PNG representations into ICO and ICNS containers. It uses no external service or uploads.

Palette from the approved board: charcoal #191B24, lavender #9B7BFA, mint #72D6B0, warm offwhite #F7F5F0. Renderer controls use darker purple #6743B5 for white text in light mode and charcoal on lavender in dark mode.

Asset and product licensing are pending the owner's decision. This record asserts no domain availability, trademark clearance, or external ownership rights. No assets were published.
