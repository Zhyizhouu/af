<#
.SYNOPSIS
  Deploys the reAFresh gateway to Cloud Run with the converter switched off.

.DESCRIPTION
  The converter needs Temporal and an object store; the assistant needs neither.
  This deploys the assistant half only — AF_CONVERTER_DISABLED=true — which is
  what makes it fit a host with no persistent disk and stay inside Cloud Run's
  perpetual free tier.

  The Gemini key goes through Secret Manager rather than --set-env-vars, so it
  never lands in your shell history or in the deploy command's audit log.

  Idempotent: safe to re-run to ship a new revision.

.EXAMPLE
  ./deploy-cloudrun.ps1 -ProjectId my-gcp-project -AllowedOrigins 'https://af.vercel.app'

.NOTES
  Needs gcloud (https://cloud.google.com/sdk/docs/install) and `gcloud auth login`
  once. Billing must be enabled on the project even to use the free tier.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,

  # Jakarta — the same region the Firestore database uses, so the two are not
  # a continent apart.
  [string]$Region = 'asia-southeast2',
  [string]$Service = 'reafresh-api',
  [string]$Repository = 'reafresh',

  # Which origins may call the API. The default covers Vercel previews but NOT
  # a custom domain — pass yours explicitly if you have one.
  [string]$AllowedOrigins = 'https://*.vercel.app',

  [string]$FirebaseProjectId = 'af-main',

  # Where to read AF_GEMINI_API_KEY from. Never echoed.
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env'),

  [string]$SecretName = 'af-gemini-api-key'
)

$ErrorActionPreference = 'Stop'

function Step($message) { Write-Host "`n=== $message ===" -ForegroundColor Cyan }

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is not installed. See https://cloud.google.com/sdk/docs/install"
}

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/api:$(Get-Date -Format 'yyyyMMdd-HHmmss')"

Step "Project and APIs"
gcloud config set project $ProjectId | Out-Null
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com

Step "Artifact Registry repository"
$exists = gcloud artifacts repositories describe $Repository --location $Region 2>$null
if (-not $?) {
  gcloud artifacts repositories create $Repository `
    --repository-format docker --location $Region `
    --description 'reAFresh container images'
} else {
  Write-Host "already exists"
}

Step "Gemini key -> Secret Manager"
if (-not (Test-Path $EnvFile)) { throw "No env file at $EnvFile" }
$key = (Get-Content $EnvFile |
  Where-Object { $_ -match '^\s*AF_GEMINI_API_KEY\s*=' } |
  ForEach-Object { ($_ -split '=', 2)[1].Trim() } |
  Select-Object -First 1)
if (-not $key) { throw "AF_GEMINI_API_KEY is not set in $EnvFile" }
Write-Host "read a key of length $($key.Length) from $EnvFile"

# A temp file rather than a pipe: gcloud reads the value from --data-file, and
# passing it inline would put the secret on a command line.
$tmp = New-TemporaryFile
try {
  # -NoNewline matters: a trailing newline becomes part of the secret and the
  # API rejects the key with a confusing 400.
  [IO.File]::WriteAllText($tmp.FullName, $key)

  $null = gcloud secrets describe $SecretName 2>$null
  if ($?) {
    gcloud secrets versions add $SecretName --data-file $tmp.FullName | Out-Null
    Write-Host "added a new version"
  } else {
    gcloud secrets create $SecretName --data-file $tmp.FullName --replication-policy automatic | Out-Null
    Write-Host "created $SecretName"
  }
} finally {
  Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
}

Step "Grant the runtime account access to the secret"
$projectNumber = (gcloud projects describe $ProjectId --format 'value(projectNumber)')
$runtimeAccount = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding $SecretName `
  --member "serviceAccount:$runtimeAccount" `
  --role roles/secretmanager.secretAccessor | Out-Null
Write-Host $runtimeAccount

Step "Build the image"
gcloud builds submit --config (Join-Path $PSScriptRoot 'cloudbuild.yaml') `
  --substitutions "_IMAGE=$image" $PSScriptRoot

Step "Deploy to Cloud Run"
# --allow-unauthenticated is right here: the gateway verifies a Firebase ID
# token itself on every route. Cloud Run's own IAM check would reject the
# browser before the app ever saw the token.
#
# --min-instances 0 is what keeps this free — it scales to zero when idle, and
# a Go binary cold-starts fast enough that nobody notices.
gcloud run deploy $Service `
  --image $image `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 4 `
  --memory 512Mi `
  --cpu 1 `
  --timeout 120 `
  --set-env-vars "AF_CONVERTER_DISABLED=true,AF_FIREBASE_PROJECT_ID=$FirebaseProjectId,AF_ALLOWED_ORIGINS=$AllowedOrigins" `
  --set-secrets "AF_GEMINI_API_KEY=${SecretName}:latest"

$url = (gcloud run services describe $Service --region $Region --format 'value(status.url)')

Write-Host "`nDeployed: $url" -ForegroundColor Green
Write-Host @"

Check it:
  curl $url/healthz

Then, in the Vercel dashboard (Settings -> Environment Variables):
  AF_CONVERT_API = $url
and redeploy so the value is baked into the bundle.

If you serve the app from a custom domain, re-run this with
  -AllowedOrigins 'https://your-domain.com'
or the browser's preflight will block every call.
"@
