# Workshop guide: "From pipeline hazards to a production web app" (60 minutes)

**Audience:** digital design, verification, embedded software and semiconductor engineers.
**Goal:** understand data hazards, forwarding and the CPI ↔ clock-period trade-off by experiment, and
see how a complete web application (frontend, backend, auth, database, hosting, domain) fits together.

**Setup (before the session):** deployed site open on the projector, a second tab with the repository,
participants with the URL on laptops or phones. Optional: a test Google account for the live sign-in.

| Time | Segment | Where |
| --- | --- | --- |
| 0:00 | Opening and the question | ▶ Present, scene 1 |
| 0:05 | Ideal pipeline | Scene 2, Cycle Timeline |
| 0:12 | Hazards and stalls | Scenes 3–4, Datapath Explorer |
| 0:20 | Forwarding | Scene 5, Hazard & Forwarding Analysis |
| 0:27 | Load-use hazards | Scene 6 |
| 0:32 | CPI vs clock period | Scene 7, Performance Lab |
| 0:38 | Optimization challenge (participants) | Scene 8 |
| 0:43 | How the app is built: frontend → API | Architecture page, DevTools |
| 0:50 | Auth, database, security rules | My Experiments, `firestore.rules` |
| 0:55 | Hosting, deployment and domain | DEPLOYMENT.md, Cloudflare dashboard |
| 0:58 | Wrap-up | |

---

## Part 1: Microarchitecture (0:00–0:43)

### 0:00 Opening (5 min)
Click **▶ Present** (full screen). In scene 1, ask *"Five instructions, five steps each, how many cycles
without pipelining?"* Let the room vote, then reveal: 25 versus the pipelined 9. Point out that the
answer is computed from the server's run, not from a slide.

### 0:05 Ideal pipeline (7 min)
Scene 2: predict, then reveal 9 cycles (N + 4). Step with → and watch the staircase form. Explain fill
(cycles 1–4) and drain. Ask: *"What is CPI for 5 instructions? For 1,000?"* (1.8 → approximately 1.004).

### 0:12 Hazards and stalls (8 min)
Scene 3 (`ADD R1…; SUB R4, R1…`, forwarding off): predict 2 stalls. Step to cycle 3:

- ID turns red. The hazard unit compares SUB's source R1 with ADD's destination in EX.
- **IF/ID · HOLD** and **PCWrite = 0**: fetch and decode freeze.
- A **bubble** enters ID/EX and drains through MEM and WB.
- Cycle 5: WB writes R1 in the first half and ID reads it in the second half.

Scene 4: the dependency chain takes 17 cycles, CPI 3.4. *"Where did the 8 extra cycles go?"*

### 0:20 Forwarding (7 min)
Scene 5: forwarding on, 0 stalls. Switch to **Hazard & Forwarding Analysis** (exit the presentation with
Esc) and walk through the dependency table: each RAW edge, its distance, and the path that resolved it
(EX/MEM→EX for distance 1, MEM/WB→EX for distance 2, register file for 3). Show the mux selection panel and
the *stale register-file value* the forwarding replaced. Verification angle: this is the same scoreboard
check you would write in a testbench.

### 0:27 Load-use (5 min)
Scene 6: even with forwarding, a load followed by a consumer stalls once. *"Why can't we forward?"* The
data does not exist until the end of MEM. Never forward a value before it exists.

### 0:32 CPI vs clock period (6 min)
Scene 7: forwarding on at 0.6 ns vs off at 0.5 ns. Predict which finishes first. Then open the
**Performance Lab**, try the presets and point at the *break-even clock period*. Look at the sweep table:
independent code gains nothing from forwarding, so a slower clock makes it strictly worse. Emphasize that
the clock periods are illustrative assumptions.

### 0:38 Optimization challenge (5 min, participants)
Scene 8: reorder the load-use program to reach 9 cycles with identical results. (Solution: hoist the second
load, giving `LW R1; LW R4; ADD R2; SUB R5; SW R5`.) The server confirms registers and memory match the
original. Connect this to compiler instruction scheduling.

---

## Part 2: Full-stack architecture (0:43–0:58)

### 0:43 Frontend → REST API (7 min)
Open **Architecture & Assumptions** and walk through the diagram. Then open browser DevTools →
**Network**, change the workload and show the `POST /api/simulate` request: JSON in, JSON trace out. Point out:

- The browser never simulates. Stop the backend (or use offline mode in DevTools) and the UI shows an error,
  not fake data.
- Validation: in the custom editor type `LW R1, 2(R0)` to get a 422 from the server. A malformed request
  gets a 400 with a list of problems.
- Show `functions/api/simulate.ts` (one line) → `shared/api.ts` → `shared/simulator.ts`, and the same engine
  tested in `tests/simulator.test.ts`.

```bash
curl https://<site>/api/health
```

### 0:50 Authentication and database (5 min)
Click **Sign in** (Google popup), then ☁ **Save** an experiment, open **My Experiments**, rename it and
reopen it. Reopening re-runs the server simulation; stored metrics are never trusted. Show
`firestore.rules`: `request.auth.uid == uid`, the exact field schema, deny-by-default. Mention the emulator
tests proving that user B can't read user A's data. *Analogy: the rules are the MPU; the browser is
untrusted code.*

### 0:55 Hosting, deployment, domain (3 min)
Show the GitHub repository and the Cloudflare Pages dashboard: push to `main` → build (`npm run build`) →
`dist/` on the CDN + `functions/` on Workers → HTTPS at `*.pages.dev`. A custom domain is a CNAME plus an
automatic certificate, and must be added to Firebase authorized domains.

### 0:58 Wrap-up (2 min)
- Pipelining improves throughput, not latency. Hazards cost cycles; forwarding removes most of them, but
  not load-use stalls.
- Judge designs by execution time = cycles × period, not by CPI alone.
- A real web app has separate layers (UI, API, identity, data, hosting, DNS), each with its own
  verification: unit tests, API tests, security-rules tests, browser tests.

## Facilitator checklist

- [ ] `https://<site>/api/health` returns `ok`
- [ ] Your domain is in Firebase authorized domains; a test sign-in works
- [ ] Projector resolution checked in presentation mode (F11 or ▶ Present)
- [ ] Keyboard: Space play/pause, ←/→ step, PageUp/PageDown change scene, Esc exit
