# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.2.8] - 2026-03-05

### Fixed
- Prevent orchestrator from overriding reviewer verdicts — add verdict integrity rules across all review layers (89ae7b2)

## [0.2.7] - 2026-03-05

### Fixed
- Add config validation and robust capture config detection for visual review axis (2474670)

## [0.2.6] - 2026-03-05

### Fixed
- Prevent implementation drift after ExitPlanMode with 3-layer defense: REFERENCE DATA delimiters, self-contained instruction section, structural separation (8412a64)

## [0.2.5] - 2026-03-05

### Added
- Builtin visual-reviewer axis with capture strategies (c11be9c)

### Fixed
- Use null+claim strategy for session_id to prevent stop hook loop termination due to session mismatch (83118ad)
