# GhostDrop CLI demo
# Requires: Docker staging stack running (docker compose -f compose.staging.yaml up -d)
# Run:    vhs demo.tape
# Output: demo.gif

Output demo.gif

Set Shell "powershell"
Set FontSize 18
Set Width 100
Set Height 32
Set Padding 2
Set Framerate 24
Set PlaybackSpeed 1

Hide
Type "pnpm --filter ghostdrop-cli build 2>$null"
Enter
Sleep 4s
Show

Type "# GhostDrop CLI -- Anonymous, Encrypted File Sharing"
Enter
Sleep 1s

Type "# Unencrypted and E2EE (AES-256-GCM) transfer demo"
Enter
Sleep 1s

Type ".\demo.ps1"
Enter
Sleep 50s
