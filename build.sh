#!/usr/bin/env bash
set -euo pipefail

# build.sh - Install Bun and start the bot on Oracle Linux
# Usage: sudo bash build.sh

if [ "$(id -u)" -ne 0 ]; then
  echo "It's recommended to run this script as root or with sudo. Continuing..."
fi

OS_ID="$(awk -F= '/^ID=/{print $2}' /etc/os-release 2>/dev/null || echo '')"
OS_NAME="$(awk -F= '/^NAME=/{print $2}' /etc/os-release 2>/dev/null || echo '')"

echo "Detected OS: ${OS_NAME:-unknown} (ID=${OS_ID:-unknown})"

# Install Bun if it is not already installed
need_install_bun=false
if command -v bun >/dev/null 2>&1; then
  echo "Bun already installed: $(bun --version)"
else
  need_install_bun=true
fi

if [ "$need_install_bun" = true ]; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: Bun installation failed or bun is not available." >&2
  exit 1
fi

echo "Bun version: $(bun --version)"

# Install project dependencies using Bun
bun install

# Optional: create a simple systemd service file for running the bot
SERVICE_FILE="/etc/systemd/system/candooda-bot.service"
if [ ! -f "$SERVICE_FILE" ]; then
  echo "Creating systemd service at $SERVICE_FILE"
  cat > "$SERVICE_FILE" <<'SERVICE'
[Unit]
Description=Candooda Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/candooda-bot
ExecStart=/root/.bun/bin/bun /root/candooda-bot/index.js
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
SERVICE
  echo "Created $SERVICE_FILE (adjust paths/user as needed). Use: systemctl daemon-reload && systemctl enable --now candooda-bot"
fi

echo "Build complete. To run now: bun index.js"
