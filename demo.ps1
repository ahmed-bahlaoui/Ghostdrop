$ErrorActionPreference = "Stop"

$cliDir = Join-Path $PSScriptRoot "packages\ghostdrop-cli"
$workDir = Join-Path $env:TEMP "ghostdrop-cli-demo"
$sourceFile = Join-Path $workDir "ghostdrop-demo-note.txt"
$plainFile = Join-Path $workDir "received-note.txt"
$encryptedFile = Join-Path $workDir "received-e2ee-note.txt"
$cliEntry = Join-Path $cliDir "dist\index.js"

if (-not $env:GHOSTDROP_API_URL) {
	$env:GHOSTDROP_API_URL = "http://localhost/api"
}
if (-not $env:GHOSTDROP_WEB_URL) {
	$env:GHOSTDROP_WEB_URL = "http://localhost"
}
if (-not $env:GHOSTDROP_CLI_NO_QR) {
	$env:GHOSTDROP_CLI_NO_QR = "1"
}

function Pause-Demo {
	param([int] $Milliseconds = 900)
	Start-Sleep -Milliseconds $Milliseconds
}

function Write-Section {
	param([string] $Title)
	Write-Host ""
	Write-Host "  $Title" -ForegroundColor Cyan
	Write-Host "  $('-' * $Title.Length)" -ForegroundColor DarkCyan
}

function Write-Step {
	param([string] $Text)
	Write-Host ""
	Write-Host "  -> $Text" -ForegroundColor Yellow
	Pause-Demo 500
}

function Write-Command {
	param([string] $Command)
	Write-Host ""
	Write-Host "  $ " -NoNewline -ForegroundColor Green
	Write-Host $Command -ForegroundColor White
	Pause-Demo 600
}

function Invoke-GhostDrop {
	param(
		[string[]] $Arguments,
		[switch] $PassThru
	)

	$output = (& node $cliEntry @Arguments 2>&1 | Out-String).Trim()
	$displayOutput = $output.Replace($workDir, ".")
	Write-Host $displayOutput

	if ($PassThru) {
		return $output
	}
}

function Get-DemoSha256 {
	param([string] $Path)

	$stream = [System.IO.File]::OpenRead($Path)
	try {
		$sha256 = [System.Security.Cryptography.SHA256]::Create()
		try {
			$hash = $sha256.ComputeHash($stream)
			return ([System.BitConverter]::ToString($hash)).Replace("-", "")
		} finally {
			$sha256.Dispose()
		}
	} finally {
		$stream.Dispose()
	}
}

if (-not (Test-Path $cliEntry)) {
	throw "GhostDrop CLI is not built. Run: pnpm --filter ghostdrop-cli build"
}

if (Test-Path $workDir) {
	Remove-Item -Path $workDir -Recurse -Force
}
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

Set-Content -Path $sourceFile -Value @"
GhostDrop CLI demo note

Temporary transfers. Human-friendly codes.
Optional AES-256-GCM before upload.
"@

$originalHash = Get-DemoSha256 $sourceFile

try {
	Clear-Host
} catch {
	Write-Host ""
}
Write-Host ""
Write-Host "  GhostDrop CLI" -ForegroundColor Magenta
Write-Host "  Anonymous temporary file sharing from your terminal" -ForegroundColor White
Write-Host ""
Write-Host "  API:  " -NoNewline -ForegroundColor DarkGray
Write-Host "$env:GHOSTDROP_API_URL" -ForegroundColor Gray
Write-Host "  File: " -NoNewline -ForegroundColor DarkGray
Write-Host "ghostdrop-demo-note.txt" -ForegroundColor Gray
Pause-Demo 1400

Write-Section "Explore the CLI"
Write-Command "ghostdrop --help"
Invoke-GhostDrop @("--help")
Pause-Demo 1400

Write-Section "Send a temporary file"
Write-Step "Create a one-hour transfer with three allowed downloads."
Write-Command "ghostdrop send ghostdrop-demo-note.txt --expiry 60 --max-downloads 3"
$plainSend = Invoke-GhostDrop @("send", $sourceFile, "--expiry", "60", "--max-downloads", "3") -PassThru

if ($plainSend -match "Transfer code:\s*([A-Z0-9-]+)") {
	$plainCode = $Matches[1]
} else {
	throw "Could not parse unencrypted transfer code."
}
Pause-Demo 1300

Write-Section "Receive by code"
Write-Step "Peek metadata first, then stream the file to disk."
Write-Command "ghostdrop receive $plainCode --output received-note.txt"
Invoke-GhostDrop @("receive", $plainCode, "--output", $plainFile)

$receivedHash = Get-DemoSha256 $plainFile
if ($receivedHash -ne $originalHash) {
	throw "Plain transfer hash mismatch."
}
Write-Host ""
Write-Host "  SHA256 verified: " -NoNewline -ForegroundColor Green
Write-Host $receivedHash.Substring(0, 12) -ForegroundColor Gray
Pause-Demo 1500

Write-Section "Send with end-to-end encryption"
Write-Step "Encrypt locally before upload. The server never receives the key."
Write-Command "ghostdrop send ghostdrop-demo-note.txt --encrypt --expiry 1440 --max-downloads 1"
$encryptedSend = Invoke-GhostDrop @("send", $sourceFile, "--encrypt", "--expiry", "1440", "--max-downloads", "1") -PassThru

if ($encryptedSend -match "transfer=([A-Z0-9-]+)&key=([A-Za-z0-9_\-]+)") {
	$encryptedCode = $Matches[1]
	$encryptedKey = $Matches[2]
} else {
	throw "Could not parse encrypted transfer code and key."
}
Pause-Demo 1800

Write-Section "Decrypt on receive"
Write-Command "ghostdrop receive $encryptedCode --key <url-fragment-key> --output received-e2ee-note.txt"
Invoke-GhostDrop @("receive", $encryptedCode, "--key", $encryptedKey, "--output", $encryptedFile)

$decryptedHash = Get-DemoSha256 $encryptedFile
if ($decryptedHash -ne $originalHash) {
	throw "Encrypted transfer hash mismatch."
}
Write-Host ""
Write-Host "  SHA256 verified: " -NoNewline -ForegroundColor Green
Write-Host $decryptedHash.Substring(0, 12) -ForegroundColor Gray
Pause-Demo 1200

Write-Host ""
Write-Host "  Demo complete" -ForegroundColor Magenta
Write-Host "  Send. Receive. Expire automatically." -ForegroundColor White
Write-Host ""

Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
