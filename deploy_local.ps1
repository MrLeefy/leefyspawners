# Minecraft Local Development Deployment Script
$MinecraftPath = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"
$BehaviorDest = Join-Path $MinecraftPath "development_behavior_packs\JUN06LeefySpawners BEH"
$ResourceDest = Join-Path $MinecraftPath "development_resource_packs\JUN06LeefySpawners RES"

# Ensure developer directories exist
New-Item -ItemType Directory -Force -Path (Split-Path $BehaviorDest) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $ResourceDest) | Out-Null

# Clean up older copies if any
Remove-Item -Path $BehaviorDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ResourceDest -Recurse -Force -ErrorAction SilentlyContinue

# Copy current packs
Copy-Item -Path ".\JUN06LeefySpawners BEH" -Destination (Split-Path $BehaviorDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ResourceDest) -Recurse -Force

Write-Host "✅ Addon packs deployed successfully to local Minecraft developer folders!" -ForegroundColor Green
