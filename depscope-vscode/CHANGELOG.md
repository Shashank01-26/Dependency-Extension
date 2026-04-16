# Changelog

All notable changes to DepScope will be documented in this file.

## [1.0.0] - 2026-04-16

### Added
- Risk scoring across 5 dimensions: security vulnerabilities, maintenance activity, version freshness, license compliance, and community health
- Interactive dashboard with dependency table, risk graph, and AI-powered insights (Groq API)
- CodeLens badges showing inline risk scores next to dependencies in manifest files
- Diagnostics (squiggles) for critical and high-risk packages
- Sidebar tree view grouping dependencies by risk level
- Status bar showing live composite risk score
- Install interceptor to warn or block risky package installs (npm, yarn, pnpm, Flutter)
- JSON and CSV export of analysis results
- Support for npm (`package.json`), Flutter/Dart (`pubspec.yaml`), and Android/Java (`build.gradle`)
- Optional GitHub token support for increased API rate limits
