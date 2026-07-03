# Minecraft Local Development and Endstone Server Deployment Script
$MinecraftPath = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"
$BehaviorDest = Join-Path $MinecraftPath "development_behavior_packs\JUN06LeefySpawners BEH"
$ResourceDest = Join-Path $MinecraftPath "development_resource_packs\JUN06LeefySpawners RES"

$ServerPath = "C:\Users\baseb\Desktop\Projects\test-dev-server-for-endstone-bedrock"
$ServerBehaviorDest = Join-Path $ServerPath "bedrock_server\development_behavior_packs\JUN06LeefySpawners BEH"
$ServerResourceDest = Join-Path $ServerPath "bedrock_server\development_resource_packs\JUN06LeefySpawners RES"
$WorldPath = Join-Path $ServerPath "bedrock_server\worlds\Bedrock level"

# 1. Run TypeScript build
npm run build

# 1b. Run Obfuscation
Write-Host "Obfuscating bundled code..." -ForegroundColor Cyan
node obfuscate.js


# Read the version dynamically from the manifest
$behManifest = Get-Content -Path "JUN06LeefySpawners BEH/manifest.json" -Raw | ConvertFrom-Json
$version = $behManifest.header.version -join '.'

# 2. Package into .mcaddon
Write-Host "Creating LeefySpawners_$version.mcaddon package..." -ForegroundColor Cyan
Remove-Item -Path ".\LeefySpawners_*.mcaddon" -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\LeefySpawners.mcaddon" -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\LeefySpawnersBEH_*.mcpack" -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\LeefySpawnersRES_*.mcpack" -Force -ErrorAction SilentlyContinue

# Compress behavior pack contents to LeefySpawnersBEH_$version.mcpack
Push-Location ".\JUN06LeefySpawners BEH"
tar -caf "..\LeefySpawnersBEH.zip" --exclude="desktop.ini" --exclude="*.DS_Store" --exclude="Thumbs.db" *
Pop-Location
Rename-Item -Path ".\LeefySpawnersBEH.zip" -NewName "LeefySpawnersBEH_$version.mcpack" -Force

# Compress resource pack contents to LeefySpawnersRES_$version.mcpack
Push-Location ".\JUN06LeefySpawners RES"
tar -caf "..\LeefySpawnersRES.zip" --exclude="desktop.ini" --exclude="*.DS_Store" --exclude="Thumbs.db" *
Pop-Location
Rename-Item -Path ".\LeefySpawnersRES.zip" -NewName "LeefySpawnersRES_$version.mcpack" -Force

# Combine the two .mcpack files into LeefySpawners_$version.mcaddon
tar -caf "LeefySpawners_$version.zip" "LeefySpawnersBEH_$version.mcpack" "LeefySpawnersRES_$version.mcpack"
Rename-Item -Path ".\LeefySpawners_$version.zip" -NewName "LeefySpawners_$version.mcaddon" -Force

if (Test-Path "LeefySpawners_$version.mcaddon") {
    Write-Host "Created LeefySpawners_$version.mcaddon successfully!" -ForegroundColor Green
} else {
    Write-Host "Error creating LeefySpawners_$version.mcaddon" -ForegroundColor Red
}

# Clean up temp .mcpack files
Remove-Item -Path ".\LeefySpawnersBEH_$version.mcpack" -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\LeefySpawnersRES_$version.mcpack" -Force -ErrorAction SilentlyContinue





# 3. Deploy to local Minecraft Win10 client dev folders
Write-Host "Deploying addon to Win10 local client dev folders..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $BehaviorDest) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $ResourceDest) | Out-Null
Remove-Item -Path $BehaviorDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ResourceDest -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path ".\JUN06LeefySpawners BEH" -Destination (Split-Path $BehaviorDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ResourceDest) -Recurse -Force

# 4. Deploy to local Endstone server dev folders
Write-Host "Deploying addon to local Endstone server dev folders..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $ServerBehaviorDest) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $ServerResourceDest) | Out-Null
Remove-Item -Path $ServerBehaviorDest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ServerResourceDest -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path ".\JUN06LeefySpawners BEH" -Destination (Split-Path $ServerBehaviorDest) -Recurse -Force
Copy-Item -Path ".\JUN06LeefySpawners RES" -Destination (Split-Path $ServerResourceDest) -Recurse -Force

# Delete old packs from server dev folders to prevent duplicate package loads
Remove-Item -Path (Join-Path $ServerPath "bedrock_server\development_behavior_packs\OCT30LeefySpawners BEH") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $ServerPath "bedrock_server\development_resource_packs\OCT30LeefySpawners RES") -Recurse -Force -ErrorAction SilentlyContinue

# 5. Register packs in the active server world configuration
Write-Host "Ensuring addon packs are registered in server world configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $WorldPath | Out-Null

# Read the UUID and version array dynamically from manifests to prevent mismatches
$behManifest = Get-Content -Path "JUN06LeefySpawners BEH/manifest.json" -Raw | ConvertFrom-Json
$resManifest = Get-Content -Path "JUN06LeefySpawners RES/manifest.json" -Raw | ConvertFrom-Json

$behUuid = $behManifest.header.uuid
$behVerArray = $behManifest.header.version

$resUuid = $resManifest.header.uuid
$resVerArray = $resManifest.header.version

# Robustly update world behavior packs
$behPackFile = Join-Path $WorldPath "world_behavior_packs.json"
python "C:\Users\baseb\.gemini\antigravity\brain\0b21b149-5c39-4f9e-9b9d-d9e85560816c\scratch\register_pack.py" $behPackFile $behUuid ($behVerArray -join '.')

# Robustly update world resource packs
$resPackFile = Join-Path $WorldPath "world_resource_packs.json"
python "C:\Users\baseb\.gemini\antigravity\brain\0b21b149-5c39-4f9e-9b9d-d9e85560816c\scratch\register_pack.py" $resPackFile $resUuid ($resVerArray -join '.')

# 6. Restart Endstone Bedrock server
Write-Host "Restarting Endstone Bedrock Server..." -ForegroundColor Cyan
Stop-Process -Name "bedrock_server" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "endstone" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
# Launch using the Python venv endstone.exe
Start-Process -FilePath "C:\Users\baseb\Desktop\Projects\test-dev-server-for-endstone-bedrock\.venv\Scripts\endstone.exe" -ArgumentList "-s bedrock_server" -WorkingDirectory $ServerPath

# 7. Print connection details
$LocalIPs = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*Loopback*"}).IPAddress

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "DEPLOYMENT COMPLETE & SERVER RESTARTED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "To join the server from your phone:" -ForegroundColor White
Write-Host "1. Make sure your phone is connected to the SAME Wi-Fi network." -ForegroundColor White
Write-Host "2. In Minecraft Bedrock on your phone, go to 'Servers' tab." -ForegroundColor White
Write-Host "3. Scroll down, click 'Add Server'." -ForegroundColor White
Write-Host "4. Enter one of the following IP addresses:" -ForegroundColor White
foreach ($ip in $LocalIPs) {
    Write-Host "   -> $ip" -ForegroundColor Yellow
}
Write-Host "5. Enter Port: 19133" -ForegroundColor Yellow
Write-Host "6. Click Save and Join!" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Clickable Addon Package (local link):" -ForegroundColor White
Write-Host "file:///C:/Users/baseb/.gemini/antigravity/scratch/leefyspawners/LeefySpawners_8.0.1.mcaddon" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green

