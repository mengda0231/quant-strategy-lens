from __future__ import annotations

import http.server
import os
import socket
from pathlib import Path

from sync_lens_data import main as sync_main


DEFAULT_PORT = 8765


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    sync_main()
    os.chdir(repo_root)
    handler = http.server.SimpleHTTPRequestHandler
    port = find_open_port(DEFAULT_PORT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving {repo_root} at http://127.0.0.1:{port}/")
        print("Press Ctrl+C to stop.")
        server.serve_forever()


def find_open_port(preferred_port: int) -> int:
    for port in range(preferred_port, preferred_port + 25):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("No free local port found in the dashboard port range.")


if __name__ == "__main__":
    main()
