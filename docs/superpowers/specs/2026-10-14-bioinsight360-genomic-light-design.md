# BioInsight 360 — "Genomic Light" Visual Redesign (Design)

**Date:** 2026-10-14
**Status:** awaiting approval

## Intent & why
The app works but looks utilitarian. We want a **professional, modern** face that serves two audiences at once:
- **Public launch** — polished enough to look like a real product (dev-tool quality).
- **Thesis defence** — calm, credible, readable; no gimmicks that undermine scientific seriousness.

Chosen direction (**B — Genomic Light**) and homepage layout (**Split hero**), selected by the user from mockups.

## Goals
- Light theme, refined: white → soft blue-grey surfaces.
- **Frosted-glass** panels (soft borders + `backdrop-filter: blur`).
- One confident accent gradient: **blue → cyan** (`#2563eb → #06b6d4`).
- Animated **DNA double-helix** as the signature motif (site background + hero illustration).
- Gentle scroll-reveal motion.
- Consistent across all pages.
- **No functional or build regressions.**

## Non-goals
- No dark mode (this pass).
- No WebGL/three.js; animations are CSS/SVG only.
- No new npm dependencies.
- No changes to routes, data flow, or the backend integration.

## Anti-goals (would mean failure)
- Motion that distracts or hurts readability.
- Text sitting on a busy DNA background.
- Slower load or a broken `next build`.
- An "academic" look downgraded into a flashy marketing page.

## Constraints
- Next.js 16 App Router; existing `app/globals.css` and component classes must keep working.
- Decorative animation must respect `prefers-reduced-motion`.
- Keep Lighthouse performance healthy (big static page) — no layout thrash.

## Decisions taken (the "how")
- **Palette / tokens** (extend `:root` in `globals.css`):
  - `--accent-primary #2563eb`, `--accent-cyan #06b6d4`, gradient `--accent-grad`.
  - `--surface #ffffff`, `--surface-2 #f1f5ff`, `--border #e2e8f0`.
  - `--glass: rgba(255,255,255,0.66)` + `--glass-border: rgba(255,255,255,0.75)` + `--glass-shadow` (soft, layered).
  - `--blur: 14px`; radii 12/16px.
  - text `#0f172a / #334155 / #64748b` (unchanged).
- **DNA motif:** a single site-wide `DnaBackground` fixed layer — two thin sine strands + rungs, blue/cyan, ~8–12% opacity, slow drift (≈30s), behind content (`z-index: -1`, `pointer-events: none`).
- **Glass:** upgrade `.glass-card` + a `.glass-panel` variant (translucent + blur), keep hover lift.
- **Hero (split):** left = headline (`BioInsight 360`), the full subtitle line, primary CTA, a small "trust" strip (3 stats: engines, pipelines, privacy); right = a larger animated helix SVG with a few floating glass "result" chips.
- **Motion:** a `Reveal` client component (IntersectionObserver) fades/slides sections in on first view; duration 400–600ms, ease-out; disabled under `prefers-reduced-motion`.
- **Navbar/footer:** light glass, sticky, blurred.

## Phasing
- **P1 — the visible win:** tokens + `DnaBackground` + glass Navbar/Footer + Split hero on the landing page.
- **P2 — consistency:** apply glass/tokens to Upload, QC, Consensus, Pathways, Export (headers, cards, buttons).
- **P3 — polish:** micro-interactions, a11y (aria-labels, focus rings), Lighthouse pass.

## Files (anticipated)
- Modify: `frontend/app/globals.css` (tokens, glass classes, keyframes).
- Create: `frontend/components/DnaBackground.js`, `frontend/components/Reveal.js`.
- Modify: `frontend/app/layout.js` (mount background; keep metadata), `frontend/app/page.js` (split hero), `frontend/components/Navbar.js`.

## Verification
- `npm run vercel-build` stays green (10 routes).
- No console errors; sites render at 360 / 768 / 1280 widths.
- `prefers-reduced-motion` stops animation.
- Existing unit tests still pass.

## Review focus (things a user will hit)
- Long scientific titles must not overflow or collide with the helix.
- The DNA layer must never reduce text contrast (C15-adjacent readability).
- Pages other than the landing must not look half-migrated in P1 (either inherit tokens cleanly or get P2 first).
- Mobile: the split hero must stack cleanly.
- Reduced-motion and low-end devices must remain usable.
