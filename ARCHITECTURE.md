# Architecture

This document explains every layer of Pipeline Architect for engineers who know hardware or embedded
software well but are new to web development. Where it helps, each layer is mapped to a hardware analogy.

```
                       ┌──────────────── GitHub (main) ────────────────┐
                       │  git push → Cloudflare builds `npm run build`  │
                       └──────────────────────┬────────────────────────┘
                                              ▼
 Browser ──HTTPS──▶ Cloudflare edge: pipeline-architect.pages.dev  (or your custom domain)
  React SPA          ├─ static files from dist/  (HTML, JS, CSS)
                     └─ Pages Functions  /api/health, /api/simulate ──▶ shared/simulator.ts
  │
  ├──▶ Firebase Authentication  (Google sign-in popup → ID token kept by the SDK)
  └──▶ Cloud Firestore          users/{uid}/experiments/*  guarded by firestore.rules
```

## 1. Frontend: React + TypeScript + Vite + Tailwind (`src/`)

- **What it is:** a single-page application (SPA). The browser downloads one HTML file plus bundled
  JavaScript and CSS once. After that, navigation between views happens in the browser without reloading.
  Hash routes (`#/timeline`) work on any static host without server rewrite rules.
- **React** builds the UI from components: functions that turn state into markup. When state changes
  (for example the selected cycle), React re-renders only what changed. *Hardware analogy: a
  combinational function from state to display, re-evaluated when its inputs change.*
- **TypeScript** adds static types. The trace types in `shared/types.ts` are shared by the server and the
  UI, so a field renamed on one side fails compilation on the other.
- **Vite** is the dev server and bundler: hot reload in development, and minified, hashed and
  code-split assets in `dist/` for production. The Firebase SDK is loaded lazily (dynamic `import()`), so it
  doesn't slow the first paint.
- **Tailwind CSS** styles with utility classes. Design tokens (stage colours, dark palette) live in
  `src/index.css` under `@theme`.
- **State:** `src/state/SimulationContext.tsx` holds the lab configuration, the latest server result, the
  selected cycle, and playback state. `useSimulation` sends `POST /api/simulate` whenever the configuration
  changes, aborts outdated requests and exposes `loading` and `error`.
- **No client-side simulation.** The UI only renders the trace returned by the API. If the API is down the
  user sees an error. There is no silent fallback, so every number on screen comes from the backend.

## 2. Backend: Cloudflare Pages Functions (`functions/`)

- **What it is:** server-side code deployed together with the static site. A file at
  `functions/api/simulate.ts` automatically handles the URL `/api/simulate`. It runs on Cloudflare's
  **Workers runtime** (V8 isolates at the edge, not containers or VMs), starts in milliseconds and
  scales automatically.
- **REST API:** resources are addressed by URL and manipulated with HTTP methods. Requests and responses
  are JSON.
  - `GET /api/health` returns `{status:"ok", version, time, runtime}`.
  - `POST /api/simulate` accepts `{workloadId | instructions[], forwardingEnabled, clockPeriodNs}` and returns
    `{metrics, cycles[], instructions[], assumptions, finalRegisters, memory, architecturalCheck}`.
  - Errors: `400` invalid input (with a list of problems), `405` wrong method, `413` body > 16 KB, `415` not
    JSON, `422` runtime memory fault, `404` unknown `/api/*` path, `500` unexpected failure (no stack traces).
- **Thin adapters:** each Function is one line that calls a handler in `shared/api.ts`. The handlers use the
  standard Fetch API `Request`/`Response`, so Vitest calls them directly with no server, and the same code
  runs in Workers.
- **Validation** (`shared/validation.ts`) rejects unknown fields, wrong types, out-of-range clock periods,
  unknown workloads, programs longer than 32 instructions, and anything the parser rejects. *Hardware
  analogy: input assertions at a module boundary; never trust the testbench.*
- **Stateless:** the simulator is a pure function of its input. No database is involved in simulation.

## 3. Shared simulation engine (`shared/`)

`simulator.ts` advances a five-slot pipeline (each slot holds an instruction, a bubble, or nothing)
one clock at a time, in the order a real cycle resolves:

1. WB writes the register file (first half);
2. MEM performs loads and stores;
3. EX selects operands through the forwarding muxes and runs the ALU;
4. ID runs the hazard unit and reads the register file (second half, so it sees WB's write);
5. the clock edge advances every slot, or holds IF/ID and injects a bubble into EX on a stall.

Each cycle is recorded with stage contents, latch snapshots, forwarding selections, hazards, register and
memory activity, and English explanations. `reference.ts` executes the same program sequentially, and every
result is checked against it. The engine is covered by `tests/simulator.test.ts`.

## 4. Authentication: Firebase Authentication (`src/firebase/`)

- **What it is:** a hosted identity service. The app never sees or stores passwords. Google handles the
  login in a popup, and the Firebase SDK receives a short-lived signed **ID token** (a JWT) plus a refresh
  token, stores them in the browser (IndexedDB, "local persistence") and refreshes them automatically.
- **Flow:** *Sign in* → `signInWithPopup(GoogleAuthProvider)` → user picks an account → popup closes →
  `onAuthStateChanged` fires with the user → header shows the name.
- **Errors handled:** popup closed or cancelled (silently ignored), popup blocked, unauthorized domain,
  provider disabled, network errors.
- **Authorized domains:** Firebase only completes sign-in on domains listed in the console
  (localhost, `*.pages.dev` project domain, custom domain). See FIREBASE_SETUP.md.

## 5. Database: Cloud Firestore (`firestore.rules`)

- **What it is:** a NoSQL document database. Data is stored as documents (JSON-like maps) inside
  collections: `users/{uid}/experiments/{experimentId}`.
- **Direct from the browser:** the frontend talks to Firestore through the SDK. That is safe only because
  **security rules** run on Google's servers for every request:
  - only a signed-in user whose `uid` matches the path may read or write it;
  - documents must have exactly the six allowed fields with valid types and ranges, and bounded size;
  - `createdAt` must be the server's timestamp;
  - after creation only `name` may change;
  - list queries must use `limit ≤ 100`;
  - everything else is denied by default.
- **What is stored:** configuration only (workload, custom program, forwarding, clock period). Performance
  metrics are never stored or trusted. Reopening an experiment re-runs `/api/simulate`.
- *Hardware analogy: the rules are the MMU/MPU. The client is untrusted code; the rules decide which
  addresses it may touch.*

## 6. Hosting: Cloudflare Pages

- On every push to `main`, Cloudflare clones the repository, runs `npm run build`, uploads `dist/` to its
  CDN and deploys `functions/` as Workers. Other branches and pull requests get preview URLs.
- `public/_headers` sets security headers (CSP, `nosniff`, `X-Frame-Options`, referrer policy) and long
  cache lifetimes for content-hashed assets.
- HTTPS certificates are issued and renewed automatically.

## 7. Domain name and DNS

- Every project gets a free `https://<project>.pages.dev` address.
- A custom domain (for example `pipeline.example.com`) is optional. Adding it in Cloudflare Pages creates
  a DNS record (a CNAME to `<project>.pages.dev`, or managed automatically when the zone is on Cloudflare)
  and a certificate. The domain must then be added to Firebase's authorized domains.
- *Analogy: DNS is the address decoder that maps a human-readable name to the edge servers.*

## 8. Request lifecycle (end to end)

1. The browser resolves the domain (DNS) and opens an HTTPS connection to the nearest Cloudflare edge.
2. `GET /` returns `index.html` and hashed JS/CSS from the CDN cache.
3. React starts, reads the last configuration from `localStorage` and sends `POST /api/simulate`.
4. The Pages Function validates the body, runs the engine (a few ms) and returns JSON.
5. React renders the datapath, timeline and metrics from the JSON; playback only moves an index into
   `cycles[]`.
6. *Save*: the Firebase SDK sends the document plus the user's ID token to Firestore; the rules verify
   the token's `uid` and the schema before the write is accepted.

## 9. Testing layers

| Layer | Tool | Location |
| --- | --- | --- |
| Engine, parser, metrics | Vitest | `tests/*.test.ts` |
| REST API (handlers, validation, error codes) | Vitest | `tests/api.test.ts` |
| Security rules (isolation, schema) | Vitest + Firestore emulator | `tests/rules/` |
| Browser interactions | Playwright | `e2e/` |
| Sign-in + persistence | Playwright + Auth/Firestore emulators | `e2e-firebase/` |
| Static analysis | oxlint, `tsc -b` | `npm run lint`, `npm run typecheck` |
