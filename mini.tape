Output mini.gif

Require node

## Look and feel
Set WindowBar Colorful
Set Shell bash
Set FontFamily "Cascadia Code NF"
Set FontSize 24
Set Width 1400
Set Height 700
Set Padding 8
Set PlaybackSpeed 0.5

## Outputs
Output out/ghostdrop-cli-demo.gif
Output out/ghostdrop-cli-demo.mp4
Output out/ghostdrop-cli-demo.webm

Env "GHOSTDROP_API_URL" "http://localhost/api"
Env "GHOSTDROP_WEB_URL" "http://localhost"
Env "GHOSTDROP_CLI_NO_QR" "1"

Hide
Sleep 2s
Show

Type "# Hi there 👋"
Enter
Sleep 400ms

Type "# It's been a while..."
Enter
Sleep 400ms
Type "# I saw your feedback, and I heard you."
Enter
Sleep 400ms

Type "# I've been heads down building something new, and I think you're going to like it."
Enter
Sleep 400ms

Type "# Introducing..."
Enter
Sleep 400ms


Type "# The GhostDrop CLI: file sharing directly into your terminal, with end-to-end encryption and zero-knowledge privacy."
Enter
Sleep 400ms



Type "# Let's take a look 👀"
Enter
Sleep 600ms


Type "# Direct subcommands: send, receive"
Enter
Sleep 600ms

Type "# Options: --encrypt, --expiry, --max-downloads, --key, --output"
Enter
Sleep 1s

# The demo script orchestrates the full flow:
# --help, unencrypted send+receive, E2EE send+receive, SHA256 verification
# Each subcommand is echoed before execution so the viewer sees the exact commands.

Type "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./demo.ps1"
Enter
Sleep 30s

