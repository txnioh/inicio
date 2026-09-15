# inicio

Minimal portfolio for Antonio J. Gonzalez (txnio).

## Writing

Read the [editorial guide](docs/writing-style.md) before drafting an article or designing its demos. It records the reference structures, writing rules, section template, and review checklist used in Inicio.

The first article, **Making SVG feel like ink**, lives at `/writing/ink`. It explains the drawing technique through interactive demos, without code blocks or source downloads. The demo uses synthetic curves rather than economic predictions.

## Identity

The purple ink circle uses three overlapping marker passes in `#918BD6`, generated with the article’s drawing geometry. The SVG master lives in `public/identity/ink-circle.svg`. Favicon SVG/ICO/PNG files, the Apple touch icon and `public/social-preview.png` are linked in `index.html`.

Regenerate them with `node --experimental-strip-types scripts/render-identity.mjs` (verified with Node 24). The script uses Sharp and Canvas from the workspace runtime; `INK_RENDER_NODE_MODULES` can point to another installation. These packages are not added to the website bundle.

## Development

```bash
npm install
npm run dev
```
