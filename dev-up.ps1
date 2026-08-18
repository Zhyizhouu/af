<#
.SYNOPSIS
  Brings the backend up and opens a public tunnel to it.

.DESCRIPTION
  The recurring chore this exists to kill: every time the machine sleeps, the
  stateful containers stay down while `api` and `worker` come back on their
  restart policy and crash-loop, and the quick tunnel dies with its terminal.
  Both failures are quiet — `docker ps` looks fine, and the deployed site just
  says the assistant is unreachable.

  So this does the whole sequence and *checks* each step rather than assuming:

    1. brings up every service, not just the ones that restart themselves
    2. waits for the API to actually answer /healthz
    3. opens a Cloudflare quick tunnel
    4. proves the tunnel reaches the API from outside
    5. publishes the address to Firestore, so the deployed app follows it
       without a rebuild or a redeploy
    6. prints the URL and whatever is left to do

  Leave this window open. The tunnel lives as long as this script does; Ctrl+C
  stops it cleanly.

.PARAMETER NoTunnel
  Just bring the stack up. For working locally, where the browser can reach
  localhost directly and no tunnel is needed.

.EXAMPLE
  ./dev-up.ps1
  ./dev-up.ps1 -NoTunnel
#>
[CmdletBinding()]
param(
  [switch]$NoTunnel,

  # Skip publishing the URL to Firestore. Without this the script tells the
  # deployed app where the gateway moved to, which is the whole point of it.
  [switch]$NoPublish,

  [int]$Port = 8080,
  [string]$Cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe',

  # Service account for the Firestore write. Reading `config/runtime` needs
  # nothing; writing it is refused to every client by firestore.rules.
  # Left empty here and resolved below, because a process variable is only half
  # the story.
  [string]$Credentials
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot

function Step($n, $message) { Write-Host "`n[$n] $message" -ForegroundColor Cyan }
function Ok($message)       { Write-Host "    $message" -ForegroundColor Green }
function Warn($message)     { Write-Host "    $message" -ForegroundColor Yellow }

<#
  Windows PowerShell 5.1 wraps every line a native command writes to stderr in
  an ErrorRecord. Under ErrorActionPreference = 'Stop' that turns ordinary
  docker progress output — "Container reafresh-api-1 Running" — into a
  terminating error. Native calls run with the preference relaxed; their exit
  codes are checked explicitly instead.
#>
function Invoke-Native([scriptblock]$block) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $block } finally { $ErrorActionPreference = $previous }
}

<#
  Finds the service account.

  A terminal opened before GOOGLE_APPLICATION_CREDENTIALS was set does not have
  it, and that is not a state worth failing on: the value is in the registry,
  so read it from there rather than telling somebody to restart their shell and
  try again. Checked in order of specificity - an explicitly passed path always
  wins.
#>
function Resolve-Credentials([string]$explicit) {
  foreach ($candidate in @(
      $explicit,
      $env:GOOGLE_APPLICATION_CREDENTIALS,
      [Environment]::GetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'User'),
      [Environment]::GetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'Machine'))) {
    if ($candidate) { return $candidate }
  }
  return $null
}

# ---- 1. the whole stack ----------------------------------------------------

Step 1 'Docker stack'

# $LASTEXITCODE rather than $? — this is a native command, and $? after a
# try/catch around one reports the pipeline, not docker's exit code.
Invoke-Native { docker info 2>$null | Out-Null }
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is not running. Start Docker Desktop and try again.'
}

# `up -d` on everything, deliberately. Only api and worker carry
# restart: unless-stopped, so after a sleep those two are Up and crash-looping
# while Postgres, Temporal and SeaweedFS are simply gone — and `docker ps`
# shows two healthy-looking containers that cannot work.
#
# 2>$null because compose writes its progress to stderr; the ps table below
# says the same thing more usefully.
Push-Location $repo
try {
  Invoke-Native { docker compose up -d 2>$null | Out-Null }
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }
  Invoke-Native { docker compose ps --format "table {{.Name}}`t{{.Status}}" }
} finally { Pop-Location }

# ---- 2. does it actually answer? -------------------------------------------

Step 2 "API on :$Port"

$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Milliseconds 800 }
}

if (-not $healthy) {
  Write-Host "`n    The API is not answering. Recent log:" -ForegroundColor Red
  Push-Location $repo
  try { Invoke-Native { docker compose logs api --tail 20 } } finally { Pop-Location }
  throw "No response from http://127.0.0.1:$Port/healthz"
}
Ok 'healthz 200'

# A tunnel puts this on the public internet, so refuse to open one for an API
# that accepts everybody. AF_AUTH_DISABLED is a localhost-only convenience.
$tokenless = try {
  (Invoke-WebRequest "http://127.0.0.1:$Port/v1/ai/limits" -UseBasicParsing -TimeoutSec 5).StatusCode
} catch { $_.Exception.Response.StatusCode.value__ }

if ($tokenless -eq 401) {
  Ok 'auth enforced (tokenless request rejected)'
} else {
  Warn "a tokenless request returned $tokenless, expected 401 - is AF_AUTH_DISABLED set?"
  if (-not $NoTunnel) {
    throw 'Refusing to open a public tunnel to an API that is not checking tokens.'
  }
}

if ($NoTunnel) {
  Write-Host "`nStack is up. For the frontend:" -ForegroundColor Green
  Write-Host "  `$env:AF_CONVERT_API = 'http://localhost:$Port'"
  Write-Host "  npm run dev --prefix frontend"
  return
}

# ---- 3. the tunnel ---------------------------------------------------------

Step 3 'Cloudflare tunnel'

if (-not (Test-Path $Cloudflared)) {
  throw "cloudflared not found at $Cloudflared. Install with: winget install --id Cloudflare.cloudflared"
}

# A stale one holds no useful URL — its hostname died with whatever closed it.
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  Warn "stopping a stale cloudflared (pid $($_.Id))"
  Stop-Process -Id $_.Id -Force
}

$log = Join-Path $env:TEMP "af-tunnel-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$proc = Start-Process -FilePath $Cloudflared `
  -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port") `
  -RedirectStandardError $log -RedirectStandardOutput "$log.out" `
  -NoNewWindow -PassThru

try {
  # cloudflared writes the banner to stderr, and the hostname appears a few
  # seconds after the process starts.
  # An assigned hostname is several dash-separated words. `api` is the endpoint
  # cloudflared POSTs to in order to request one, and it appears in the log
  # whether that request succeeds or fails - matching it once produced a run
  # that announced a tunnel, published the address, and had no tunnel at all.
  $hostnamePattern = 'https://(?!api\.)[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com'

  $url = $null
  $failure = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 800
    if (Test-Path $log) {
      $match = Select-String -Path $log -Pattern $hostnamePattern | Select-Object -First 1
      if ($match) { $url = $match.Matches[0].Value; break }

      # cloudflared says so plainly when it cannot get one; surface that rather
      # than waiting out the full minute for a hostname that is not coming.
      $failure = Select-String -Path $log -Pattern 'failed to request quick Tunnel|Cannot determine default origin certificate|error' |
        Select-Object -First 1
      if ($failure) { break }
    }
    if ($proc.HasExited) { break }
  }

  if (-not $url) {
    Write-Host "`n    No tunnel was created." -ForegroundColor Red
    if ($failure) { Write-Host "    $($failure.Line.Trim())" -ForegroundColor Red }
    Write-Host "`n    Log tail:" -ForegroundColor Red
    if (Test-Path $log) { Get-Content $log -Tail 15 }
    Write-Host @"

    A timeout reaching api.trycloudflare.com usually means the network is
    blocking cloudflared - this one already refuses outbound 7844 to one
    region. Try again; if it keeps failing, --protocol http2 sometimes gets
    through where QUIC does not.
"@ -ForegroundColor Yellow
    throw 'cloudflared did not produce a tunnel hostname.'
  }
  Ok $url

  # ---- 4. prove it reaches the API from outside ----------------------------

  Step 4 'Checking the tunnel from outside'

  # Not $host — that is an automatic variable holding the PowerShell host.
  $tunnelHost = ([uri]$url).Host

  # Wait before the first lookup. Querying a hostname seconds after it is
  # created is how a resolver ends up caching "does not exist", and some
  # routers hold that negative answer far longer than the tunnel lives. This
  # check used to cause the very failure it then reported.
  Start-Sleep -Seconds 6

  # Ask a public resolver whether the record exists at all. Without this, "your
  # DNS refuses the name" and "the tunnel is not serving" look identical.
  $publicDns = $null
  for ($i = 0; $i -lt 12; $i++) {
    try {
      $publicDns = (Resolve-DnsName $tunnelHost -Server 1.1.1.1 -Type A -ErrorAction Stop |
        Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress
    } catch { }
    if ($publicDns) { break }
    Start-Sleep -Seconds 2
  }
  if ($publicDns) { Ok "public DNS: $publicDns" } else { Warn 'not in public DNS yet' }

  $through = $null
  for ($i = 0; $i -lt 15; $i++) {
    try {
      $through = (Invoke-WebRequest "$url/healthz" -UseBasicParsing -TimeoutSec 8).StatusCode
      if ($through -eq 200) { break }
    } catch { Start-Sleep -Seconds 2 }
  }

  if ($through -eq 200) {
    Ok 'healthz 200 through the tunnel'
  } else {
    $localDns = $null
    try {
      $localDns = (Resolve-DnsName $tunnelHost -ErrorAction Stop | Select-Object -First 1).IPAddress
    } catch { }

    # The two failures need completely different fixes, so name which one it is.
    if ($publicDns -and -not $localDns) {
      Warn 'THIS MACHINE cannot resolve the hostname, but public DNS can.'
      Warn 'The tunnel is fine and other people can reach it - your resolver is'
      Warn 'refusing the name or has cached a negative answer. To fix it here:'
      Warn "  Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses 1.1.1.1,1.0.0.1"
      Warn '  ipconfig /flushdns'
    } else {
      Warn 'the tunnel is up but not serving yet - it can take a few more seconds'
    }
  }

  # ---- 5. tell the deployed app where it moved to -------------------------

  Step 5 'Publishing the address'

  $published = $false
  $account = Resolve-Credentials $Credentials

  # Publishing points the deployed app at this address for everybody. Refuse to
  # do that on a tunnel that has already died or never served - a wrong value
  # here breaks the live site until somebody notices, and it looks like the
  # gateway being down rather than like a bad publish.
  if (-not $NoPublish -and $proc.HasExited) {
    Warn 'cloudflared has exited - not publishing an address nothing is serving'
    $NoPublish = $true
  }
  if (-not $NoPublish -and $through -ne 200) {
    Warn 'the tunnel never answered from outside - not publishing it'
    Warn 're-run once it is serving, or pass -NoPublish to skip this deliberately'
    $NoPublish = $true
  }

  if ($NoPublish) {
    Warn 'skipped (-NoPublish)'
  } elseif (-not $account) {
    Warn 'no service account found in -Credentials, the environment, or the registry'
    Warn 'the deployed app will keep pointing at whatever it was built with'
  } elseif (-not (Test-Path $account)) {
    # The first real run failed on a one-character typo in the path. Say which
    # file is missing rather than reporting a generic credentials problem.
    Warn "service account not found on disk:"
    Warn "  $account"
    Warn 'GOOGLE_APPLICATION_CREDENTIALS points somewhere that does not exist.'
  } else {
    Push-Location (Join-Path $repo 'backend')
    try {
      Invoke-Native {
        go run ./cmd/set-api-url -url $url -credentials $account
      }
      if ($LASTEXITCODE -eq 0) { $published = $true } else { Warn 'publish failed - see above' }
    } finally { Pop-Location }
  }

  # ---- 6. what is left to do ----------------------------------------------

  $note = if ($published) {
    @"
The deployed app already knows. config/runtime carries this
address and the app reads it on load, so there is nothing to
set in Vercel and nothing to redeploy.
"@
  } else {
    @"
NOT published. Either set it by hand:

  Vercel -> Settings -> Environment Variables:
    AF_CONVERT_API = $url
  then REDEPLOY (the value is compiled in at build time)

or re-run with a service account so config/runtime carries it
and no redeploy is needed at all.
"@
  }

  Write-Host @"

----------------------------------------------------------------
  $url
----------------------------------------------------------------

$note
This hostname is new every run. That is what a quick tunnel is; a
named tunnel with your own domain is the fix if this gets old.

Leave this window open - the tunnel dies when this script does.
Ctrl+C to stop.
"@ -ForegroundColor Green

  # Wait-Process throws on a pid that has already exited, which turned a failed
  # tunnel into a confusing second error on the way out.
  if (-not $proc.HasExited) { Wait-Process -Id $proc.Id }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Write-Host "`nStopping the tunnel..." -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Tunnel log: $log" -ForegroundColor DarkGray
}
