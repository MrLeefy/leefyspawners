# Minecraft Solo Client Local Development Build & Deploy
$MinecraftPath = "C:\Users\baseb\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang"
$BehaviorDest = Join-Path $MinecraftPath "development_behavior_packs\JUN06LeefySpawners BEH"
$ResourceDest = Join-Path $MinecraftPath "development_resource_packs\JUN06LeefySpawners RES"

# 1. Run TypeScript build
Write-Host "Building TypeScript..." -ForegroundColor Cyan
npm run build

# 2. Deploy to local Minecraft client dev folders only
Write-Host "Deploying addon to local Minecraft client dev folders..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $BehaviorDest) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $ResourceDest) | Out-Null

# Clean up existing dev folders
Remove-Item -Path $BehaviorDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ResourceDest -Recurse -Force -ErrorAction SilentlyContinue

# Copy the fresh built files
Copy-Item -Path ".\JUN06LeefySpawners BEH" -Destination (Split-Path $BehaviorDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ResourceDest) -Recurse -Force

Write-Host "==================================================" -ForegroundColor Green
Write-Host "SOLO CLIENT DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "You can now run /reload in your solo world!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
