#!/usr/bin/env python3
"""
LocalCoder Standalone Test
============================
Test LocalCoder with a real llama-server.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

LLAMA_CPP_DIR = Path("P:/llama cpp/llama-b9534-bin-win-cuda-13.3-x64")
LLAMA_SERVER = LLAMA_CPP_DIR / "llama-server.exe"
MODEL_PATH = Path("P:/gguf models/Qwopus3.5-9B-Coder-MTP-Q6_K.gguf")
PORT = 19193
API_URL = f"http://127.0.0.1:{PORT}/v1"
BUN_EXE = Path("C:/Users/User/AppData/Roaming/npm/node_modules/bun/bin/bun.exe")


def start_server() -> subprocess.Popen:
    proc = subprocess.Popen(
        [str(LLAMA_SERVER), "-m", str(MODEL_PATH), "--port", str(PORT), "-ngl", "99", "-c", "32768"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2) as r:
                if r.status == 200:
                    print("[LocalCoder Test] llama-server ready")
                    return proc
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("llama-server failed to start")


def setup_localcoder_config():
    config_dir = Path.home() / ".localcoder"
    config_dir.mkdir(parents=True, exist_ok=True)
    config = {
        "model": "llamacpp/qwopus",
        "small_model": "llamacpp/qwopus",
        "provider": {
            "llamacpp": {
                "name": "Local llama.cpp",
                "id": "llamacpp",
                "options": {"baseURL": API_URL, "apiKey": "dummy"},
                "models": {"qwopus": {"id": "qwopus", "name": "Qwopus3.5-9B"}},
            }
        },
        "permission": {"bash": "allow", "edit": "allow", "file_read": "allow", "file_write": "allow"},
    }
    (config_dir / "localcoder.json").write_text(json.dumps(config, indent=2))


def test_generate_code(project_dir: Path):
    print("\n[LocalCoder Test] Generating code...")
    cmd = [
        str(BUN_EXE), "run", "src/index.ts", "run",
        "--model", "llamacpp/qwopus",
        "--dangerously-skip-permissions",
        "--format", "json",
        "--dir", str(project_dir),
        "Write a Python function greet(name) that returns 'Hello, {name}!' in greet.py.",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, cwd="P:/local_ai_agents/localcoder/packages/localcoder")
    print(f"[LocalCoder Test] Return code: {result.returncode}")
    greet_py = project_dir / "greet.py"
    if greet_py.exists():
        print(f"[LocalCoder Test] greet.py created ({greet_py.stat().st_size} bytes)")
        print(f"[LocalCoder Test] Content:\n{greet_py.read_text()}")
        # Verify it works
        r = subprocess.run([sys.executable, str(greet_py)], capture_output=True, text=True)
        print(f"[LocalCoder Test] Running greet.py: returncode={r.returncode}")
        if r.returncode == 0:
            print("[LocalCoder Test] PASS")
            return True
    else:
        print("[LocalCoder Test] greet.py not created")
        print(f"STDOUT: {result.stdout[:500]}\nSTDERR: {result.stderr[:500]}")
    return False


def main():
    print("=" * 60)
    print("LOCALCODER STANDALONE TEST")
    print("=" * 60)
    proc = start_server()
    try:
        setup_localcoder_config()
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td)
            success = test_generate_code(project_dir)
        print("\n" + "=" * 60)
        if success:
            print("LOCALCODER STANDALONE TEST: PASSED")
        else:
            print("LOCALCODER STANDALONE TEST: FAILED")
        print("=" * 60)
    finally:
        proc.terminate()
        proc.wait(timeout=10)


if __name__ == "__main__":
    main()
