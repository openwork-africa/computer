#!/usr/bin/env python3
"""The recorder inside a computer: Record (on the page, or the SDK) turns it on, and while it is on every step the
Firefox add-on sends (127.0.0.1:6081, reachable only from inside this computer) is kept in /run/computer/rec with a
screenshot taken as it happens. The server takes the folder out when the recording is finished.

    computer-recorder serve          # started by start-computer
    computer-recorder start|stop     # run by the server through `container exec`
    computer-recorder note <text>    # a note from the person recording, kept as a step
    computer-recorder count          # how many steps so far
"""
import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

REC = "/run/computer/rec"
ON = os.path.join(REC, "on")
STEPS = os.path.join(REC, "steps.jsonl")
TABS = "/run/computer/tabs.json"  # the open tabs, from the add-on, for the SDK
MAX_BODY = 64 * 1024


def recording() -> bool:
    return os.path.exists(ON)


def keep(step: dict) -> int:
    """Number the step, screenshot the screen, and append it. A lock keeps numbers in order between the add-on and notes."""
    os.makedirs(REC, exist_ok=True)
    with open(os.path.join(REC, ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        n = 1
        if os.path.exists(STEPS):
            with open(STEPS) as f:
                n = sum(1 for _ in f) + 1
        shot = f"{n:04d}.jpg"
        subprocess.run(["import", "-window", "root", "-quality", "70", os.path.join(REC, shot)],
                       env={**os.environ, "DISPLAY": ":0"}, timeout=10, capture_output=True)
        step = {"n": n, "time": int(time.time() * 1000), **step, "shot": shot}
        with open(STEPS, "a") as f:
            f.write(json.dumps(step, ensure_ascii=False) + "\n")
        return n


class Steps(BaseHTTPRequestHandler):
    def answer(self, status: int, body: dict | None = None) -> None:
        data = json.dumps(body or {}).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        # Only the add-on: its requests come from a moz-extension:// origin. A web page could reach this port too,
        # and must not be able to add steps.
        if self.path not in ("/step", "/tabs") or not self.headers.get("origin", "").startswith("moz-extension://"):
            return self.answer(403)
        size = int(self.headers.get("content-length") or 0)
        if size > MAX_BODY:
            return self.answer(413)
        try:
            step = json.loads(self.rfile.read(size))
        except ValueError:
            return self.answer(400)
        if self.path == "/tabs":
            if not isinstance(step, list):
                return self.answer(400)
            with open(TABS + ".tmp", "w") as f:
                json.dump(step, f, ensure_ascii=False)
            os.chmod(TABS + ".tmp", 0o644)
            os.replace(TABS + ".tmp", TABS)
            return self.answer(200, {"tabs": len(step)})
        if not isinstance(step, dict) or not recording():
            return self.answer(200, {"on": False})
        step.pop("n", None)
        step.pop("shot", None)
        return self.answer(200, {"on": True, "n": keep(step)})

    def log_message(self, *args) -> None:
        pass


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "serve":
        HTTPServer(("127.0.0.1", 6081), Steps).serve_forever()
    elif command == "start":
        shutil.rmtree(REC, ignore_errors=True)
        os.makedirs(REC, mode=0o700)
        open(ON, "w").close()
    elif command == "stop":
        if os.path.exists(ON):
            os.remove(ON)
    elif command == "note":
        if not recording():
            sys.exit("Not recording")
        print(keep({"kind": "note", "text": " ".join(sys.argv[2:])[:2000]}))
    elif command == "count":
        n = 0
        if os.path.exists(STEPS):
            with open(STEPS) as f:
                n = sum(1 for _ in f)
        print(json.dumps({"on": recording(), "steps": n}))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
