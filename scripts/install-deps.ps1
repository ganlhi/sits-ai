<#
.SYNOPSIS
  Install npm dependencies for a project that lives on a Google Drive (streaming) folder.

.DESCRIPTION
  npm's parallel tarball extraction corrupts files and fails with EBADF/ENOTEMPTY on Google
  Drive's virtual filesystem, and the filesystem rejects junctions/symlinks, so node_modules
  cannot simply be redirected elsewhere. This script installs into a staging folder on the local
  disk and mirrors node_modules back to the project single-threaded with retries.

  Also: the project path contains an emoji, which breaks the .cmd/.ps1 shims in node_modules/.bin.
  Run tools with node on a relative path instead, e.g.
      node .\node_modules\vitest\vitest.mjs run
  (npm scripts in package.json are written that way).

.PARAMETER Packages
  Optional extra packages to add (passed to `npm install`), e.g. -Packages "-D zod".
#>
param(
  [string] $Packages = ''
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$staging = Join-Path $env:USERPROFILE '.sits-ai\staging'

New-Item -ItemType Directory -Force $staging | Out-Null
Copy-Item (Join-Path $project 'package.json') (Join-Path $staging 'package.json') -Force
if (Test-Path (Join-Path $project 'package-lock.json')) {
  Copy-Item (Join-Path $project 'package-lock.json') (Join-Path $staging 'package-lock.json') -Force
}

Push-Location $staging
try {
  if ($Packages) {
    Invoke-Expression "npm install $Packages --no-audit --no-fund --loglevel=error"
  } else {
    npm install --no-audit --no-fund --loglevel=error
  }
  if ($LASTEXITCODE -ne 0) { throw "npm install failed in staging ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

Copy-Item (Join-Path $staging 'package.json') (Join-Path $project 'package.json') -Force
Copy-Item (Join-Path $staging 'package-lock.json') (Join-Path $project 'package-lock.json') -Force

# /MIR mirror, /MT:1 single thread, /R retries, /W seconds between retries, quiet-ish output
robocopy (Join-Path $staging 'node_modules') (Join-Path $project 'node_modules') /MIR /MT:1 /R:10 /W:2 /NFL /NDL /NJH /NP
$rc = $LASTEXITCODE
if ($rc -ge 8) { throw "robocopy failed with exit code $rc" }
Write-Host "Dependencies mirrored to $project\node_modules (robocopy code $rc)."
& cmd /c "exit 0"
