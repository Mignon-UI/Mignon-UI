# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Plain-text Contributor License Agreement assent workflow with automated checks.
- Private repository tracking for contributor assents (`Mignon-CLA`).
- Repository `.gitattributes` configuration to normalize language statistics.

### Changed
- Refactored update-checking endpoints to use the renamed `Mignon-UI` organization path.
- Updated documentation and links to reflect organization rename.

## [1.0.1-beta] - 2026-06-28

### Fixed
- Resolved ESLint styling rules in React frontend.
- Standardized Rust formatting in the Tauri backend for CI/CD checks.

## [1.0.0-beta] - 2026-06-15

### Added
- Initial beta release of Mignon UI.
- Local SQLite database handling and local AI model integration.
- Custom NSIS installer and uninstaller configurations with brand icons for Windows builds.
