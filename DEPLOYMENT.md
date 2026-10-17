# Deployment: GitHub → Cloudflare Pages

Target: a public HTTPS site at `https://<project>.pages.dev` with the REST API at `/api/*`, deployed
automatically on every push to `main`. Everything here is free. **Purchasing a domain is optional** and is
the only step that costs money.

> These steps use your GitHub, Cloudflare and Firebase accounts. None of them have been performed for you.

## 0. Before you deploy

```bash
npm run check        # lint + typecheck + unit tests + production build
npm run test:e2e     # optional: browser tests against the local stack
npm run preview      # optional: serve dist/ + Functions exactly like Pages does
```

## 1. Create the GitHub repository and push

1. github.com → **New repository** → `pipeline-architect` (public or private; both work with Cloudflare).
   Do not add a README or .gitignore; the project already has them.
2. From the project folder:

```bash
git add .
git commit -m "Pipeline Architect: initial version"
git remote add origin https://github.com/<you>/pipeline-architect.git
git push -u origin main
```

`.env`, `.env.local`, `.wrangler/`, `dist/` and `node_modules/` are git-ignored. Check that no secrets
are staged with `git status` before committing.

## 2. Connect Cloudflare Pages to the repository

1. dash.cloudflare.com (free account) → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → authorize GitHub → select `pipeline-architect`.
2. Build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (repository root; `functions/` must be at the root) |

3. **Environment variables** (Settings → Environment variables, set for *Production* and *Preview*):

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `VITE_FIREBASE_API_KEY` | from Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `<project-id>` |
| `VITE_FIREBASE_APP_ID` | from Firebase web config |

   `VITE_*` values are compiled into the frontend bundle at build time, so changing them requires a new
   deployment (Deployments → ⋯ → Retry deployment). Do not set `VITE_USE_FIREBASE_EMULATORS` in production.

4. **Save and Deploy.** Cloudflare installs dependencies, runs the build, publishes `dist/` and deploys
   `functions/` as Pages Functions. `wrangler.toml` supplies the project name, output directory and
   compatibility date.

## 3. Verify the production deployment

```bash
curl https://<project>.pages.dev/api/health
curl -X POST https://<project>.pages.dev/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"workloadId":"dependent-alu","forwardingEnabled":true,"clockPeriodNs":0.5}'
```

Expected: `{"status":"ok",...,"runtime":"Cloudflare-Workers"}` and a JSON trace with
`"totalCycles":9`. Then open the site, check the Architecture page's *Live API status*, and run the
presentation.

## 4. HTTPS

`*.pages.dev` and custom domains get certificates automatically; HTTP redirects to HTTPS. No action needed.

## 5. Firebase authorized domains

Add `<project>.pages.dev` (and any custom domain) under Firebase → Authentication → Settings →
**Authorized domains**, otherwise Google sign-in fails with `auth/unauthorized-domain`. Deploy
`firestore.rules` if you have not yet (see FIREBASE_SETUP.md).

## 6. Optional: custom domain

You need a domain you own. Buying one is a paid step; do it only if you want one.

- **Domain managed by Cloudflare DNS:** Pages project → **Custom domains** → *Set up a custom domain* →
  enter `pipeline.example.com` → Cloudflare creates the DNS record and certificate.
- **Domain at another registrar or DNS host:** add the custom domain in Pages first, then create the record
  it shows at your DNS provider, typically
  `CNAME  pipeline  →  <project>.pages.dev` (TTL auto). An apex/root domain usually requires moving the
  zone to Cloudflare, or using your provider's ALIAS/ANAME support.
- Wait for the status to become **Active** (DNS propagation is usually minutes, at most 24–48 h).
- Add the custom domain to Firebase authorized domains.

## 7. Day-to-day workflow

- Push to `main` → production deployment.
- Push another branch or open a pull request → preview deployment at `https://<branch>.<project>.pages.dev`.
- Roll back: Pages → Deployments → choose an earlier deployment → *Rollback*.

## 8. Free-tier notes

Cloudflare Pages Free includes unlimited static requests and a daily request quota for Functions (shared
with Workers Free). Firebase Spark includes free Authentication and a daily Firestore read/write quota.
Both are far above what a workshop needs. Neither requires a credit card.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| UI shows *API returned a non-JSON response* | `functions/` not deployed: check the root directory is `/` |
| `/api/simulate` returns the HTML page | Same as above |
| *Sign-in not configured* in the header | `VITE_FIREBASE_*` missing at build time; set them and redeploy |
| `auth/unauthorized-domain` | Add the hostname in Firebase authorized domains |
| Saving fails with *Permission denied* | Rules not deployed, or the document doesn't match the schema |
| Build fails with a Node error | Set `NODE_VERSION=24` |
