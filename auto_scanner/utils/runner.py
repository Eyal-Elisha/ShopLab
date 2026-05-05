"""Subprocess runner used by every scanner wrapper.

The orchestrator never invokes :mod:`subprocess` directly; everything
goes through :func:`run_command` so timeout handling, log capture and
"binary missing" errors are reported uniformly.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence

from .logger import get_logger


_log = get_logger("runner")


@dataclass
class CommandResult:
    """Outcome of a single external command invocation."""

    cmd: List[str]
    returncode: int
    stdout: str = ""
    stderr: str = ""
    duration: float = 0.0
    timed_out: bool = False
    not_found: bool = False
    log_path: Optional[Path] = None
    extras: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        """``True`` when the process exited cleanly without timing out."""

        return (
            not self.not_found
            and not self.timed_out
            and self.returncode == 0
        )


def which(binary: str) -> Optional[str]:
    """Thin wrapper over :func:`shutil.which` for explicit naming."""

    return shutil.which(binary)


def _path_runnable(p: Path) -> bool:
    """True if the file looks invokable (incl. Windows ``.exe`` under WSL)."""

    try:
        if not p.is_file():
            return False
    except OSError:
        return False
    # WSL runs PE binaries without the Unix executable bit.
    if p.suffix.lower() == ".exe":
        return os.access(p, os.R_OK)
    return os.access(p, os.X_OK)


def _argv0_resolves(argv0: str) -> bool:
    """True when ``argv0`` names an executable we can actually spawn."""

    raw = str(Path(argv0).expanduser())
    # Absolute / explicit paths must exist — ``shutil.which`` alone misses many.
    if os.path.isabs(raw) or raw.startswith(("./", "../")):
        try:
            return _path_runnable(Path(raw))
        except OSError:
            return False
    return shutil.which(raw) is not None


def docker_cli() -> Optional[str]:
    """Resolve a usable ``docker`` executable path.

    Docker Desktop on WSL often leaves ``docker`` on ``PATH`` as a stub that
    exits with *The command docker could not be found in this WSL 2 distro*
    until **Settings → Resources → WSL integration** is enabled for your
    distro. The real Linux client is usually bundled under
    ``/mnt/wsl/docker-desktop/cli-tools/`` — but that tree is **often empty**
    (Docker Desktop mount issues). Fall back to Docker Desktop's Windows
    ``docker.exe`` under ``/mnt/c/Program Files/Docker/...``, which WSL can run.

    If ``AUTO_SCANNER_DOCKER`` or ``DOCKER_BIN`` is set, that path wins **without**
    falling through to ``PATH`` — avoids silently ignoring a typo or missing file.
    """

    for key in ("AUTO_SCANNER_DOCKER", "DOCKER_BIN"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            return str(Path(raw).expanduser())

    candidates = (
        "/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker",
        "/mnt/wsl/docker-desktop/cli-tools/docker",
        "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe",
        "/mnt/c/Program Files/Docker/Docker/resources/bin/docker",
        "/usr/local/bin/docker",
    )
    for raw in candidates:
        try:
            p = Path(raw).expanduser().resolve()
            if _path_runnable(p):
                return str(p)
        except OSError:
            continue
    return shutil.which("docker")


def run_command(
    cmd: Sequence[str],
    *,
    timeout: int = 600,
    cwd: Optional[Path] = None,
    log_path: Optional[Path] = None,
    env: Optional[dict] = None,
) -> CommandResult:
    """Run ``cmd`` and return a :class:`CommandResult`.

    The function never raises for the standard failure modes (missing
    binary, non-zero exit, timeout); callers should branch on
    :attr:`CommandResult.ok` and the dedicated flags.
    """

    cmd_list = list(cmd)
    pretty = " ".join(cmd_list)
    _log.debug("$ %s", pretty)

    if not cmd_list:
        return CommandResult(cmd=cmd_list, returncode=-1, not_found=True)

    if not _argv0_resolves(cmd_list[0]):
        _log.warning("Binary not found or not executable: %s", cmd_list[0])
        return CommandResult(cmd=cmd_list, returncode=-1, not_found=True)

    start = time.monotonic()
    try:
        # Tools like dirb may emit Latin-1/other bytes on stdout/stderr; strict
        # UTF-8 raises UnicodeDecodeError mid-run. Replace undecodable bytes.
        proc = subprocess.run(
            cmd_list,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
            env=env,
            check=False,
        )
        duration = time.monotonic() - start
        result = CommandResult(
            cmd=cmd_list,
            returncode=proc.returncode,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            duration=duration,
        )
    except subprocess.TimeoutExpired as exc:
        duration = time.monotonic() - start
        _log.error("Command timed out after %ds: %s", timeout, pretty)
        result = CommandResult(
            cmd=cmd_list,
            returncode=-1,
            stdout=(exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")),
            stderr=(exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")),
            duration=duration,
            timed_out=True,
        )
    except FileNotFoundError:
        _log.warning("Binary disappeared between which() and exec: %s", cmd_list[0])
        return CommandResult(cmd=cmd_list, returncode=-1, not_found=True)
    except OSError as exc:
        duration = time.monotonic() - start
        _log.error("OS error running %s: %s", pretty, exc)
        result = CommandResult(
            cmd=cmd_list,
            returncode=-1,
            stderr=str(exc),
            duration=duration,
        )

    if log_path is not None:
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with log_path.open("w", encoding="utf-8") as fh:
                fh.write(f"# command: {pretty}\n")
                fh.write(f"# returncode: {result.returncode}\n")
                fh.write(f"# duration: {result.duration:.2f}s\n")
                fh.write(f"# timed_out: {result.timed_out}\n")
                fh.write("\n----- STDOUT -----\n")
                fh.write(result.stdout)
                fh.write("\n----- STDERR -----\n")
                fh.write(result.stderr)
            result.log_path = log_path
        except OSError as exc:
            _log.error("Failed to write log file %s: %s", log_path, exc)

    _log.debug(
        "Command finished rc=%s duration=%.2fs timed_out=%s",
        result.returncode,
        result.duration,
        result.timed_out,
    )
    return result
