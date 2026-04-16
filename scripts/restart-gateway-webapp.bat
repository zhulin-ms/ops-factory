@echo off
powershell.exe -ExecutionPolicy Bypass -File "%~dp0restart-gateway-webapp.ps1" %*
