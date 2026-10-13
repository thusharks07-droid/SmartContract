# ContractIQ deployment guide

This repository contains a Vite frontend, a Python standard-library API/queue process, and a Docker-isolated Slither image. It contains no frontend-host, API-host, reverse-proxy, or production infrastructure configuration. Choose and provision those services manually; this guide does not deploy anything.

For the prepared Vercel frontend configuration and separate-host deployment checklist, see [`deployment/README.md`](deployment/README.md). The root [`vercel.json`](vercel.json) provides the SPA fallback for direct route navigation.

## Required topology

- Serve the built Vite site from a trusted static host over HTTPS.
- Run one `scanner-worker/server.py` process on a private Linux VM or private application network. It starts one queue consumer in-process and requires the Docker CLI plus the prebuilt worker image.
- Terminate TLS at a trusted HTTPS reverse proxy. If it shares the API host, keep the API on `127.0.0.1:8765`; proxy only `/api/` and `/health` to it. If the proxy is a separate service, bind the API to its private interface and allow ingress only from that proxy on `CONTRACTIQ_API_PORT`. Do not publish the Python API port or Docker socket to the public internet.
- Keep the worker image private to this backend host/network. Never expose a worker, Docker, claim-job, or result-write endpoint to the browser.
- Use a single API/queue process initially. Do not horizontally scale it without designing worker leases, per-host Docker availability, and transactional completion/persistence for the existing database workflow.

## Configuration

Use `deployment/frontend.env.example` and `deployment/backend.env.example` as placeholder-only references. The frontend values are configured in Vercel; the backend values are injected using the host's secret manager or process supervisor. Neither example file is loaded automatically by the app or `server.py`. Do not commit real `.env` files. The service-role key belongs only in the backend secret store.

Frontend build environment:

- `VITE_SUPABASE_URL`: HTTPS project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`, or existing supported `VITE_SUPABASE_ANON_KEY`: public browser key only.
- `VITE_CONTRACTIQ_API_URL`: HTTPS origin of the reverse proxy/API, for example `https://<your-api-host>` (no path suffix required). Production builds reject a non-HTTPS API URL and never default to localhost.

Backend process environment:

- `CONTRACTIQ_SUPABASE_URL`: HTTPS Supabase project URL.
- `CONTRACTIQ_SUPABASE_ANON_KEY`: public anon/publishable key used for Auth token validation.
- `CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY`: private service-role key, injected server-side only.
- `CONTRACTIQ_ALLOWED_ORIGINS`: comma-separated exact frontend origins, e.g. `https://<your-frontend-host>`; no wildcard, path, or trailing slash. HTTP is accepted only for localhost development. The default remains the existing localhost dev origins.
- `CONTRACTIQ_API_BIND_HOST`: defaults to `127.0.0.1`. Only use a private interface/`0.0.0.0` when the API is isolated behind a private network policy and trusted TLS proxy.
- `CONTRACTIQ_API_PORT`: defaults to `8765`.
- `CONTRACTIQ_API_MAX_CONCURRENCY`: defaults to `16`, valid range `1–128`; excess concurrent connections receive `503`.

Request bodies are capped at 516,000 bytes by the API; source text is capped at 500,000 UTF-8 bytes. The API socket read timeout is 15 seconds, Supabase upstream timeout is 10 seconds, and the frontend request timeout is 15 seconds. The queue worker processes one analyzer job at a time and analyzer execution is bounded by its existing timeout/retry policy. Configure the HTTPS proxy with a body limit no higher than 516,000 bytes, TLS-only access, per-client rate limiting (suggested starting point: 60 API requests/minute and 5 scan submissions/minute), and upstream timeouts compatible with the 15-second API request deadline. Do not trust caller-supplied forwarded-IP headers unless the proxy strips and replaces them.

## Manual deployment sequence

1. Confirm the live Supabase tables, columns, RLS, grants, and service-role behavior against the repository proposal. No SQL is applied by this guide.
2. Provision the private Linux backend host/network and HTTPS reverse proxy. Restrict API ingress to loopback or the proxy's private address; leave the Docker daemon socket inaccessible to the proxy and internet.
3. On the backend host, install the repository's supported Python runtime and Docker. From a clean checkout/build context, run the documented image build: `docker build -t contractiq-slither-worker:0.1.0 -f scanner-worker/Dockerfile scanner-worker`.
4. Inject the backend variables listed above from the host's secret manager. Set `CONTRACTIQ_ALLOWED_ORIGINS` to the exact HTTPS frontend origin. Keep the API bound to loopback when the reverse proxy is local.
5. Configure the proxy's HTTPS certificate, host routing, body limit, rate limits, request timeout, and `/api/` plus `/health` upstream routes. Do not route arbitrary paths to a Docker worker.
6. Build the frontend with the three Vite variables set in its build environment, especially `VITE_CONTRACTIQ_API_URL=https://<your-api-host>`, then publish only the generated `dist/` directory using the chosen static host.
7. Start `py scanner-worker/server.py` under the host's process supervisor. It starts the private queue consumer automatically; do not run a second copy of the same worker process until multi-worker operation has been explicitly designed and tested.

PowerShell local API startup remains documented in `scanner-worker/README.md`. For production, use the host's secret manager/service supervisor rather than committing or copying real secrets into either example file.

## Health and mobile verification

1. From a browser or command line, request `https://<your-api-host>/health`. Expect HTTP `200` with `{"status":"ok","service":"contractiq-local-api"}`. This is process liveness only; it does not validate Supabase or the queue.
2. In browser developer tools, verify the frontend was built with the HTTPS API origin and the API preflight for the exact frontend origin returns `204` with that origin—not `*`. A different origin must receive `403` without `Access-Control-Allow-Origin`.
3. Open the HTTPS frontend on a phone using cellular data (not the backend host's localhost). Sign in, refresh the page, and confirm Supabase restores the session. Sign out and confirm account pages require sign-in afterward.
4. Submit a small non-production Solidity fixture. Confirm a queued/running state is not called completed; wait for the backend-confirmed terminal state. A backend/network error must remain an error and must not open seeded Demo Mode data.
5. Repeat at a narrow viewport and inspect browser network/security panels: frontend/API requests use HTTPS, requests carry an account bearer token, responses do not contain service-role credentials, and the worker/Docker interface is not reachable from the phone.

No public deployment, DNS change, TLS provisioning, live Supabase check, or real scan is performed as part of this repository change. Live connectivity remains unverified until you complete these checks.
