#!/usr/bin/env bash
set -euo pipefail

# build.sh - Install Node.js 18 and start the bot on Oracle Linux
# Usage: sudo bash build.sh

if [ "$(id -u)" -ne 0 ]; then
  echo "It's recommended to run this script as root or with sudo. Continuing..."
fi

OS_ID="$(awk -F= '/^ID=/{print $2}' /etc/os-release 2>/dev/null || echo '')"
OS_NAME="$(awk -F= '/^NAME=/{print $2}' /etc/os-release 2>/dev/null || echo '')"

echo "Detected OS: ${OS_NAME:-unknown} (ID=${OS_ID:-unknown})"

# Only proceed with Node installation if node version is missing or <18
need_install_node=false
if command -v node >/dev/null 2>&1; then
  curr=$(node -v | sed 's/^v//;s/\..*//')
  if [ "${curr:-0}" -lt 18 ]; then
    need_install_node=true
  fi
else
  need_install_node=true
fi

if [ "$need_install_node" = true ]; then
  echo "Installing Node.js 18.x via Nodesource..."
  # Fetch and run NodeSource setup for Enterprise Linux
  curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
  if command -v dnf >/dev/null 2>&1; then
    dnf -y install nodejs
  else
    yum -y install nodejs
  fi
fi

echo "Node version: $(node -v)"

# Install project dependencies
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

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
ExecStart=/usr/bin/node /root/candooda-bot/index.js
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
SERVICE
  echo "Created $SERVICE_FILE (adjust paths/user as needed). Use: systemctl daemon-reload && systemctl enable --now candooda-bot"
fi

echo "Build complete. To run now: npm start"
