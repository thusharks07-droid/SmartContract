# ContractIQ

ContractIQ has two isolated workspaces. Continue as Demo uses a deterministic frontend dataset; its findings and reports are illustrative and no analysis runs. Signed-in account mode can submit a single Solidity source file to the local Docker-isolated Slither worker through the authenticated local API. This is static analysis and does not guarantee detection of all vulnerabilities.

## Run locally

```sh
npm install
npm run dev
```

Useful checks:

```sh
npm run test
npm run lint
npm run build
npm run check:consistency
```

## Supabase configuration

Copy `.env.example` to `.env.local` and configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`, preferred; or the legacy `VITE_SUPABASE_ANON_KEY`
- `VITE_CONTRACTIQ_API_URL` (defaults to `http://127.0.0.1:8765` in development)

Production builds require `VITE_CONTRACTIQ_API_URL` to be an HTTPS API origin; they do not fall back to localhost. See [DEPLOYMENT.md](DEPLOYMENT.md) and [deployment/README.md](deployment/README.md) for Vercel setup, the private API/reverse-proxy topology, exact CORS configuration, environment variables, and mobile verification steps.

These browser-visible values are public. RLS must protect every exposed table. `.env.local` is ignored by Git. Never put a Supabase personal access token (PAT), secret/service-role key, database password, or analyzer secret in source code or any `VITE_` variable. A PAT is an account-management credential and is not used by this application.

When configured, the account form uses Supabase Auth for email/password sign-in and signup. Passwords are passed only to Supabase Auth; ContractIQ does not log or store them. Supabase manages its auth session. **Continue as Demo** is separate and stores only `{ "mode": "demo", "displayName": "Demo User" }` in tab-scoped `sessionStorage` under `contractiq.demo-session` (or in memory if storage is unavailable). Signing out clears that marker. Demo remains usable without Supabase.

Account mode obtains the current access token from the Supabase session and sends it to the authenticated local API. The API validates it with Supabase Auth and derives the owner ID itself. Browser code never receives a service-role key. The local API and worker require `CONTRACTIQ_SUPABASE_URL`, `CONTRACTIQ_SUPABASE_ANON_KEY`, and server-only `CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY`; see [scanner-worker/README.md](scanner-worker/README.md) for setup and exact run commands. Starting that server performs live Auth/PostgREST requests; these automated tests do not.

Account scan pages use the local API for submissions, scan history, details, findings, and reports. The API accepts one Solidity file up to 500,000 UTF-8 bytes without imports and one of the pinned compiler versions. Reports appear only after the API reports `completed`. The existing demo pages still use their seeded mock services and are never used as an account-mode fallback. The current account history is read-only because no scan-delete endpoint exists.

## SQL review and manual application

`supabase/contractiq_schema.proposed.sql` remains a proposal/reference only. This integration phase did not run SQL or modify the live schema. The API expects the `contractiq_scans` and `contractiq_findings` columns described in `database.types.ts`; confirm the live schema and policies separately before using it. Browser clients cannot write findings or update scan outcomes through the API.

This local static-analysis worker runs Slither in an isolated Docker Linux container. It is not a complete audit, does not execute exploits, and does not guarantee detection of all vulnerabilities. A completed result with zero findings does not mean the contract is safe. Imports/dependency resolution, dynamic analysis, deployed bytecode analysis, and production deployment are out of scope.

## Routes and demo behavior

- `/` is the public product page.
- `/login` offers Supabase account sign-in/sign-up when configured and a separate **Continue as Demo** option.
- `/app/*` protects the dashboard and scan workflows. Account mode shows API-backed records; demo mode shows only seeded/local mock records. A failure in one mode never falls back to the other.
- The demo session is tab-scoped. Display and visual settings are stored separately by the existing settings service.

For local demo-only use, leave the Supabase variables unset. The login page shows the configuration status for account sign-in and keeps the separate demo entry available.
