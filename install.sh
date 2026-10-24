#!/bin/sh
# Installs (or updates) Computer from its latest release: no clone and no Bun needed.
#
#   curl -fsSL https://github.com/openwork-africa/computer/releases/latest/download/install.sh | sh
#
# It puts the app in ~/.openwork-computer/app and a `computer` command in ~/.local/bin. Your computers, their
# sign-ins and your recordings (also in ~/.openwork-computer) are left as they are.
set -eu

REPO="openwork-africa/computer"
HOME_DIR="${COMPUTER_HOME:-$HOME/.openwork-computer}"
APP="$HOME_DIR/app"
BIN="${COMPUTER_BIN:-$HOME/.local/bin}"
URL="${COMPUTER_DOWNLOAD:-https://github.com/$REPO/releases/latest/download/computer-darwin-arm64.tar.gz}"

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || fail "Computer needs a Mac with Apple silicon."
command -v container >/dev/null 2>&1 || fail "First install Apple's container (https://github.com/apple/container/releases), then run this again."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading Computer…"
curl -fsSL "$URL" -o "$tmp/computer.tar.gz"
tar -xzf "$tmp/computer.tar.gz" -C "$tmp"
[ -x "$tmp/computer/computer" ] || fail "The download did not contain the app."

mkdir -p "$HOME_DIR" "$BIN"
chmod 700 "$HOME_DIR"
rm -rf "$APP.old"
[ -d "$APP" ] && mv "$APP" "$APP.old"
mv "$tmp/computer" "$APP"
rm -rf "$APP.old"
ln -sf "$APP/computer" "$BIN/computer"

echo "Installed: $BIN/computer"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "Add it to your PATH:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.zshrc && exec zsh" ;;
esac
echo ""
echo "Start it:   computer serve     (then open http://127.0.0.1:41800)"
echo "Drive it:   computer help"
