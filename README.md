# Pipeline Architect — Interactive CPU Microarchitecture Laboratory

An interactive, deterministic simulator of a classic five-stage RISC pipeline (IF, ID, EX, MEM, WB),
built as a complete full-stack web application for digital-design, verification, embedded-software and
semiconductor engineers.

It has two goals:

1. **Make pipelining tangible.** Step cycle by cycle through an animated datapath, create
   read-after-write hazards, watch the hazard unit insert bubbles, switch forwarding on, and measure
   what it really buys you in *execution time*, not just CPI.
2. **Show a modern full-stack architecture end to end.** React frontend, REST API on Cloudflare
   Pages Functions, a shared TypeScript engine, Google sign-in with Firebase Authentication,
   Cloud Firestore persistence protected by security rules, Git-based deployment and a custom domain.

| Feature | Where |
| --- | --- |
| Animated datapath with latches, hazard unit and forwarding muxes | Datapath Explorer |
| Instruction × cycle matrix; click any cycle to inspect the full state | Cycle Timeline |
| Every RAW dependency and how it was resolved | Hazard & Forwarding Analysis |
| CPI vs clock period, execution time and throughput comparison | Performance Lab |
| Save / list / reopen / rename / delete experiments | My Experiments (Google sign-in) |
| Layered architecture, live API health, assumptions | Architecture & Assumptions |
| 8-scene guided lecture with predictions and a scheduling challenge | ▶ Present |

## Quick start

Requirements: Node.js 20+ (tested with 24 LTS). Java 11+ only for the Firebase emulators.

```bash
npm install
npm run dev          # Vite on http://localhost:5173 + Pages Functions (wrangler) on :8788
```

Open http://localhost:5173. The simulator works without any Firebase configuration; sign-in and
saving experiments are enabled once the `VITE_FIREBASE_*` variables are set (see
[FIREBASE_SETUP.md](FIREBASE_SETUP.md)).

| Command | What it does |
| --- | --- |
| `npm run dev` | Frontend with hot reload + the real Pages Functions API |
| `npm run preview` | Production build served by `wrangler pages dev dist` (closest to production) |
| `npm run build` | Type-check all projects and build to `dist/` |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` for app, functions and tests |
| `npm test` | Vitest: engine, parser, metrics and API tests |
| `npm run test:rules` | Firestore security-rules tests in the emulator (needs Java) |
| `npm run test:e2e` | Playwright browser tests (desktop + mobile) |
| `npm run test:e2e:firebase` | Sign-in, save, rename, reopen, delete and cross-user isolation in a real browser against the Firebase emulators (needs Java) |
| `npm run dev:emulators` | Firebase Auth + Firestore emulators for local sign-in testing |
| `npm run check` | lint + typecheck + unit tests + build |

## Repository layout

```
shared/            Simulation engine shared by the API and the tests
  types.ts           trace / metrics / instruction types
  isa.ts             ISA constants, ALU, address checks
  parser.ts          assembly parser for the 8-instruction subset (never executes input)
  simulator.ts       cycle-by-cycle 5-stage pipeline model
  reference.ts       sequential reference interpreter (architectural oracle)
  metrics.ts         CPI / IPC / time / frequency / throughput equations
  validation.ts      /api/simulate request validation
  api.ts             runtime-agnostic HTTP handlers (Fetch API Request/Response)
  workloads.ts       the four predefined workloads
functions/api/     Cloudflare Pages Functions: health.ts, simulate.ts, [[catchall]].ts
src/               React + TypeScript + Tailwind frontend
  views/             one file per page
  components/        datapath SVG, timeline matrix, controls, …
  presentation/      guided presentation mode and scenes
  firebase/          lazy-loaded Firebase client, auth context, experiment CRUD
tests/             Vitest unit/API tests; tests/rules = Firestore rules tests
e2e/               Playwright tests (UI, API errors, presentation)
e2e-firebase/      Playwright tests for Google sign-in + Firestore against the emulators
firestore.rules    Firestore security rules
public/_headers    Security headers and CSP for Cloudflare Pages
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): every layer explained for engineers new to web development
- [SIMULATION_ASSUMPTIONS.md](SIMULATION_ASSUMPTIONS.md): the precise machine model and ISA semantics
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md): Google sign-in, Firestore, rules, emulators
- [DEPLOYMENT.md](DEPLOYMENT.md): GitHub → Cloudflare Pages, environment variables, domains
- [WORKSHOP_GUIDE.md](WORKSHOP_GUIDE.md): a 60-minute walkthrough of the whole stack

## Cost

Everything runs on free tiers: Cloudflare Pages (static hosting + Functions), Firebase Spark plan
(Authentication + Firestore), GitHub. A custom domain is optional and is the only thing that costs money
(typically about $10–15 per year); the free `*.pages.dev` address works without one.
