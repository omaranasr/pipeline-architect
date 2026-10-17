# Firebase setup (Authentication + Firestore)

The simulator works without Firebase. Firebase adds Google sign-in and saved experiments. Everything
below fits the free **Spark** plan; no billing account is required.

> These steps need **your** Google account. Nothing here was done automatically.

## 1. Create the project

1. Open https://console.firebase.google.com → **Add project** → name it (for example `pipeline-architect`).
2. Google Analytics is not needed; you can disable it.

## 2. Register a web app and copy its configuration

1. Project settings (gear icon) → **General** → *Your apps* → **Web** (`</>`) → register an app (no Firebase
   Hosting needed).
2. Copy the values from the `firebaseConfig` snippet into `.env.local` (copy from `.env.example`):

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_APP_ID=1:...:web:...
```

These web-config values are public identifiers that ship in the JavaScript bundle by design. Security comes
from Authentication and the Firestore rules. **Never** put a service-account JSON or private key into any
`VITE_*` variable or into the repository.

## 3. Enable Google sign-in

Build → **Authentication** → *Get started* → **Sign-in method** → **Google** → Enable → choose a support
e-mail → Save.

## 4. Authorized domains

Authentication → **Settings** → **Authorized domains**. Make sure the list contains:

- `localhost` (present by default; open the dev server as `http://localhost:5173`, not `127.0.0.1`)
- `<your-project>.pages.dev` (your Cloudflare Pages production address)
- your custom domain, if you add one (for example `pipeline.example.com`)

Preview deployments (`<hash>.<project>.pages.dev`) are separate hostnames. Add one explicitly if you
want to test sign-in on a preview. Otherwise the app shows *"This domain is not in the Firebase project's
Authorized Domains"*.

## 5. Create Firestore and deploy the rules

1. Build → **Firestore Database** → *Create database* → choose a location close to your users →
   start in **production mode** (deny all).
2. Deploy the repository's rules. Either paste `firestore.rules` into the console's **Rules** tab and
   publish, or use the CLI (already a dev dependency):

```bash
npx firebase login
npx firebase deploy --only firestore:rules --project <project-id>
```

No composite indexes are needed: the app orders a single collection by `createdAt`.

## 6. Run locally against the real project

```bash
npm run dev
```

Click **Sign in**, choose a Google account, then ☁ **Save** in the Datapath Explorer and open
**My Experiments**.

## Local development with the Emulator Suite (no real project)

The emulators need Java 11+ (`java -version`).

```bash
npm run dev:emulators          # Auth on :9099, Firestore on :8080, UI on http://127.0.0.1:4000
```

In `.env.local` set `VITE_USE_FIREBASE_EMULATORS=true` (the other variables may stay empty), then run
`npm run dev`. The Google popup is replaced by the emulator's fake-account screen, and the header shows an
"emulator" badge.

## Security-rules tests

```bash
npm run test:rules
```

Starts the Firestore emulator, loads `firestore.rules` and runs `tests/rules/firestore.rules.test.ts`.
The tests prove that:

- signed-out users can do nothing;
- user B can't read, list, create, update or delete user A's experiments;
- unbounded queries, unknown fields, client-supplied metrics, wrong types, out-of-range clock periods,
  oversized programs and client-chosen timestamps are rejected;
- after creation only the name can change;
- every path outside `users/{uid}/experiments` is denied.

## Browser tests for sign-in and persistence

```bash
npm run test:e2e:firebase
```

Starts the Auth and Firestore emulators plus an emulator-mode Vite instance on port 5174, then uses
Playwright to: sign in through the emulator's Google popup; save an experiment; list, rename and
reload (auth and data persist); reopen it (the saved parameters are re-simulated by `/api/simulate`);
delete it; sign out; confirm a second user sees none of the first user's experiments; and confirm that
closing the popup is handled without an error.

On Windows, if `java` isn't found right after installing a JDK, open a new terminal so the updated
`PATH` is picked up.

## Data model

`users/{uid}/experiments/{experimentId}`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | 1–80 characters |
| `workloadId` | string | `independent`, `dependent-alu`, `load-use`, `stress` or `custom` |
| `customInstructions` | string \| null | newline-separated, parser-normalised program (≤ 2080 chars) for `custom`; otherwise `null` |
| `forwardingEnabled` | boolean | |
| `clockPeriodNs` | number | 0.1–100 |
| `createdAt` | timestamp | `serverTimestamp()`; enforced `== request.time` |

No passwords, tokens or metrics are stored. Reopening an experiment always re-simulates on the server.
