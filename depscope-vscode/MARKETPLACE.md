# DepScope — Dependency Risk Analyzer

**Know the risk before you install.**

DepScope is a VS Code extension that analyzes the health, security, and maintenance status of your project's dependencies — right inside your editor, before any package touches your project.

---

## What Is DepScope?

Modern projects pull in hundreds of dependencies, and any one of them can introduce security vulnerabilities, maintenance debt, or hidden complexity. DepScope gives you a clear risk picture of every package you depend on — without leaving VS Code.

It intercepts package install commands in real time, runs a multi-dimensional analysis, and lets you decide whether to proceed — all before a single file is written to your project.

Supports **npm** (package.json), **Flutter/Dart** (pubspec.yaml), and **Android/Java** (build.gradle).

---

## What Does It Do?

### Install Interception

When you run `npm install`, `yarn add`, `pnpm add`, or `flutter pub add` inside the VS Code terminal, DepScope automatically:

1. **Blocks** the installation
2. **Analyzes** the package in real time
3. **Shows** a full risk report in the dashboard
4. **Asks** you to Continue or Cancel

No package is written to your project until you approve it.

### Risk Scoring

Every package receives a composite **0–100 risk score** built from five weighted dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Security | 30% | Known CVEs, vulnerability severity |
| Maintenance | 25% | Last publish date, deprecation, version frequency |
| Community | 15% | Maintainer count, open issue ratio, commit recency |
| Popularity | 15% | Weekly downloads, GitHub stars |
| Depth | 15% | Transitive dependency chain depth and size |

### Risk Levels

| Score | Level | What It Means |
|-------|-------|---------------|
| 70–100 | CRITICAL | Immediate action required |
| 45–69 | HIGH | Address soon |
| 25–44 | MEDIUM | Monitor and plan upgrades |
| 0–24 | LOW | Healthy dependency |

### Risk Flags

Instant warnings are surfaced for packages flagged as: `deprecated`, `unmaintained`, `stale`, `vulnerable`, `low-popularity`, `single-maintainer`, `deep-chain`, or `archived`.

### Interactive Dashboard

- Score ring and stat cards for a quick health overview
- Sortable and filterable dependency table
- Visual dependency graph
- AI-powered insights (via Groq)

### Editor Integration

- **CodeLens Badges** — Inline risk indicators next to each dependency in your manifest files
- **Diagnostics** — Red/yellow squiggles for critical/high risk packages directly in the editor
- **Sidebar Tree View** — All dependencies grouped by risk level
- **Status Bar** — Live overall risk score in the editor footer

### Export

Download full dependency reports as **JSON** or **CSV** for audits or team reviews.

---

## How to Set Up and Use It

### 1. Install the Extension

Search for **DepScope** in the VS Code Extensions Marketplace and click Install.

### 2. Open a Project

Open any project containing a `package.json`, `pubspec.yaml`, or `build.gradle` file. DepScope will automatically analyze dependencies when the workspace opens.

### 3. Analyze Your Dependencies

You can trigger analysis at any time using:

| Command | How to Trigger |
|---------|----------------|
| DepScope: Analyze Dependencies | Command Palette or Activity Bar |
| DepScope: Analyze This File | Right-click any manifest file |
| DepScope: Open Dashboard | Command Palette |
| DepScope: Load Sample Data | Command Palette — no project needed |
| DepScope: Export as JSON | Command Palette or Dashboard |
| DepScope: Export as CSV | Command Palette or Dashboard |

### 4. Configure Settings (Optional)

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

### 5. Get API Keys (Optional but Recommended)

| Key | Where to Get It |
|-----|----------------|
| **Groq API Key** | [console.groq.com](https://console.groq.com) — free tier available; enables AI-powered insights |
| **GitHub Token** | GitHub → Settings → Developer Settings → Personal Access Tokens; increases rate limits from 60 to 5,000 requests/hr |

If no Groq key is configured, DepScope falls back to rule-based analysis automatically.

---

## Supported Package Managers

| Command | Ecosystem |
|---------|-----------|
| `npm install` / `npm add` | Node.js |
| `yarn add` | Node.js |
| `pnpm add` / `pnpm install` | Node.js |
| `flutter pub add` | Flutter/Dart |

---

## License

MIT
