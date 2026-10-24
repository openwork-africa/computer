#!/bin/bash
# The computer's boot: a 1024x640 screen, openbox, Firefox maximized on its mounted profile, and the stream
# (x11vnc behind a password, websockify + noVNC on 6080). Runs on every `container start`, so a resumed computer
# gets a fresh password and a fresh Firefox on the same profile.
set -u
export DISPLAY=:0

# `start-computer quit` (run by Save through `container exec`, before `container stop`): close Firefox the way its
# Quit does, so cookies and sign-ins are written out, and keep it from being relaunched. `container stop` alone ends
# the VM before Firefox has closed.
if [ "${1:-}" = quit ]; then
  touch /run/computer/quitting
  pkill -TERM -x firefox-bin
  for i in $(seq 100); do pgrep -x firefox-bin >/dev/null || exit 0; sleep 0.1; done
  exit 0
fi

# A new VNC password on each boot, kept where only root (and the server, through `container exec`) can read it.
# VNC passwords are 8 characters at most.
install -d -m 0700 /run/computer
rm -f /run/computer/quitting
pwgen -s 8 1 > /run/computer/vncpass
x11vnc -storepasswd "$(cat /run/computer/vncpass)" /run/computer/vncauth >/dev/null 2>&1

# A stop of the container mid-boot leaves a stale lock that would keep Xvfb from starting again.
rm -f /tmp/.X0-lock /tmp/.X11-unix/X0
Xvfb :0 -screen 0 1024x640x24 -nolisten tcp -ac &
for i in $(seq 50); do xdotool getdisplaygeometry >/dev/null 2>&1 && break; sleep 0.1; done

su user -c 'openbox' >/dev/null 2>&1 &
x11vnc -display :0 -rfbauth /run/computer/vncauth -rfbport 5900 -localhost -forever -shared -noxdamage -quiet \
  >/var/log/x11vnc.log 2>&1 &
websockify --web /usr/share/novnc 6080 localhost:5900 >/var/log/websockify.log 2>&1 &
# Record's step keeper (inside only, 127.0.0.1:6081); it keeps nothing until the page turns a recording on.
computer-recorder serve >/var/log/recorder.log 2>&1 &

# The profile is the Mac's folder; Firefox writes it as `user`. Its lock files are left behind when the container is
# stopped hard, and would make Firefox think another copy is running.
chown user:user /profile 2>/dev/null
rm -f /profile/lock /profile/.parentlock

# Firefox comes back if it is closed or crashes, so the screen is never an empty desktop.
browser() {
  while [ ! -e /run/computer/quitting ]; do
    su user -c 'dbus-launch --exit-with-session firefox --no-remote --profile /profile' >/var/log/firefox.log 2>&1
    sleep 1
  done
}
browser &
BROWSER=$!

# If TERM does reach this script (a stop without Save's quit first), close Firefox the same way.
shutdown() {
  kill "$BROWSER" 2>/dev/null
  "$0" quit
  exit 0
}
trap shutdown TERM INT
wait
