# Rowberry asset provenance

Approved source artwork: `/Users/spicey/Documents/Codex/2026-10-20/task/rowberry-artwork/exec-882a3ffc-0a34-4809-9662-a9a7a8b76a2b.png`, 1536 × 1024 PNG, 1,219,482 bytes. The actual source pixels were viewed on 20 October 2026 before drawing these assets.

The SVG masters are clean geometric reconstructions of the approved berry/cursor identity, not crops or embedded bitmaps. `rowberry-mark.svg` contains rounded berry cells in the 3, 3, 2, 1 pattern and the mint cursor/leaf. The canonical wordmark is actual lowercase `rowberry` text in the renderer, set in locally bundled Baloo 2 at weight 800. The former hand-drawn wordmark and lockup SVGs have been removed. `rowberry-app.svg` adds the charcoal rounded-square tile for desktop icons.

`src/renderer/assets` contains the mark copy and local font for Vite. Update the mark copy when editing its master. Packaging uses `rowberry.icns` on macOS, `rowberry.ico` on Windows, and `icons/` PNGs on Linux. `scripts/generate-icons.mjs` renders the app SVG locally in Electron at every supplied size and writes PNG representations into ICO and ICNS containers. It uses no external service or uploads.

Palette from the approved board: charcoal #191B24, lavender #9B7BFA, mint #72D6B0, warm offwhite #F7F5F0. Renderer controls use darker purple #6743B5 for white text in light mode and charcoal on lavender in dark mode.

Berry artwork and product licensing are pending the owner's decision. This record asserts no domain availability, trademark clearance, or external ownership rights. No assets were published.

## Baloo 2 font

Requested font: [Baloo 2 on Google Fonts](https://fonts.google.com/specimen/Baloo+2?preview.lang=en_Latn). The unmodified variable TrueType font is bundled at `src/renderer/assets/fonts/Baloo2-Variable.ttf`. Source: [official Google Fonts repository](https://github.com/google/fonts/blob/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf), downloaded 20 October 2026. The original filename is `Baloo2[wght].ttf`; only the local filename changes.

The font is copyright 2019 The Baloo 2 Project Authors and distributed under the SIL Open Font License 1.1. Its complete upstream [OFL.txt](https://github.com/google/fonts/blob/main/ofl/baloo2/OFL.txt) is preserved beside the font. CSS loads the bundled file through `@font-face`; runtime loading makes no remote font requests. Only the wordmark uses this font. The build also copies the complete licence into `dist/renderer/Baloo2-OFL.txt` so packaged font copies retain the licence. Icon and berry artwork are unchanged.

Downloaded font SHA-256: `d47a6852548059b1db49a1319d06d499d546c3fa2237cf9eee9c43c8abb025c2` (683,200 bytes). The font declares the family Baloo 2 and a variable `wght` axis from 400 through 800.
