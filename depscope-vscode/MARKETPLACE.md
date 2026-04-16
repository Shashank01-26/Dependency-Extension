# DepScope — Dependency Risk Analyzer

**Know the risk before you install.**

DepScope analyzes the health, security, and maintenance status of your project's dependencies — directly inside VS Code, before a single package touches your project.

Supports **npm** (package.json), **Flutter/Dart** (pubspec.yaml), and **Android/Java** (build.gradle).

---

## Install Interception

When you run `npm install`, `yarn add`, `pnpm add`, or `flutter pub add` inside a VS Code terminal, DepScope automatically:

1. **Blocks** the installation
2. **Analyzes** the package in real time
3. **Shows** a risk report in the dashboard
4. **Asks** you to Continue or Cancel the install

No package hits your project until you approve it.

---

## Features

- **Risk Scoring** — Composite 0–100 score per package across 5 weighted dimensions:
  - Security (30%): known CVEs and vulnerability severity
  - Maintenance (25%): last publish date, deprecation, version frequency
  - Community (15%): maintainer count, open issue ratio, commit recency
  - Popularity (15%): weekly downloads, GitHub stars
  - Depth (15%): transitive dependency chain depth and size

- **Risk Flags** — Instant warnings for `deprecated`, `unmaintained`, `stale`, `vulnerable`, `low-popularity`, `single-maintainer`, `deep-chain`, `archived`

- **Interactive Dashboard** — Score ring, stat cards, sortable/filterable dependency table, dependency graph, and AI-powered insights

- **CodeLens Badges** — Inline risk indicators next to each dependency in your manifest files

- **Diagnostics** — Red/yellow squiggles for critical/high risk packages directly in the editor

- **Sidebar Tree View** — All dependencies grouped by risk level

- **Status Bar** — Live overall risk score in the editor footer

- **AI Insights** — Powered by Groq (llama-3.3-70b-versatile); falls back to rule-based analysis if no key is configured

- **Export** — Download full reports as JSON or CSV

---

## Supported Package Managers

| Command | Ecosystem |
|---------|-----------|
| `npm install` / `npm add` | Node.js |
| `yarn add` | Node.js |
| `pnpm add` / `pnpm install` | Node.js |
| `flutter pub add` | Flutter/Dart |

---

## Risk Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 70–100 | CRITICAL | Immediate action required |
| 45–69 | HIGH | Address soon |
| 25–44 | MEDIUM | Monitor and plan upgrades |
| 0–24 | LOW | Healthy dependency |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `depscope.interceptInstalls` | `true` | Block installs and run analysis before proceeding |
| `depscope.autoProceedBelowRisk` | `low` | Auto-proceed without prompting for packages at or below this risk level |
| `depscope.groqApiKey` | `""` | Groq API key for AI-powered insights |
| `depscope.githubToken` | `""` | GitHub token for higher API rate limits (5,000 req/hr vs 60) |
| `depscope.maxDepth` | `3` | Max transitive dependency depth to analyze |
| `depscope.concurrency` | `5` | Parallel registry requests |
| `depscope.autoAnalyzeOnOpen` | `true` | Auto-analyze when a workspace opens |
| `depscope.showCodeLens` | `true` | Show inline risk badges in manifest files |

---

## Commands

| Command | How to trigger |
|---------|---------------|
| DepScope: Analyze Dependencies | Command Palette / Activity Bar |
| DepScope: Analyze This File | Right-click any manifest file |
| DepScope: Open Dashboard | Command Palette |
| DepScope: Load Sample Data | Command Palette — no project needed |
| DepScope: Export as JSON | Command Palette / Dashboard |
| DepScope: Export as CSV | Command Palette / Dashboard |

---

## Getting API Keys (optional)

| Key | Where to get it |
|-----|----------------|
| Groq API Key | [console.groq.com](https://console.groq.com) — free |
| GitHub Token | GitHub → Settings → Developer settings → Personal access tokens |

---

## License

MIT
