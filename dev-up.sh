#!/usr/bin/env bash
#
# dev-up.sh - brings the backend up and opens a public tunnel to it (macOS)
#
# The recurring chore this kills: every time the machine sleeps, the stateful
# containers stay down while api/worker come back on their restart policy and
# crash-loop, and the quick tunnel dies with its terminal. Both failures are
# quiet - `docker ps` looks fine, and the deployed site just says the
# assistant is unreachable.
#
# So this does the whole sequence and checks each step rather than assuming:
#   1. brings up every service, not just the ones that restart themselves
#   2. waits for the API to actually answer /healthz
#   3. opens a Cloudflare quick tunnel
#   4. proves the tunnel reaches the API from outside
#   5. publishes the address to Firestore, so the deployed app follows it
#      without a rebuild or a redeploy
#   6. prints the URL and whatever is left to do
#
# Leave this window open. The tunnel lives as long as this script does;
# Ctrl+C stops it cleanly.
#
# Usage:
#   ./dev-up.sh [--no-tunnel] [--no-publish] [--port N] [--credentials PATH]
#
#   --no-tunnel          Just bring the stack up. For working locally, where
#                         the browser can reach localhost directly.
#   --no-publish         Skip publishing the URL to Firestore.
#   --port N             Port the API listens on (default 8080).
#   --credentials PATH   Service account JSON for the Firestore write. Falls
#                         back to $GOOGLE_APPLICATION_CREDENTIALS.
#   -h, --help           Show this help and exit.
#
# cloudflared is found via `command -v cloudflared`; override with the
# CLOUDFLARED env var if it is not on PATH.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: dev-up.sh [--no-tunnel] [--no-publish] [--port N] [--credentials PATH]

Brings the backend stack up and opens a Cloudflare quick tunnel to it.

  --no-tunnel          Just bring the stack up (for local dev only).
  --no-publish         Skip publishing the tunnel URL to Firestore.
  --port N             Port the API listens on (default 8080).
  --credentials PATH   Service account JSON for the Firestore write.
                        Falls back to $GOOGLE_APPLICATION_CREDENTIALS.
  -h, --help           Show this help and exit.

cloudflared is found via `command -v cloudflared`; override with the
CLOUDFLARED env var if it is not on PATH.

Leave the window open; the tunnel dies when this script does. Ctrl+C
stops it cleanly.
EOF
}

NO_TUNNEL=0
NO_PUBLISH=0
PORT=8080
CREDENTIALS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-tunnel) NO_TUNNEL=1; shift ;;
    --no-publish) NO_PUBLISH=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --credentials) CREDENTIALS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  CYAN="$(tput setaf 6)"
  GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"
  RED="$(tput setaf 1)"
  RESET="$(tput sgr0)"
else
  CYAN=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

step() { printf '\n%s[%s] %s%s\n' "$CYAN" "$1" "$2" "$RESET"; }
ok()   { printf '%s    %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '%s    %s%s\n' "$YELLOW" "$1" "$RESET"; }
err()  { printf '%s    %s%s\n' "$RED" "$1" "$RESET"; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

if [ -z "${LAN_IP:-}" ]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
  LAN_IP="${LAN_IP:-127.0.0.1}"
fi
export LAN_IP

AUTH_DISABLED="${AF_AUTH_DISABLED:-}"
if [ -z "$AUTH_DISABLED" ] && [ -f "$REPO/.env" ]; then
  AUTH_DISABLED="$(tr -d '\r' < "$REPO/.env" \
    | sed -n 's/^[[:space:]]*AF_AUTH_DISABLED[[:space:]]*=//p' | tail -n 1 \
    | sed -e 's/[[:space:]]#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")"
fi

case "$(printf '%s' "$AUTH_DISABLED" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    case "$LAN_IP" in
      127.*|localhost|::1) ;;
      *) printf '%sWARNING: Auth is disabled and the stack is reachable on your LAN at https://%s:8443%s\n' "$YELLOW" "$LAN_IP" "$RESET" >&2 ;;
    esac ;;
esac

# ---- 1. the whole stack ----------------------------------------------------

step 1 "Docker stack"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

# `up -d` on everything, deliberately. Only api and worker restart on their
# own, so after a sleep those two look Up and crash-looping while Postgres,
# Temporal and SeaweedFS are simply gone.
if ! COMPOSE_OUT="$(docker compose up -d 2>&1)"; then
  err "docker compose up said:"
  printf '%s\n' "$COMPOSE_OUT" | tail -n 25 | while IFS= read -r line; do err "$line"; done
  exit 1
fi
docker compose ps --format $'table {{.Name}}\t{{.Status}}' || true

# ---- 2. does it actually answer? -------------------------------------------

step 2 "API on :$PORT"

healthy=0
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
    healthy=1
    break
  fi
  sleep 0.8
  i=$((i + 1))
done

if [ "$healthy" -ne 1 ]; then
  err "The API is not answering. Recent log:"
  docker compose logs api --tail 20 || true
  echo "No response from http://127.0.0.1:$PORT/healthz" >&2
  exit 1
fi
ok "healthz 200"

# A tunnel puts this on the public internet, so refuse to open one for an API
# that accepts everybody. AF_AUTH_DISABLED is a localhost-only convenience.
status="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT/v1/ai/limits" 2>/dev/null || echo '000')"

if [ "$status" = "401" ]; then
  ok "auth enforced (tokenless request rejected)"
else
  warn "a tokenless request returned $status, expected 401 - is AF_AUTH_DISABLED set?"
  if [ "$NO_TUNNEL" -ne 1 ]; then
    echo "Refusing to open a public tunnel to an API that is not checking tokens." >&2
    exit 1
  fi
fi

if [ "$NO_TUNNEL" -eq 1 ]; then
  printf '\n%sStack is up. For the frontend:%s\n' "$GREEN" "$RESET"
  echo "  export AF_CONVERT_API=http://localhost:$PORT"
  echo "  npm run dev --prefix frontend"
  exit 0
fi

# ---- 3. the tunnel ---------------------------------------------------------

step 3 "Cloudflare tunnel"

if [ -n "${CLOUDFLARED:-}" ]; then
  CLOUDFLARED_BIN="$CLOUDFLARED"
else
  CLOUDFLARED_BIN="$(command -v cloudflared || true)"
fi

if [ -z "$CLOUDFLARED_BIN" ] || ! command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1; then
  echo "cloudflared not found. Install it from https://github.com/cloudflare/cloudflared/releases" >&2
  exit 1
fi

# A stale one holds no useful URL - its hostname died with whatever closed it.
STALE_PIDS="$(pgrep -x cloudflared || true)"
if [ -n "$STALE_PIDS" ]; then
  for pid in $STALE_PIDS; do
    warn "stopping a stale cloudflared (pid $pid)"
  done
  pkill -x cloudflared || true
  sleep 0.5
fi

LOG="${TMPDIR:-/tmp}/af-tunnel-$(date +%Y%m%d-%H%M%S).log"
"$CLOUDFLARED_BIN" tunnel --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!

CLEANED_UP=0
cleanup() {
  if [ "$CLEANED_UP" -eq 1 ]; then
    return
  fi
  CLEANED_UP=1
  if [ -n "${TUNNEL_PID:-}" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    warn "Stopping the tunnel..."
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [ -n "${LOG:-}" ]; then
    echo "Tunnel log: $LOG"
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# cloudflared writes the banner to stderr, and the hostname appears a few
# seconds after the process starts. `api` is the endpoint cloudflared POSTs
# to in order to request a hostname, and it appears in the log whether that
# request succeeds or fails, so it is excluded explicitly rather than trusted
# to never match.
HOSTNAME_REGEX='https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com'
FAILURE_REGEX='failed to request quick Tunnel|Cannot determine default origin certificate|error'

url=""
failure_line=""
i=0
while [ "$i" -lt 60 ]; do
  sleep 0.8
  if [ -f "$LOG" ]; then
    match="$(grep -oE "$HOSTNAME_REGEX" "$LOG" 2>/dev/null | grep -v '^https://api\.' | head -n 1 || true)"
    if [ -n "$match" ]; then
      url="$match"
      break
    fi
    failure_line="$(grep -E "$FAILURE_REGEX" "$LOG" 2>/dev/null | head -n 1 || true)"
    if [ -n "$failure_line" ]; then
      break
    fi
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
done

if [ -z "$url" ]; then
  err "No tunnel was created."
  if [ -n "$failure_line" ]; then
    err "$failure_line"
  fi
  err "Log tail:"
  if [ -f "$LOG" ]; then
    tail -n 15 "$LOG" || true
  fi
  warn ""
  warn "A timeout reaching api.trycloudflare.com usually means the network is"
  warn "blocking cloudflared - this one already refuses outbound 7844 to one"
  warn "region. Try again; if it keeps failing, --protocol http2 sometimes gets"
  warn "through where QUIC does not."
  exit 1
fi
ok "$url"

# ---- 4. prove it reaches the API from outside ------------------------------

step 4 "Checking the tunnel from outside"

tunnel_host="$(printf '%s' "$url" | sed -E 's#^https?://##; s#/.*##')"

# Wait before the first lookup. Querying a hostname seconds after it is
# created is how a resolver ends up caching "does not exist", and some
# routers hold that negative answer far longer than the tunnel lives.
sleep 6

# Ask a public resolver whether the record exists at all. Without this, "your
# DNS refuses the name" and "the tunnel is not serving" look identical.
public_dns=""
i=0
while [ "$i" -lt 12 ]; do
  public_dns="$(dig +short @1.1.1.1 A "$tunnel_host" 2>/dev/null | grep -E '^[0-9]+\.' | head -n 1 || true)"
  if [ -n "$public_dns" ]; then
    break
  fi
  sleep 2
  i=$((i + 1))
done
if [ -n "$public_dns" ]; then
  ok "public DNS: $public_dns"
else
  warn "not in public DNS yet"
fi

through=""
i=0
while [ "$i" -lt 15 ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 "$url/healthz" 2>/dev/null || echo '000')"
  if [ "$code" = "200" ]; then
    through="200"
    break
  fi
  sleep 2
  i=$((i + 1))
done

if [ "$through" = "200" ]; then
  ok "healthz 200 through the tunnel"
else
  local_dns="$(dscacheutil -q host -a name "$tunnel_host" 2>/dev/null | grep -E '^ip_address' | head -n 1 | awk '{print $2}' || true)"
  if [ -z "$local_dns" ]; then
    local_dns="$(dig +short "$tunnel_host" 2>/dev/null | grep -E '^[0-9]+\.' | head -n 1 || true)"
  fi

  # The two failures need completely different fixes, so name which one it is.
  if [ -n "$public_dns" ] && [ -z "$local_dns" ]; then
    warn "THIS MACHINE cannot resolve the hostname, but public DNS can."
    warn "The tunnel is fine and other people can reach it - your resolver is"
    warn "refusing the name or has cached a negative answer. To fix it here:"
    warn "  sudo networksetup -setdnsservers Wi-Fi 1.1.1.1 1.0.0.1"
    warn "  sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
  else
    warn "the tunnel is up but not serving yet - it can take a few more seconds"
  fi
fi

# ---- 5. tell the deployed app where it moved to ----------------------------

step 5 "Publishing the address"

published=0
no_publish="$NO_PUBLISH"

# Publishing points the deployed app at this address for everybody. Refuse to
# do that on a tunnel that has already died or never served - a wrong value
# here breaks the live site until somebody notices.
if [ "$no_publish" -ne 1 ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
  warn "cloudflared has exited - not publishing an address nothing is serving"
  no_publish=1
fi
if [ "$no_publish" -ne 1 ] && [ "$through" != "200" ]; then
  warn "the tunnel never answered from outside - not publishing it"
  warn "re-run once it is serving, or pass --no-publish to skip this deliberately"
  no_publish=1
fi

account="$CREDENTIALS"
if [ -z "$account" ]; then
  account="${GOOGLE_APPLICATION_CREDENTIALS:-}"
fi

if [ "$no_publish" -eq 1 ]; then
  warn "skipped (--no-publish)"
elif [ -z "$account" ]; then
  warn "no service account found in --credentials or the environment"
  warn "the deployed app will keep pointing at whatever it was built with"
elif [ ! -f "$account" ]; then
  warn "service account not found on disk:"
  warn "  $account"
  warn "GOOGLE_APPLICATION_CREDENTIALS points somewhere that does not exist."
else
  if (cd "$REPO/backend" && go run ./cmd/set-api-url -url "$url" -credentials "$account"); then
    published=1
  else
    warn "publish failed - see above"
  fi
fi

# ---- 6. what is left to do --------------------------------------------------

if [ "$published" -eq 1 ]; then
  note="The deployed app already knows. config/runtime carries this
address and the app reads it on load, so there is nothing to
set in Vercel and nothing to redeploy."
else
  note="NOT published. Either set it by hand:

  Vercel -> Settings -> Environment Variables:
    AF_CONVERT_API = $url
  then REDEPLOY (the value is compiled in at build time)

or re-run with a service account so config/runtime carries it
and no redeploy is needed at all."
fi

printf '%s' "$GREEN"
cat <<EOF

----------------------------------------------------------------
  $url
----------------------------------------------------------------

$note
This hostname is new every run. That is what a quick tunnel is; a
named tunnel with your own domain is the fix if this gets old.

Leave this window open - the tunnel dies when this script does.
Ctrl+C to stop.
EOF
printf '%s' "$RESET"

if kill -0 "$TUNNEL_PID" 2>/dev/null; then
  wait "$TUNNEL_PID"
fi
