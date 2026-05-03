"""Shared utilities for the auto_scanner orchestrator.

Modules:
    logger            - colorized console + file logging setup
    runner            - safe subprocess wrapper with timeout handling
    parser            - regex / json helpers shared between scanners
    dedupe            - de-duplicates findings across scanners
    report_generator  - writes JSON and HTML reports
"""
