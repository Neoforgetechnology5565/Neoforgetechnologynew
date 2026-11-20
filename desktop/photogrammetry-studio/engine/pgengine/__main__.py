"""Entry point: `python -m pgengine` starts the local engine and serves the UI. `--window` opens it in a native window when pywebview is installed (otherwise the default browser)."""
from __future__ import annotations

import argparse
import multiprocessing as mp
import socket
import threading
import time
import webbrowser


def free_port(preferred: int) -> int:
    for p in (preferred, 0):
        s = socket.socket(); 
        try: s.bind(("127.0.0.1", p)); port = s.getsockname()[1]; s.close(); return port
        except OSError: s.close()
    raise RuntimeError("No free port.")


def main() -> None:
    ap = argparse.ArgumentParser(prog="pgengine"); ap.add_argument("--port", type=int, default=8765); ap.add_argument("--no-open", action="store_true"); ap.add_argument("--window", action="store_true", help="native window via pywebview")
    a = ap.parse_args(); port = free_port(a.port); import uvicorn
    from .api import app
    url = f"http://127.0.0.1:{port}/"; print(f"PhotoMesh Studio engine on {url}", flush=True)
    if a.window:
        try:
            import webview  # type: ignore
            threading.Thread(target=lambda: uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning"), daemon=True).start(); time.sleep(1.5); webview.create_window("PhotoMesh Studio", url, width=1500, height=950); webview.start(); return
        except ImportError:
            print("pywebview is not installed; opening the default browser instead (pip install pywebview for a native window).", flush=True)
    if not a.no_open: threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    mp.freeze_support(); main()
