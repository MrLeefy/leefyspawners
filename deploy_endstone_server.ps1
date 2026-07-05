# Local Endstone Server Deployment and Restart Script
$ServerPath = "C:\Users\baseb\Desktop\Projects\test-dev-server-for-endstone-bedrock"
$ServerBehaviorDest = Join-Path $ServerPath "bedrock_server\development_behavior_packs\JUN06LeefySpawners BEH"
$ServerResourceDest = Join-Path $ServerPath "bedrock_server\development_resource_packs\JUN06LeefySpawners RES"
$WorldPath = Join-Path $ServerPath "bedrock_server\worlds\Bedrock level"

# 1. Run TypeScript build
Write-Host "Building TypeScript..." -ForegroundColor Cyan
npm run build

# 1b. Run Obfuscation
Write-Host "Obfuscating bundled code..." -ForegroundColor Cyan
node obfuscate.js

# 2. Deploy to local Endstone server folders only
Write-Host "Deploying addon to local Endstone server folders..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $ServerBehaviorDest) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $ServerResourceDest) | Out-Null
$ServerResourcePacksDest = Join-Path $ServerPath "bedrock_server\resource_packs\JUN06LeefySpawners RES"
New-Item -ItemType Directory -Force -Path (Split-Path $ServerResourcePacksDest) | Out-Null

Remove-Item -Path $ServerBehaviorDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ServerResourceDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ServerResourcePacksDest -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item -Path ".\JUN06LeefySpawners BEH" -Destination (Split-Path $ServerBehaviorDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ServerResourceDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ServerResourcePacksDest) -Recurse -Force

# Delete old packs from server dev folders to prevent duplicate package loads
Remove-Item -Path (Join-Path $ServerPath "bedrock_server\development_behavior_packs\OCT30LeefySpawners BEH") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $ServerPath "bedrock_server\development_resource_packs\OCT30LeefySpawners RES") -Recurse -Force -ErrorAction SilentlyContinue

# 3. Register packs in the active server world configuration
Write-Host "Ensuring addon packs are registered in server world configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $WorldPath | Out-Null

$behManifest = Get-Content -Path "JUN06LeefySpawners BEH/manifest.json" -Raw | ConvertFrom-Json
$resManifest = Get-Content -Path "JUN06LeefySpawners RES/manifest.json" -Raw | ConvertFrom-Json

$behUuid = $behManifest.header.uuid
$behVerArray = $behManifest.header.version
$resUuid = $resManifest.header.uuid
$resVerArray = $resManifest.header.version

$behPackFile = Join-Path $WorldPath "world_behavior_packs.json"
python "C:\Users\baseb\.gemini\antigravity\brain\0b21b149-5c39-4f9e-9b9d-d9e85560816c\scratch\register_pack.py" $behPackFile $behUuid ($behVerArray -join '.')

$resPackFile = Join-Path $WorldPath "world_resource_packs.json"
python "C:\Users\baseb\.gemini\antigravity\brain\0b21b149-5c39-4f9e-9b9d-d9e85560816c\scratch\register_pack.py" $resPackFile $resUuid ($resVerArray -join '.')

# 4. Restart Endstone Bedrock server
Write-Host "Restarting Endstone Bedrock Server..." -ForegroundColor Cyan
Stop-Process -Name "bedrock_server" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "endstone" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process -FilePath "C:\Users\baseb\Desktop\Projects\test-dev-server-for-endstone-bedrock\.venv\Scripts\endstone.exe" -ArgumentList "-s bedrock_server" -WorkingDirectory $ServerPath

Write-Host "==================================================" -ForegroundColor Green
Write-Host "ENDSTONE SERVER DEPLOYMENT COMPLETE & RESTARTED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
