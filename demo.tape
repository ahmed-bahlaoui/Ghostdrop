# GhostDrop CLI demo
# Requires:
#   docker compose -f compose.staging.yaml up -d --build
#   pnpm --filter ghostdrop-cli build
#
# Render:
#   vhs demo.tape

Output demo.gif

Require node

Set WindowBar Colorful
Set Shell "powershell"
Set FontFamily "Cascadia Mono"
Set FontSize 18
Set Width 110
Set Height 30
Set Padding 2
Set Framerate 60
Set CursorBlink false
Set PlaybackSpeed 1
Set TypingSpeed 120ms

Env "GHOSTDROP_API_URL" "http://localhost/api"
Env "GHOSTDROP_WEB_URL" "http://localhost"
Env "GHOSTDROP_CLI_NO_QR" "1"

Hide
Type "pnpm --filter ghostdrop-cli build 2>$null"
Enter
Sleep 3s
Show

Type "# GhostDrop CLI"
Enter
Sleep 400ms

Type "# Anonymous temporary encrypted file sharing"
Enter
Sleep 400ms

Type "# Direct subcommands: send, receive"
Enter
Sleep 400ms

Type "# Options: --encrypt, --expiry, --max-downloads, --key, --output"
Enter
Sleep 1s

# The demo script orchestrates the full flow:
# --help, unencrypted send+receive, E2EE send+receive, SHA256 verification
# Each subcommand is echoed before execution so the viewer sees the exact commands.
Type ".\demo.ps1"
Enter
Sleep 60s
