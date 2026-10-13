# ContractIQ separate-host deployment

This folder contains deployment guidance only; it does not duplicate the app or scanner. The repository is a Vite + React frontend and a Python standard-library API that starts one persistent queue consumer in the same process. Slither runs in the existing Docker image. No live hosting, DNS, TLS, Supabase, or production scan has been configured or verified.

## Frontend on Vercel

1. Push the reviewed repository to GitHub, then import that repository in Vercel. Set the project root to the repository root (`.`). Select Vite if Vercel does not detect it automatically.
2. Use these build settings:
   - Install command: `npm ci`
   - Build command: `npm run build` (`tsc -b && vite build`)
   - Output directory: `dist`
3. Set these Vercel project environment variables for the intended Production/Preview environments:
   - `VITE_SUPABASE_URL`: the Supabase project HTTPS URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the browser-safe publishable key, or `VITE_SUPABASE_ANON_KEY` only if using the existing legacy fallback.
   - `VITE_CONTRACTIQ_API_URL`: the HTTPS origin of the deployed backend/reverse proxy. Use your actual URL; do not use localhost or the placeholder `https://<your-api-host>`.
4. Keep the root [`vercel.json`](../vercel.json), which rewrites direct SPA routes to `index.html`. After deploy, open `/login`, `/app`, `/app/new-scan`, and `/app/scans/<scanId>` directly or refresh them to verify fallback behavior.
5. Do not add `CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY`, database passwords, or any other server secret to Vercel frontend variables. All `VITE_` values are delivered to browser code; the Supabase publishable/anon key is intentionally public and must be protected by Supabase RLS.

Do not enter a fabricated API address. The production API URL is still a provider/domain decision and must be supplied after the backend is reachable over HTTPS. A production build with an empty/invalid or non-HTTPS API URL must not be treated as deploy-ready.

## Backend and scanner host

The current supported deployment shape is one long-running Python API process on a Docker-capable Linux VM/private application host. `scanner-worker/server.py` constructs the API and starts its queue-consumer thread together; there is no supported standalone queue-worker entry point or separate API/worker Dockerfile. Do not run the analyzer Dockerfile as the API image, and do not start a second `server.py` process as a “worker”. Vercel functions are not a replacement for this persistent queue consumer.

### Build and run

From the repository root on the backend host, with Docker and the documented Python runtime installed:

```sh
docker build -t contractiq-slither-worker:0.1.0 -f scanner-worker/Dockerfile scanner-worker
python3 scanner-worker/server.py
```

The first command builds the isolated analyzer image only. The second starts the API and queue consumer in one process and expects server environment variables to be injected before startup. Configure a process supervisor (for example, systemd or the host's equivalent) with automatic restart on failure, one instance only, and graceful stop/restart. Do not put credentials on the command line or in unit files committed to Git. Use the host secret manager/environment injection.

The backend process invokes the local Docker CLI to create analyzer containers, so Docker daemon access is a powerful server-side privilege. Keep this process on a dedicated, patched host; never expose the Docker socket/API publicly or mount it into a public reverse proxy. Do not make the API or worker claim/result endpoints public except through the authenticated API routes. The analyzer container keeps the repository's existing read-only filesystem, no-network, dropped-capability, and resource-limit controls; do not override them in deployment.

The analyzer's existing container limits are defined by `scanner-worker/worker.py` and may be inspected there before sizing. Reserve enough host memory/CPU for the API plus an analyzer container, and monitor disk space for Docker layers and logs. The queue currently processes one analyzer job at a time. Do not scale API instances horizontally without designing and testing leases, concurrency, Docker access, and atomic result persistence.

### Backend environment (server-side only)

Inject these values using the backend provider's secret/configuration facility. The placeholder-only template is [`backend.env.example`](backend.env.example); `server.py` does not load it automatically.

| Variable | Where | Use |
| --- | --- | --- |
| `CONTRACTIQ_SUPABASE_URL` | Backend secret/config | Supabase HTTPS project URL. |
| `CONTRACTIQ_SUPABASE_ANON_KEY` | Backend secret/config | Public anon/publishable key used by the existing Auth validation flow. |
| `CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY` | Backend secret store only | Private server-side database operations. Never expose or log it. |
| `CONTRACTIQ_ALLOWED_ORIGINS` | Backend config | Comma-separated exact HTTPS frontend origins; no wildcard, path, or trailing slash. |
| `CONTRACTIQ_API_BIND_HOST` | Backend config | Default `127.0.0.1` behind a same-host proxy. Bind to a private interface only when network ingress is restricted to the trusted proxy. |
| `CONTRACTIQ_API_PORT` | Backend config | Defaults to `8765`; allow only from the proxy/private network. |
| `CONTRACTIQ_API_MAX_CONCURRENCY` | Backend config | Defaults to `16`, range `1–128`. |

The API process itself does not terminate TLS. Put a trusted HTTPS reverse proxy/load balancer in front of it, forward only `/api/` and `/health`, cap request bodies at 516,000 bytes, set reasonable request/time limits, and rate-limit scan submissions. Keep health checks and logs free of credentials and contract source. The existing `GET /health` reports process liveness only, not Supabase or queue readiness.

### Frontend environment (Vercel build-time)

| Variable | Where | Use |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel frontend project | Supabase project URL; browser-visible. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel frontend project | Browser-safe publishable key. Existing legacy alternative: `VITE_SUPABASE_ANON_KEY`. |
| `VITE_CONTRACTIQ_API_URL` | Vercel frontend project | Actual HTTPS backend origin; must not be localhost in production. |

The frontend placeholder template is [`frontend.env.example`](frontend.env.example). Copy the variable names/values into Vercel's project settings after replacing every placeholder; Vercel does not load that file automatically.

Never place the service-role key or any backend-only value in Vercel, a `VITE_` variable, frontend bundle, or browser-accessible file.

## Supabase manual preparation

In Supabase Dashboard → Authentication → URL Configuration, set **Site URL** to the exact production frontend origin and add the exact production sign-in/redirect URL(s) used by this app to **Redirect URLs**. Add only known preview origins if preview sign-in is needed; avoid broad wildcards. Before enabling real scans, manually compare the live table columns, status constraints, grants, RLS policies, and service-role privileges with the repository's schema proposal and worker queries. No SQL or Supabase settings are changed by these instructions.

## Health check, rollout, and rollback

1. Verify the backend host has the pinned image: `docker image inspect contractiq-slither-worker:0.1.0`.
2. Request `https://<your-api-host>/health`; expect HTTP `200` and `{"status":"ok","service":"contractiq-local-api"}`. This is liveness only.
3. Check reverse-proxy logs and backend process logs for startup/health status. Do not enable request-body, authorization-header, token, or source-code logging.
4. Confirm CORS preflight succeeds for the exact deployed frontend origin and does not return `Access-Control-Allow-Origin: *`; an unlisted origin should be denied.
5. Deploy Vercel Preview first and verify direct route navigation, auth refresh/logout, and that a backend outage appears as an error—not Demo Mode. Promote only after manual review. Use a non-production fixture for any later real scan.
6. For rollback, use Vercel's deployment rollback to the last known-good frontend. On the backend, redeploy the last known-good reviewed Git revision and its matching analyzer image. Preserve logs needed for diagnosis without recording secrets or source. Do not roll back or alter database schema as part of an application rollback without a separately reviewed migration plan.

## Git review commands

The working tree may contain changes from earlier ContractIQ phases. Review them before staging; do not use `git add .` or commit real `.env` files. From the repository root:

```sh
git status --short
git diff --check
git diff
```

After deciding exactly which changes belong in this deployment commit, stage only those reviewed paths, inspect `git diff --cached`, then commit and push using your chosen branch/remote. No repository, remote, commit, or push is created by this guide.
