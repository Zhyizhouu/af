# reAFresh

reAFresh is a React web app that hosts a shell of small programs behind one nav bar:

- Dashboard
- To-Do
- Checklists
- Calendar
- Habits
- Task Tracker
- Audio Converter
- AI
- QR Generator

Sign-in uses Firebase Auth, and each account's data syncs through Firestore under `users/{uid}`. Two programs need a server: the Audio Converter and the AI assistant talk to the Go backend in `backend/`.

## Layout

| Path | What |
| --- | --- |
| `frontend/` | The React app (Vite, TypeScript). See [frontend/README.md](frontend/README.md) for setup, structure and scripts. |
| `backend/` | The Go API, the converter worker and two small admin commands (`grant-admin`, `set-api-url`). |
| `docker-compose.yml` | The backend stack, plus the built frontend served by Caddy. |
| `docker/` | Caddy, SeaweedFS and Temporal configuration for the compose stack. |
| `dev-up.sh`, `dev-up.ps1` | Bring the stack up and open a public tunnel to it. |
| `firestore.rules`, `firebase.json` | Firestore security rules and their Firebase config. |
| `vercel.json` | Vercel build: `cd frontend && npm ci && npm run build`, served from `frontend/dist`. |

## Deployment

Vercel builds and serves `frontend/` and nothing else. The Go backend is not part of the Vercel build.

The frontend finds the API through `AF_CONVERT_API`, which is compiled in at build time, and it can also read the address from `config/runtime` in Firestore, which `dev-up` publishes so the deployed site follows a new tunnel without a redeploy.

## Audio Converter

The audio program is the one part of reAFresh that is not local. Conversion runs on a Go worker with ffmpeg, orchestrated by [Temporal](https://temporal.io), with [SeaweedFS](https://github.com/seaweedfs/seaweedfs) holding the bytes. All of it lives in `backend/` and `docker-compose.yml`.

Anything ffmpeg can decode goes in, including video, whose audio track is simply the only stream kept. Out comes **MP3, WAV, FLAC, M4A, OGG or Opus**. The format list is served from `GET /v1/limits` rather than written into the app, because which codecs exist is a property of the worker's ffmpeg build. Lossy formats take a bitrate; for the rest the control is hidden rather than shown doing nothing.

### What happens to the file you uploaded

It is deleted as soon as the conversion finishes, not when the result expires. The workflow drops it on every path out: converted, refused, failed or cancelled. Cleanup runs on a disconnected Temporal context, because a cancelled context refuses to schedule anything and cancellation is exactly when a half-finished source gets left behind. The delete retries without an attempt limit, so a storage outage postpones it instead of losing it. The converted file follows the same path when its lifetime is up. `backend/internal/convert/workflow_test.go` covers these exits against Temporal's test environment.

```
browser --upload--> api --> SeaweedFS (source)
                     |
                     +--start--> Temporal --task--> worker x2
                                                      | ffmpeg
                                                      v
browser <-download--- api <------------------- SeaweedFS (result)
```

### Running it

```bash
cp .env.example .env          # optional; every value has a working default
docker compose up --build
```

| Service | URL | What it is |
| --- | --- | --- |
| Web (Caddy) | http://localhost:3000 | the built React app, with `/v1/*` and `/healthz` proxied to the API |
| API | http://localhost:8080 | what the frontend talks to |
| Temporal UI | http://localhost:8089 | every workflow, its history and its retries |
| SeaweedFS | http://localhost:9333 | master status and volume browser |

The `web` service also listens on HTTPS port 8443 for the LAN address in `AF_LAN_HOST`, so the app can be opened from a phone on the same network. A `tunnel` service (Cloudflare quick tunnel to `web`) is available under the `tunnel` compose profile.

To run the frontend with the Vite dev server against the local API:

```bash
cd frontend
AF_CONVERT_API=http://localhost:8080 npm run dev
```

The API verifies the caller's Firebase ID token, so signing in has to work before a conversion will. To try the stack before the Firebase console work is finished, set `AF_AUTH_DISABLED=true` in `.env`. It is for localhost only: it accepts every request as one shared user.

### dev-up

`dev-up.sh` (bash, written for macOS) and `dev-up.ps1` (PowerShell) do the whole sequence and check each step: bring up every compose service, wait for `/healthz`, open a Cloudflare quick tunnel, confirm the tunnel reaches the API from outside, and publish the tunnel address to Firestore (`config/runtime`) using a service account. They refuse to open a tunnel to an API that is not enforcing auth. `--no-tunnel` (`-NoTunnel` in the PowerShell script) just brings the stack up for local work.

### Scaling

Workers poll one task queue and Temporal hands each task to exactly one of them, so the replica count is the concurrency:

```bash
docker compose up --scale worker=4
```

Keep `AF_WORKER_MAX_CONCURRENT=1`. ffmpeg saturates whatever cores it is given, so running several files inside one replica makes all of them slower.

## AI

Describe what you need scheduled and the assistant proposes entries. The Gemini call happens in the Go gateway: one synchronous endpoint (`POST /v1/ai/plan`), with no Temporal and no queue.

Two things stand between the model and the app:

- **A schema**, so the answer parses by construction rather than hopefully.
- **Normalisation**, because a schema constrains shape and never sense. `backend/internal/plan/normalise.go` sanity-checks the model's answer and `backend/internal/plan/normalise_test.go` covers the cases.

Setting it up needs one key, in the API's environment and never in the frontend bundle:

```bash
# .env
AF_GEMINI_API_KEY=...   # https://aistudio.google.com/apikey
```

Without it the page says so on arrival instead of offering a button that cannot work.
