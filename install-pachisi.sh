#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=/opt/pachisi-lan
SERVICE=pachisi-lan
APP_USER=pachisi
PORT=8080
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo 'Run with sudo: sudo bash install-pachisi.sh' >&2
  exit 1
fi
if command -v dpkg-query >/dev/null 2>&1 && [[ "$(dpkg-query -W -f='${Status}' classic-parcheesi-game 2>/dev/null || true)" == 'install ok installed' ]]; then
  echo 'Classic Parcheesi Game is managed by APT. Upgrade with sudo apt install ./classic-parcheesi-game_VERSION_all.deb instead.' >&2
  exit 1
fi
if ! command -v apt-get >/dev/null || ! command -v systemctl >/dev/null; then
  echo 'This installer requires Ubuntu/Debian with apt and systemd.' >&2
  exit 1
fi

SOURCE_DIR=''
TMP_DIR=''
cleanup() { if [[ -n "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT
if [[ -f "$SCRIPT_DIR/server.py" && -f "$SCRIPT_DIR/index.html" && -f "$SCRIPT_DIR/requirements.txt" ]]; then
  SOURCE_DIR="$SCRIPT_DIR"
elif [[ -f "$SCRIPT_DIR/pachisi-lan/server.py" && -f "$SCRIPT_DIR/pachisi-lan/index.html" ]]; then
  SOURCE_DIR="$SCRIPT_DIR/pachisi-lan"
elif [[ -f "$SCRIPT_DIR/pachisi-lan.zip" ]]; then
  echo 'Installing unzip and Python prerequisites...'
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip unzip
  TMP_DIR="$(mktemp -d)"
  unzip -q "$SCRIPT_DIR/pachisi-lan.zip" -d "$TMP_DIR"
  SOURCE_DIR="$TMP_DIR/pachisi-lan"
else
  echo 'Place install-pachisi.sh beside pachisi-lan.zip or the extracted pachisi-lan folder.' >&2
  exit 1
fi

for f in server.py index.html requirements.txt winner.wav music2.mp3 rules/en.html rules/pt-BR.html rules/es-ES.html rules/fr-FR.html rules/it-IT.html rules/ru-RU.html rules/ja-JP.html rules/zh-CN.html rules/hi-IN.html; do
  [[ -f "$SOURCE_DIR/$f" ]] || { echo "Missing $f" >&2; exit 1; }
done

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin --user-group "$APP_USER"
fi

if systemctl is-active --quiet "$SERVICE.service"; then
  systemctl stop "$SERVICE.service"
fi
install -d -m 0755 -o root -g root "$APP_DIR"
install -m 0644 "$SOURCE_DIR/server.py" "$APP_DIR/server.py"
install -m 0644 "$SOURCE_DIR/index.html" "$APP_DIR/index.html"
install -m 0644 "$SOURCE_DIR/winner.wav" "$APP_DIR/winner.wav"
install -m 0644 "$SOURCE_DIR/music2.mp3" "$APP_DIR/music2.mp3"
install -d -m 0755 "$APP_DIR/rules"
install -m 0644 "$SOURCE_DIR"/rules/*.html "$APP_DIR/rules/"
rm -f "$APP_DIR/wooden-board.jpg"
install -m 0644 "$SOURCE_DIR/requirements.txt" "$APP_DIR/requirements.txt"
if [[ -f "$SOURCE_DIR/README.md" ]]; then install -m 0644 "$SOURCE_DIR/README.md" "$APP_DIR/README.md"; fi

python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/python" -m pip install --disable-pip-version-check -r "$APP_DIR/requirements.txt"
chown -R root:root "$APP_DIR"
chmod -R a+rX "$APP_DIR"

cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=Classic Parcheesi Game LAN server
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/.venv/bin/python $APP_DIR/server.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
RuntimeDirectory=pachisi-lan
RuntimeDirectoryPreserve=yes
Environment=PARCHEESI_HALL_FILE=/run/pachisi-lan/victory-hall.json
ReadWritePaths=/run/pachisi-lan

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE.service"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow "$PORT/tcp" comment 'Pachisi LAN'
fi

echo
echo '========================================='
echo ' Classic Parcheesi Game installation complete'
echo '========================================='
systemctl --no-pager --full status "$SERVICE.service" | head -n 12 || true
echo
echo 'Open on the Ubuntu host: http://localhost:8080'
for ip in $(hostname -I 2>/dev/null); do
  if [[ "$ip" == *.* && "$ip" != 127.* ]]; then echo "Open from LAN: http://$ip:$PORT"; fi
done
echo
echo 'Manage: sudo systemctl status|restart|stop pachisi-lan'
echo 'Logs:   sudo journalctl -u pachisi-lan -f'
