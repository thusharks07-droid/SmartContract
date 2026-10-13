# ContractIQ local scanner API and worker

This is a local-only backend foundation. The React account workspace now calls these endpoints; the separate demo workspace continues to use its seeded mock data. Account/demo separation remains explicit: this API accepts only a verified Supabase account bearer token, never a simulated demo session.

## Architecture and trust boundary

- `server.py` binds only to `127.0.0.1` and starts the authenticated API plus one private queue-consumer thread.
- Every protected request validates its Supabase access token by asking Supabase Auth for the current user. The API takes the owner UUID only from that verified response; request `user_id` fields are rejected.
- `contractiq_scans` is the durable queue. Existing `queued`, `running`, `completed`, and `failed` states plus `started_at`, `completed_at`, `options`, `summary`, and error columns are used. The server submits a queued row with an owner-scoped deterministic UUID derived from the `Idempotency-Key`. Repeating the same key and payload returns the same record; reusing it for different content returns a conflict.
- The background worker claims a row with a conditional `queued → running` update, executes the existing Docker-isolated Slither runner, and writes findings and completion metadata using a server-only service-role credential. It permits two total attempts (one retry), uses a 180-second analyzer timeout with stale-lease recovery, and keeps provider/compiler details out of API errors.
- There is no HTTP route to claim a job, write findings, submit results, or change scan status. The service-role key is read only from the backend process environment and is never compiled into Vite or returned to callers.
- The reviewed `supabase/contractiq_schema.proposed.sql` already contains the columns and RLS/grants needed by this implementation. No migration or SQL execution is included. The API relies on those protections remaining in place; this code does not verify the live project's schema or policies.

## Prerequisites

- Windows with Docker Desktop using Linux containers.
- Python 3.10 or later on the host.
- The analyzer image built as described below.
- A server-only Supabase service-role key available locally. Do not use a personal access token, database password, or Vite variable for this value. Do not paste it into source files or commit it.

## Build and test

Run from the ContractIQ repository root in PowerShell:

```powershell
docker info --format '{{.OSType}}' # must print: linux
docker build -t contractiq-slither-worker:0.1.0 -f scanner-worker/Dockerfile scanner-worker
py -3 -m unittest discover -s scanner-worker/tests -v
```

The API/queue unit tests use fake Auth, storage, and analyzer components. They make no request to Supabase and do not run SQL. Worker-container integration can still be tested separately with the fixture commands near the end of this file.

## Run the local API and queue worker

Set these process environment variables in PowerShell. Obtain the project URL and public anon/publishable key from the existing local configuration. Obtain the service-role key from the Supabase project dashboard and keep it server-side. This code does not read `.env.local` and does not print any values.

```powershell
$env:CONTRACTIQ_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:CONTRACTIQ_SUPABASE_ANON_KEY = "<public-anon-or-publishable-key>"
$env:CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY = "<server-only-service-role-key>"
$env:CONTRACTIQ_API_PORT = "8765"
py -3 scanner-worker/server.py
```

The server starts polling the Supabase queue as soon as it runs. It binds to loopback and stops with Ctrl+C. `CONTRACTIQ_API_PORT` is optional and defaults to `8765`. Starting it makes live Supabase Auth and PostgREST requests; this implementation phase and its tests did not start the server or connect to the live project.

## API contract

Protected routes require `Authorization: Bearer <current Supabase access token>`. The token is validated with Supabase Auth on each request.

### `POST /api/scans`

Required header: `Idempotency-Key: <UUID>`.

Example JSON body:

```json
{
  "contractName": "Vault",
  "sourceFilename": "Vault.sol",
  "sourceCode": "pragma solidity 0.8.24; contract Vault {}",
  "inputType": "paste",
  "compilerVersion": "0.8.24",
  "notes": "Optional context"
}
```

`user_id`, status, findings, summary, engine, and result fields are not accepted from callers. Source is limited to one UTF-8 Solidity file, 500,000 bytes, with no imports. The API returns `202` for a new queued record and `200` for an idempotent replay.

### Read routes

- `GET /api/scans` lists the verified user's scans.
- `GET /api/scans/{scanId}` reads one scan owned by that user.
- `GET /api/scans/{scanId}/findings` reads findings only after verifying scan ownership.
- `GET /api/scans/{scanId}/source` returns the source and filename only after verifying scan ownership. This endpoint supports account scan details after a page refresh; full source remains excluded from scan list/detail JSON.
- `GET /health` returns local process health without account data.

There are intentionally no caller-accessible result, claim, update, or cancellation routes. Errors are JSON with stable codes and do not include source code, access tokens, service-role values, or raw provider diagnostics.

## Existing isolated scan CLI

The host worker still supports direct local fixture scans:

```powershell
py -3 scanner-worker/worker.py scan --source scanner-worker/tests/fixtures/reentrancy.sol --compiler-version 0.8.24
py -3 scanner-worker/worker.py scan --source scanner-worker/tests/fixtures/simple-counter.sol --compiler-version 0.8.24
```

The first fixture is intentionally vulnerable and is expected to produce Slither findings. The second is a minimal control fixture; zero detector findings do not prove safety. Supported pinned compilers are `0.8.24`, `0.8.23`, `0.8.22`, and `0.8.19`. The Docker image checks official Solidity binary SHA-256 hashes during its build. Analysis is static and does not provide a completeness or safety guarantee.

## Frontend integration and remaining limitations

- In account mode, the React app submits source, reads account-owned scans/findings/source, polls queued/running scan status, times out API requests after 15 seconds, and gates report display on a completed worker result. The demo workspace continues to use deterministic mock data and is not used as a fallback when account API requests fail.
- Set the public browser URL with `VITE_CONTRACTIQ_API_URL` in `.env.local`; local development defaults to `http://127.0.0.1:8765`. This variable is an API address only, never a credential. Existing Supabase browser configuration remains public project URL/publishable key only.
- The account UI supports read-only history because the current API deliberately has no scan deletion endpoint. It does not submit client analysis options because the worker contract currently accepts source metadata and a pinned compiler only.
- The current API does not return detailed compiler diagnostics. Analyzer failures are presented as incomplete without exposing raw compiler output.
- The service-role credential must be supplied locally before the API can be started. Live auth, database permissions, real queued scan persistence, RLS behavior, and the complete API-to-worker path remain unverified here.
- The API uses the existing proposal's `options` JSON for retry/idempotency metadata. If the live schema or policies differ from the proposal, stop and review a schema change before connecting the UI.
- Queue completion writes findings and then updates the scan row through PostgREST calls; PostgREST does not make those separate requests a single transaction. A production multi-worker deployment should add a database transaction/RPC or equivalent transactional outbox before being considered robust.
- The worker accepts one file without imports. It does not resolve dependencies, scan archives, run formal verification, inspect deployed bytecode, or guarantee vulnerability coverage.
- The Slither version, Solidity compiler versions, and base Python image are pinned; Python transitive dependencies and Debian package repository snapshots are not lockfile-pinned yet.
- Supabase service-role access bypasses RLS. Every account-facing server query is explicitly scoped by the owner ID returned by Auth; the service role is never sent to the browser.

