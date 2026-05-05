"""Logging configuration for auto_scanner.

Provides a single :func:`setup_logger` entry point that wires up:

* a colorised console handler at INFO level (or DEBUG when verbose),
* a file handler at DEBUG level pointed at ``<run_dir>/scanner.log``.

Colours are only emitted when stdout is a TTY so logs piped to files or
captured by CI remain plain text.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Optional


_LEVEL_COLORS = {
    logging.DEBUG: "\033[37m",     # light grey
    logging.INFO: "\033[36m",      # cyan
    logging.WARNING: "\033[33m",   # yellow
    logging.ERROR: "\033[31m",     # red
    logging.CRITICAL: "\033[1;31m",  # bold red
}
_RESET = "\033[0m"


class _ColorFormatter(logging.Formatter):
    """A formatter that prefixes the level name with an ANSI colour."""

    def __init__(self, fmt: str, datefmt: Optional[str] = None, use_color: bool = True) -> None:
        super().__init__(fmt=fmt, datefmt=datefmt)
        self.use_color = use_color

    def format(self, record: logging.LogRecord) -> str:
        message = super().format(record)
        if not self.use_color:
            return message
        color = _LEVEL_COLORS.get(record.levelno, "")
        if not color:
            return message
        return f"{color}{message}{_RESET}"


def setup_logger(run_dir: Path, verbose: bool = False) -> logging.Logger:
    """Configure and return the root ``auto_scanner`` logger.

    Parameters
    ----------
    run_dir:
        Directory where the per-run ``scanner.log`` file should live. The
        directory must already exist.
    verbose:
        When ``True`` the console handler runs at DEBUG instead of INFO.
    """

    logger = logging.getLogger("auto_scanner")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    logger.propagate = False

    console_level = logging.DEBUG if verbose else logging.INFO
    console = logging.StreamHandler(stream=sys.stdout)
    console.setLevel(console_level)
    console.setFormatter(
        _ColorFormatter(
            fmt="[%(asctime)s] %(levelname)-8s %(name)s :: %(message)s",
            datefmt="%H:%M:%S",
            use_color=sys.stdout.isatty(),
        )
    )
    logger.addHandler(console)

    log_path = run_dir / "scanner.log"
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] %(levelname)-8s %(name)s :: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logger.addHandler(file_handler)

    logger.debug("Logger initialised. Log file: %s", log_path)
    return logger


def get_logger(name: str) -> logging.Logger:
    """Return a child of the ``auto_scanner`` logger."""

    return logging.getLogger(f"auto_scanner.{name}")
