#!/usr/bin/env bash
# Destructive package lifecycle checks: run only on disposable Ubuntu runners.
set -Eeuo pipefail
package=$(realpath "$1")
check_game() {
    for attempt in {1..30}; do
        if curl -fsS http://127.0.0.1:8080/ -o /tmp/parcheesi-index.html; then break; fi
        sleep 1
    done
    systemctl is-active --quiet pachisi-lan
    grep -q 'Classic Parcheesi Game' /tmp/parcheesi-index.html
    for route in victory-hall rules/en rules/pt-BR rules/es-ES rules/fr-FR rules/it-IT rules/ru-RU rules/ja-JP rules/zh-CN rules/hi-IN winner.wav music2.mp3; do
        curl -fsS "http://127.0.0.1:8080/$route" -o /dev/null
    done
    test "$(systemctl show -p User --value pachisi-lan)" = pachisi
    systemctl is-enabled --quiet pachisi-lan
}
check_hall() {
    curl -fsS http://127.0.0.1:8080/victory-hall | grep -q PackageTestWinner
}
apt-get install -y "$package"
check_game
systemctl stop pachisi-lan
printf '%s\n' '[{"name":"PackageTestWinner","wins":5,"bot":false}]' > /run/pachisi-lan/victory-hall.json
chown pachisi:pachisi /run/pachisi-lan/victory-hall.json
systemctl start pachisi-lan
check_game
check_hall
# Reinstall exercises the generated upgrade scripts and restart behavior.
dpkg -i "$package"
check_game
check_hall
apt-get remove -y classic-parcheesi-game
! systemctl is-active --quiet pachisi-lan
test ! -f /usr/share/classic-parcheesi-game/server.py
apt-get purge -y classic-parcheesi-game
# Recreate the shell installer's service and test automatic migration.
cat > /etc/systemd/system/pachisi-lan.service <<'UNIT'
[Unit]
Description=Legacy installer migration test
[Service]
User=pachisi
WorkingDirectory=/opt/pachisi-lan
ExecStart=/opt/pachisi-lan/.venv/bin/python /opt/pachisi-lan/server.py
[Install]
WantedBy=multi-user.target
UNIT
apt-get install -y "$package"
test -f /etc/systemd/system/pachisi-lan.service.shell-installer-backup
test ! -f /etc/systemd/system/pachisi-lan.service
check_game
check_hall
apt-get purge -y classic-parcheesi-game
! systemctl is-active --quiet pachisi-lan
echo 'Package installation, upgrade, score retention, migration, and removal passed.'
