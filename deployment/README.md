# smartBOB separate-host deployment

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

### Build and verify the analyzer image

Build from the reviewed release commit. The Dockerfile pins the base image by digest, Slither to `0.11.6`, and each bundled Solidity compiler by SHA-256. Keep the analyzer image private to this host.

```sh
docker build --pull -t contractiq-slither-worker:0.1.0 -f scanner-worker/Dockerfile scanner-worker
docker image inspect contractiq-slither-worker:0.1.0 --format 'ID={{.Id}} USER={{.Config.User}} ENTRYPOINT={{json .Config.Entrypoint}}'
docker run --rm --pull=never --network=none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true --pids-limit=128 --memory=1g --memory-swap=1g --cpus=1.0 \
  --user=10001:10001 --tmpfs /tmp:rw,noexec,nosuid,size=256m,uid=10001,gid=10001 \
  --tmpfs /home/scanner/.solc-select:rw,noexec,nosuid,size=16m,uid=10001,gid=10001 \
  --entrypoint slither contractiq-slither-worker:0.1.0 --version
SMARTBOB_RUN_SLITHER_INTEGRATION=1 python3 -m unittest discover -s scanner-worker/tests -p 'test_analyzer_integration.py' -v
```

Image inspection should report user `10001:10001` and the analyzer entrypoint. Slither should report version `0.11.6`; the integration suite runs controlled vulnerable and fixed fixtures in the same no-network Docker container used by account scans. Save the resulting image ID with the release record. Debian package repository snapshots and Python transitive dependencies are not fully lockfile-pinned, so builds are not byte-for-byte reproducible yet.

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
| `GROQ_API_KEY` | Backend secret store only | Primary AI explanation provider key. Never use a `VITE_` name. |
| `GEMINI_API_KEY` | Backend secret store only | Automatic fallback AI explanation provider key. Never use a `VITE_` name. |
| `SMARTBOB_AI_PRIMARY_PROVIDER` | Backend config | `groq` by default; may be `gemini`. |
| `SMARTBOB_AI_FALLBACK_PROVIDER` | Backend config | `gemini` by default; must differ from the primary. |
| `GROQ_MODEL` / `GEMINI_MODEL` | Backend config | Optional documented model ID overrides. Current defaults are Groq `openai/gpt-oss-120b` and Gemini `gemini-2.5-flash`. |
| `SMARTBOB_AI_TIMEOUT_SECONDS` | Backend config | Per-provider timeout, bounded to 2–12 seconds; default `10`. |

The API process itself does not terminate TLS. Put a trusted HTTPS reverse proxy/load balancer in front of it, forward only `/api/` and `/health`, cap request bodies at 3,016,000 bytes, set at least a 30-second timeout for authenticated AI requests, and configure a shared rate limiter for horizontally scaled instances. The API applies per-process limits of 30 scan submissions and 10 AI explanations per account per minute, plus two concurrent AI requests. It rejects decoded source over 500,000 UTF-8 bytes. Keep health checks and logs free of credentials and contract source. The existing `GET /health` reports process liveness only, not Supabase or queue readiness.

### Frontend environment (Vercel build-time)

| Variable | Where | Use |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel frontend project | Supabase project URL; browser-visible. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel frontend project | Browser-safe publishable key. Existing legacy alternative: `VITE_SUPABASE_ANON_KEY`. |
| `VITE_CONTRACTIQ_API_URL` | Vercel frontend project | Actual HTTPS backend origin; must not be localhost in production. |

The frontend placeholder template is [`frontend.env.example`](frontend.env.example). Copy the variable names/values into Vercel's project settings after replacing every placeholder; Vercel does not load that file automatically.

Never place the service-role key, Groq/Gemini keys, or any backend-only value in Vercel, a `VITE_` variable, frontend bundle, or browser-accessible file.

## Supabase manual preparation

In Supabase Dashboard → Authentication → URL Configuration, set **Site URL** to the exact production frontend origin and add that exact origin to **Redirect URLs**. The app does not pass a custom `emailRedirectTo`; Supabase confirmation links therefore use the configured Site URL. Add only known preview origins if preview sign-in is needed; avoid broad wildcards. Before enabling real scans, compare the live table columns, constraints, indexes, RLS policies, and effective grants with the repository's schema proposal and worker queries. The API gateway needs `service_role` access to select/insert/update scans and select/insert/delete findings; revoke unneeded table grants, including all access to profiles, scan delete, and finding update. Authenticated browser roles should have no direct scan insert/delete grant; scan submissions go through the Python API. Confirm that the tables are reachable through the Supabase Data API for the server role used by the gateway. No SQL or Supabase settings are changed by these instructions.

## Health check, rollout, and rollback

1. Verify the built image ID, non-root user, and Slither version using the commands in **Build and verify the analyzer image** below.
2. Request `https://<your-api-host>/health`; expect HTTP `200` and `{"status":"ok","service":"contractiq-local-api"}`. This is liveness only.
3. From an HTTP client, send an `OPTIONS` preflight to `/api/scans` with `Origin` set to the exact deployed frontend origin and request headers `authorization,content-type,idempotency-key`. Expect `204` and that exact `Access-Control-Allow-Origin`; repeat with an unlisted origin and confirm it receives `403` without an allow-origin header.
4. Check reverse-proxy logs and backend process logs for startup/health status. Do not enable request-body, authorization-header, token, or source-code logging.
5. Deploy Vercel Preview first and verify direct route navigation, auth refresh/logout, and that a backend outage appears as an error—not Demo Mode. Promote only after manual review.
6. For the authenticated end-to-end smoke test, sign in to Preview with a dedicated test account and submit a small controlled Solidity fixture through the app. Use a non-production contract and an HTTP client that keeps the account access token private. Confirm the API returns a queued scan ID, then poll that scan through the authenticated scan API until the backend reports `completed` or a safe terminal error. For a completed scan, fetch its findings and owned source through the authenticated read routes; confirm the scan appears after page reload and a fresh sign-in, status is backend-reported, source hash is stable, and finding IDs/locations/evidence are persisted. A queued/running response is not completion, and an empty findings list is a valid result. Never use a customer contract as a smoke fixture.
7. For rollback, use Vercel's deployment rollback to the last known-good frontend. On the backend, redeploy the last known-good reviewed Git revision and its matching analyzer image. Preserve logs needed for diagnosis without recording secrets or source. Do not roll back or alter database schema as part of an application rollback without a separately reviewed migration plan.

## Git review commands

The working tree may contain changes from earlier smartBOB phases. Review them before staging; do not use `git add .` or commit real `.env` files. From the repository root:

```sh
git status --short
git diff --check
git diff
```

After deciding exactly which changes belong in this deployment commit, stage only those reviewed paths, inspect `git diff --cached`, then commit and push using your chosen branch/remote. No repository, remote, commit, or push is created by this guide.
