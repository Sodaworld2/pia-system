@echo off
echo ============================================
echo   PIA Ngrok Tunnel
echo ============================================
echo.
echo Starting ngrok tunnel for PIA API (port 3000)...
echo The public URL will appear below.
echo Share this URL with the remote machine.
echo.
echo Press Ctrl+C to stop the tunnel.
echo ============================================
echo.
ngrok http 3000
