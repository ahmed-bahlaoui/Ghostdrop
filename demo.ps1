$ErrorActionPreference = "Stop"
$cliDir = "$PSScriptRoot\packages\ghostdrop-cli"
$testFile = "$env:TEMP\ghostdrop-demo.txt"
$dlDir = "$env:TEMP\ghostdrop-demo-dl"

New-Item -ItemType Directory -Path $dlDir -Force | Out-Null

Set-Content -Path $testFile -Value @"
Hello from GhostDrop CLI!

This file was sent through GhostDrop's ephemeral,
encrypted transfer pipeline.

$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

$originalHash = (Get-FileHash -Path $testFile -Algorithm SHA256).Hash

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  GHOSTDROP CLI -- END-TO-END DEMO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -- HELP --------------------------------------------------
Write-Host "-- HELP --" -ForegroundColor Yellow
& node "$cliDir\dist\index.js" --help
Write-Host ""
Start-Sleep -Seconds 1

# -- UNENCRYPTED SEND --------------------------------------
Write-Host "-- UNENCRYPTED SEND --" -ForegroundColor Yellow
$sendOut = (& node "$cliDir\dist\index.js" send $testFile --expiry 60 --max-downloads 5 2>&1 | Out-String).Trim()
Write-Host $sendOut

if ($sendOut -match 'Transfer code:\s*([A-Z0-9-]+)') {
    $plainCode = $Matches[1]
} else {
    Write-Host "ERROR: Could not parse transfer code" -ForegroundColor Red
    Write-Host "Output was: $sendOut"
    exit 1
}
Start-Sleep -Seconds 1

# -- UNENCRYPTED RECEIVE -----------------------------------
Write-Host "-- UNENCRYPTED RECEIVE --" -ForegroundColor Yellow
$plainPath = "$dlDir\plain.txt"
$recvOut = (& node "$cliDir\dist\index.js" receive $plainCode -o $plainPath 2>&1 | Out-String).Trim()
Write-Host $recvOut

$receivedHash = (Get-FileHash -Path $plainPath -Algorithm SHA256).Hash
if ($receivedHash -eq $originalHash) {
    Write-Host "  SHA256 VERIFIED" -ForegroundColor Green
} else {
    Write-Host "  SHA256 MISMATCH" -ForegroundColor Red
    exit 1
}
Write-Host ""
Start-Sleep -Seconds 1

# -- E2EE SEND ---------------------------------------------
Write-Host "-- E2EE SEND --" -ForegroundColor Yellow
$encOut = (& node "$cliDir\dist\index.js" send $testFile -e --expiry 60 --max-downloads 5 2>&1 | Out-String).Trim()
Write-Host $encOut

if ($encOut -match 'transfer=([A-Z0-9-]+)&key=([A-Za-z0-9_\-]+)') {
    $encCode = $Matches[1]
    $encKey = $Matches[2]
} else {
    Write-Host "ERROR: Could not parse E2EE transfer" -ForegroundColor Red
    Write-Host "Output was: $encOut"
    exit 1
}
Start-Sleep -Seconds 1

# -- E2EE RECEIVE ------------------------------------------
Write-Host "-- E2EE RECEIVE --" -ForegroundColor Yellow
$decPath = "$dlDir\decrypted.txt"
$decOut = (& node "$cliDir\dist\index.js" receive $encCode -k $encKey -o $decPath 2>&1 | Out-String).Trim()
Write-Host $decOut

$decryptedHash = (Get-FileHash -Path $decPath -Algorithm SHA256).Hash
if ($decryptedHash -eq $originalHash) {
    Write-Host "  SHA256 VERIFIED" -ForegroundColor Green
} else {
    Write-Host "  SHA256 MISMATCH" -ForegroundColor Red
    exit 1
}
Write-Host ""

# -- SUMMARY -----------------------------------------------
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ALL TESTS PASSED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cleanup
Remove-Item -Path $testFile, $plainPath, $decPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $dlDir -Force -ErrorAction SilentlyContinue
