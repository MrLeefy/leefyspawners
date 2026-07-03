@echo off
echo Opening Minecraft Bedrock/Endstone port 19133 on Windows Firewall...
powershell -Command "New-NetFirewallRule -DisplayName 'Minecraft Endstone Port 19133' -Direction Inbound -LocalPort 19133 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue"
echo.
echo ==================================================
echo Firewall port 19133 has been successfully opened!
echo ==================================================
echo.
pause
