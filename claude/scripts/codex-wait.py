#!/usr/bin/env python3
"""Watchdog wait for Codex companion background tasks.

The companion's `status --json` keeps reporting status "running" after the
worker process dies, so any wait loop that trusts the status string alone can
block for hours on a hung job. This script polls status AND verifies the hang
signature directly: worker pid dead, or updatedAt frozen past a threshold.
On hang it cancels the job and exits 2 so the caller can retry immediately
with `task --resume` (context is kept by the Codex thread).

Usage:
    codex-wait.py [job_id] [--timeout SECS] [--poll SECS] [--stale SECS]

Behavior:
    - job_id omitted: watches the first running job.
    - No running job: prints the latest result and exits 0.
    - Hang detected (pid dead, or updatedAt older than --stale, default
      1800s): cancels the job, exits 2.
    - --timeout (default 7200s) exceeded: exits 4 without cancelling.

Exit codes: 0 done (result printed), 2 hang detected + cancelled,
3 companion script not found, 4 timeout.
"""

import glob
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone


def newest_companion():
    paths = sorted(
        glob.glob(
            os.path.expanduser(
                "~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs"
            )
        )
    )
    return paths[-1] if paths else None


def companion(cmd_path, *args):
    proc = subprocess.run(
        ["node", cmd_path, *args], capture_output=True, text=True, timeout=120
    )
    return proc.stdout


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except (ValueError, OSError):
        return False


def parse_iso(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def main():
    job_filter = None
    timeout, poll, stale_limit = 7200, 20, 1800
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--timeout":
            timeout = int(args[i + 1]); i += 2
        elif args[i] == "--poll":
            poll = int(args[i + 1]); i += 2
        elif args[i] == "--stale":
            stale_limit = int(args[i + 1]); i += 2
        else:
            job_filter = args[i]; i += 1

    cmd_path = newest_companion()
    if not cmd_path:
        print("codex-companion.mjs not found under ~/.claude/plugins", file=sys.stderr)
        return 3

    start = time.time()
    while True:
        if time.time() - start > timeout:
            print(f"codex-wait: timeout after {timeout}s; job left running", file=sys.stderr)
            return 4

        try:
            status = json.loads(companion(cmd_path, "status", "--json"))
        except (json.JSONDecodeError, subprocess.TimeoutExpired):
            time.sleep(poll)
            continue

        running = [
            j
            for j in status.get("running", [])
            if j.get("kind") == "task" and (not job_filter or j.get("id") == job_filter)
        ]
        if not running:
            out = companion(cmd_path, "result", "--latest")
            if not out.strip():
                out = companion(cmd_path, "result")
            print(out)
            return 0

        job = running[0]
        pid = job.get("pid")
        updated = parse_iso(job.get("updatedAt", ""))
        stale_secs = (
            (datetime.now(timezone.utc) - updated).total_seconds() if updated else 0
        )

        dead = not pid_alive(pid)
        frozen = stale_secs > stale_limit
        if dead or frozen:
            reason = f"pid {pid} dead" if dead else f"updatedAt frozen {int(stale_secs)}s"
            print(
                f"HANG DETECTED ({reason}) on {job.get('id')}; cancelling. "
                f"Retry with: task --resume <original prompt>",
                file=sys.stderr,
            )
            companion(cmd_path, "cancel", job.get("id"))
            return 2

        time.sleep(poll)


if __name__ == "__main__":
    sys.exit(main())
