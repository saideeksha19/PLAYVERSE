# PLAYVERSE — Play Together. Anywhere.

A premium, browser-based multiplayer party game for 2–8 players. No login, no install:
open a link and play **Color Clash** and **Memory Mix** across five rounds.

> **Status: Phases 1–5 complete and verified.** See [PLAN.md](PLAN.md) for the audit, architecture and roadmap. Color Clash and Memory Mix are both playable end to end by 2–8 players in a five-round alternating match.

## Repository layout

| Path | Package | Purpose |
| --- | --- | --- |
| `shared/` | `@playverse/shared` | Types, constants and the Socket.IO event contract shared by client and server |
| `client/` | `@playverse/client` | React 19 + Vite + Tailwind + Three.js/React Three Fiber UI |
| `server/` | `@playverse/server` | Express + Socket.IO authoritative game server |
| `e2e/` | — | Playwright browser tests |

## Commands

```bash
npm install          # install all workspaces
npm run dev          # server (:3001) + client (:5173) with hot reload
npm run typecheck    # strict tsc across every workspace
npm test             # Vitest unit + Socket.IO integration tests
npm run build        # production client bundle + server bundle
npm run verify       # typecheck && test && build
npm run test:e2e     # Playwright browser smoke tests (chromium)
```

## Design tokens

Sky blue `#52B8FF` · deep ocean `#102A56` · cosmic navy `#101C3B` · portal purple `#7658F5` ·
energy yellow `#FFD447` · forest green `#39C985` · coral red `#FF6B68` · soft white `#F7FAFF`

## Current verification

- `npm run verify` (typecheck + unit/integration tests + production build) — **passes** (exit code 0).
- Client tests: **110 / 110 passed**. Server tests: **56 / 56 passed**.
- Playwright E2E (complete suite: `e2e/home.spec.ts e2e/phase2.spec.ts e2e/phase3.spec.ts e2e/phase4.spec.ts`, 44 tests across Chromium desktop/mobile, Firefox desktop, WebKit desktop): **32 passed, 0 failed, 12 skipped**. The 12 skips are expected — the two-context multiplayer tests (phase 3 lobby + phase 4 full match/reload-rejoin) run once on `chromium-desktop` by design.
- E2E environment note: external Google Fonts requests (`fonts.googleapis.com` / `fonts.gstatic.com`) are mocked **only** in E2E (specific routes) so tests remain deterministic without global `ERR_NAME_NOT_RESOLVED` suppression; application resource failures remain visible. On machines with limited `C:` space, Playwright artifacts can be redirected (e.g. `--output=/d/playverse-e2e-test-results`) and the project `screenshots/` output directory can be junctioned to another drive; source code is unchanged.

### Running PLAYVERSE locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`. The API and WebSocket server run on `:3001` and the Vite dev server proxies `/api` and `/socket.io`.

### Launching on this machine

Latest build artifact: `dist/index.html` + `dist/assets/`. Serve it with the production preview: `cd client && npx vite preview` (port 4173 by default), or run the full stack with the workspace root `npm run dev`.

Defined once in `client/src/styles/global.css` (`@theme`) and used everywhere.
