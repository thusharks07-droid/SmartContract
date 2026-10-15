# smartBOB

smartBOB keeps Demo Mode, local scans, and Supabase Account Mode separate. Demo Mode uses illustrative sample records and never runs analysis. Local Scan runs real Slither analysis in an isolated Docker worker and stores results in local SQLite without authentication or Supabase. Supabase Account Mode remains available when configured and stores account-owned scans in Supabase.

## Run local real scans without Supabase

Use PowerShell from the repository root. Local mode requires Docker Desktop with Linux containers and Python 3.10+.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker info --format '{{.OSType}}' # must print linux
docker build -t contractiq-slither-worker:0.1.0 -f scanner-worker/Dockerfile scanner-worker
npm install
npm run dev
```

In a second terminal:

```powershell
python scanner-worker/server.py
```

The development homepage shows **Run a real local scan**. Local mode is enabled by `LOCAL_MODE=true` in `.env`, binds to localhost, and needs no Supabase service-role key. Scan records, source, and findings are stored in `.local-data/smartbob.sqlite3` and survive API restarts. Delete `.local-data` to remove them. These local records are not authenticated and are never sent to Supabase. Demo Mode stays illustrative and separate.

Useful checks:

```sh
npm run test
npm run lint
npm run build
npm run check:consistency
```

## Supabase configuration

For Supabase Account Mode, set `LOCAL_MODE=false` and configure the following browser-visible values in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`, preferred; or the legacy `VITE_SUPABASE_ANON_KEY`
- `VITE_CONTRACTIQ_API_URL` (defaults to `http://127.0.0.1:8765` in development)

Production builds require `VITE_CONTRACTIQ_API_URL` to be an HTTPS API origin; they do not fall back to localhost. See [DEPLOYMENT.md](DEPLOYMENT.md) and [deployment/README.md](deployment/README.md) for Vercel setup, the private API/reverse-proxy topology, exact CORS configuration, environment variables, and mobile verification steps.

These browser-visible values are public. RLS must protect every exposed table. `.env` is ignored by Git. Never put a Supabase personal access token (PAT), secret/service-role key, database password, or analyzer secret in source code or any `VITE_` variable. A PAT is an account-management credential and is not used by this application.

When configured, the account form uses Supabase Auth for email/password sign-in and signup. Passwords are passed only to Supabase Auth; smartBOB does not log or store them. Supabase manages its auth session. **Continue as Demo** is separate and stores only `{ "mode": "demo", "displayName": "Demo User" }` in tab-scoped `sessionStorage` under `contractiq.demo-session` (or in memory if storage is unavailable). Signing out clears that marker. Demo remains usable without Supabase.

Account mode obtains the current access token from the Supabase session and sends it to the authenticated API. The API validates it with Supabase Auth and derives the owner ID itself. Browser code never receives a service-role key. When `LOCAL_MODE=false`, the API requires `CONTRACTIQ_SUPABASE_URL`, `CONTRACTIQ_SUPABASE_ANON_KEY`, and server-only `CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY`. See [scanner-worker/README.md](scanner-worker/README.md) for setup and exact run commands.

Local Scan and Supabase Account Mode use distinct API routes and storage. Both accept one Solidity file up to 500,000 UTF-8 bytes without imports and one of the pinned compiler versions. Results appear only after the API reports `completed`. Demo pages continue to use seeded mock services and are never used as a fallback. Account history is read-only because no account scan-delete endpoint exists.

## SQL review and manual application

`supabase/contractiq_schema.proposed.sql` remains a proposal/reference only. This integration phase did not run SQL or modify the live schema. Account Mode reads and writes scan data through the authenticated Python API; the browser Supabase client is used for Auth, not direct scan inserts or deletes. Confirm the live schema, RLS policies, grants, and server-side service-role access separately before enabling real scans.

This local static-analysis worker runs Slither in an isolated Docker Linux container. It is not a complete audit, does not execute exploits, and does not guarantee detection of all vulnerabilities. A completed result with zero findings does not mean the contract is safe. Imports/dependency resolution, dynamic analysis, deployed bytecode analysis, and production deployment are out of scope.

## Routes and demo behavior

- `/` is the public product page.
- `/local-scan` is an unauthenticated local Docker scan workspace (shown from the homepage during development only).
- `/login` offers Supabase account sign-in/sign-up when configured and a separate **Continue as Demo** option.
- `/app/*` protects the dashboard and workspace. Supabase Account Mode shows account-backed records; Demo Mode shows only seeded mock records. A failure in one mode never falls back to another.
- The demo session is tab-scoped. Display and visual settings are stored separately by the existing settings service.

For local demo-only use, leave the Supabase variables unset. The login page shows the configuration status for account sign-in and keeps the separate demo entry available.
