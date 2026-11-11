# Pulls the newest images from GitHub (ghcr.io) and restarts only what changed.
# By hand:   powershell -ExecutionPolicy Bypass -File deploy\update.ps1
# Automatically every 10 minutes: see docs/windows-server.md, section 6.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$compose = @("compose", "-f", "docker-compose.server.yml")

git pull --ff-only --quiet          # new compose file and docs, if any
docker @compose pull --quiet
docker @compose up -d --remove-orphans
docker image prune -f | Out-Null    # old versions take disk space
"$(Get-Date -Format s) updated" | Out-File -Append -Encoding utf8 deploy\update.log
