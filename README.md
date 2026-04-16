# DepScope — Dependency Risk Analyzer

A production-grade IDE extension for **VS Code** and **IntelliJ IDEA** that analyzes the health, security, and maintenance risk of your project's dependencies — without leaving the editor.

Supports **npm** (package.json), **Flutter/Dart** (pubspec.yaml), and **Android/Java** (build.gradle).

---

## Features

- **Risk Scoring** — Composite 0–100 score per package across 5 weighted dimensions:
  - Maintenance (25%): last publish date, deprecation, version frequency
  - Security (30%): known CVEs and vulnerability severity
  - Popularity (15%): weekly downloads, GitHub stars
  - Community (15%): maintainer count, open issue ratio, commit recency
  - Depth (15%): transitive dependency chain depth and size
- **Risk Flags** — `deprecated`, `unmaintained`, `stale`, `vulnerable`, `low-popularity`, `single-maintainer`, `deep-chain`, `archived`
- **Interactive Dashboard** — Score ring, stat cards, sortable/filterable table, dependency graph, AI insights
- **CodeLens / Gutter Icons** — Inline risk badges next to each dependency in manifest files
- **Diagnostics** — Red/yellow squiggles for critical/high risk packages
- **Sidebar Tree View** — Dependencies grouped by risk level (VS Code)
- **Status Bar** — Live risk score in the editor footer
- **AI Insights** — Powered by Groq API (llama-3.3-70b-versatile); falls back to rule-based analysis if key is absent
- **Export** — JSON and CSV reports

---

## Project Structure

```
DepScope-Extension/
├── depscope-core/          # Shared Node.js analysis engine (IPC subprocess)
├── depscope-vscode/        # VS Code extension
└── depscope-intellij/      # IntelliJ IDEA plugin
```

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|-------------|
| Node.js | >= 18.0.0 | Core engine + VS Code extension |
| npm | >= 9.0.0 | Core engine + VS Code extension |
| VS Code | >= 1.85.0 | VS Code extension |
| JDK | 21 | IntelliJ plugin |
| Gradle | >= 8.6 | IntelliJ plugin (wrapper auto-generated) |

**Optional but recommended:**
- [Groq API key](https://console.groq.com) — free, enables AI insights
- GitHub personal access token — raises API rate limit from 60 to 5,000 req/hr

---

## Quick Start (from scratch)

### 1. Clone / open the project

```bash
cd /Users/shashank/Downloads/workspace/DepScope-Extension
```

### 2. Build the shared core engine (required by both extensions)

```bash
cd depscope-core
npm install
npm run build
```

Verify it works:

```bash
echo '{"type":"ping"}' | node dist/index.js
# Expected output: {"success":true}
```

---

## Running the VS Code Extension

### Step 1 — Install dependencies and build

```bash
cd depscope-vscode
npm install
npm run build
```

### Step 2 — Open in VS Code

```bash
code .
```

Or open VS Code manually and use **File → Open Folder** → select `depscope-vscode/`.

### Step 3 — Launch the Extension Development Host

Press **F5** (or go to **Run → Start Debugging**).

A second VS Code window opens — this is the sandbox with DepScope active.

### Step 4 — Open a project to analyze

In the new window, open any folder that contains a `package.json`, `pubspec.yaml`, or `build.gradle`.

Example — open a Node project:
```bash
# In the Extension Dev Host window:
File → Open Folder → pick any project with package.json
```

### Step 5 — Run an analysis

**Option A — Command Palette:**
`Cmd+Shift+P` → type **DepScope: Analyze Dependencies** → Enter

**Option B — Activity Bar:**
Click the shield icon on the left sidebar → DepScope panel opens → click **Analyze**

**Option C — Right-click:**
Right-click `package.json` in the Explorer → **DepScope: Analyze This File**

**Option D — Load sample data (no project needed):**
`Cmd+Shift+P` → **DepScope: Load Sample Data** → pick a preset (e.g. `npm-high-risk`)

### Step 6 — View the dashboard

`Cmd+Shift+P` → **DepScope: Open Dashboard**

The panel shows:
- Score ring + 8 stat cards
- **Table tab** — sortable dependency list, click any row to expand details
- **Graph tab** — interactive radial dependency graph
- **AI Insights tab** — risk summary and recommendations

### Add API Keys (VS Code)

`Cmd+,` → search **depscope** → fill in:

| Setting | Where to get it |
|---------|----------------|
| `depscope.groqApiKey` | [console.groq.com](https://console.groq.com) → API Keys |
| `depscope.githubToken` | GitHub → Settings → Developer settings → Personal access tokens |

Or paste directly into `settings.json`:
```json
{
  "depscope.groqApiKey": "gsk_xxxxxxxxxxxxxxxxxxxx",
  "depscope.githubToken": "ghp_xxxxxxxxxxxxxxxxxxxx"
}
```

### Package as .vsix (for permanent install)

```bash
cd depscope-vscode
npm install -g @vscode/vsce
vsce package
# Produces: depscope-1.0.0.vsix

# Install permanently:
code --install-extension depscope-1.0.0.vsix
```

---

## Running the IntelliJ Plugin

### Prerequisites

Make sure JDK 21 is installed:
```bash
/usr/libexec/java_home -V
# Should show openjdk 21 or similar
```

### Step 1 — Generate the Gradle wrapper (first time only)

```bash
cd depscope-intellij
JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home \
  gradle wrapper --gradle-version 8.9
```

### Step 2 — Launch the sandboxed IDE

```bash
cd depscope-intellij
JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home \
  ./gradlew runIde
```

> First run downloads IntelliJ IDEA Community (~600 MB). Subsequent runs are fast.

### Step 3 — Open a project

In the sandboxed IntelliJ window that opens:
**File → Open** → select any project folder with `package.json`, `pubspec.yaml`, or `build.gradle`

### Step 4 — Open DepScope

**Option A:** Look for the **DepScope** tab on the right edge of the IDE → click it

**Option B:** View → Tool Windows → **DepScope**

**Option C:** Right-click `package.json` / `pubspec.yaml` / `build.gradle` → **Analyze with DepScope**

### Step 5 — Run an analysis

In the DepScope tool window:
1. Click **▶ Analyze** — automatically finds a manifest in the project root
2. Or click **Open File** — pick any manifest file manually

### Add API Keys (IntelliJ)

**Settings → Tools → DepScope** → fill in Groq API Key and GitHub Token fields → **Apply**

### Build as .zip (for permanent install)

```bash
./gradlew buildPlugin
# Produces: build/distributions/depscope-intellij-1.0.0.zip
```

Install: **Settings → Plugins → ⚙ → Install Plugin from Disk** → select the `.zip`

---

## All Available Commands (VS Code)

| Command | Trigger |
|---------|---------|
| DepScope: Analyze Dependencies | Command Palette / Activity Bar |
| DepScope: Analyze This File | Right-click manifest file |
| DepScope: Open Dashboard | Command Palette |
| DepScope: Load Sample Data | Command Palette — no project needed |
| DepScope: Export as JSON | Command Palette / Dashboard button |
| DepScope: Export as CSV | Command Palette / Dashboard button |

---

## Risk Score Reference

| Score | Level | Color | Meaning |
|-------|-------|-------|---------|
| 70–100 | CRITICAL | 🔴 Red | Immediate action required |
| 45–69 | HIGH | 🟠 Orange | Address soon |
| 25–44 | MEDIUM | 🟡 Amber | Monitor and plan upgrades |
| 0–24 | LOW | 🟢 Green | Healthy dependency |

---

## All Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `depscope.groqApiKey` | `""` | Groq API key for AI insights |
| `depscope.githubToken` | `""` | GitHub token for higher rate limits |
| `depscope.maxDepth` | `3` | Max transitive dependency depth to resolve |
| `depscope.concurrency` | `5` | Parallel registry requests |
| `depscope.autoAnalyzeOnOpen` | `true` | Auto-analyze when workspace opens |
| `depscope.showCodeLens` | `true` | Show inline risk badges in manifest files |

---

## Architecture

Both extensions share one analysis engine running as a Node.js subprocess:

```
VS Code / IntelliJ
       │
       │  stdin: JSON request
       ▼
 depscope-core (Node.js)
  ├── input-parser.ts   → parse package.json / pubspec.yaml / build.gradle
  ├── npm-client.ts     → npm registry, downloads, CVE advisories
  ├── pub-client.ts     → pub.dev API
  ├── maven-client.ts   → Maven Central API
  ├── github-client.ts  → GitHub REST API (stars, commits, archived)
  ├── risk-engine.ts    → score calculation across 5 dimensions
  ├── ai-insights.ts    → Groq/Llama3.3 + rule-based fallback
  └── analyzer.ts       → concurrency-controlled orchestrator
       │
       │  stdout: JSON result
       ▼
VS Code / IntelliJ → dashboard, diagnostics, CodeLens, status bar
```

---

## Troubleshooting

**`zsh: no such file or directory: ./gradlew`**
→ Generate the wrapper first:
```bash
JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home \
  gradle wrapper --gradle-version 8.9
```

**`Cannot find a Java installation matching languageVersion=17`**
→ The build.gradle.kts uses JDK 21. Make sure you run with the correct `JAVA_HOME` as shown above.

**`Could not find depscope-core`**
→ Build the core first:
```bash
cd depscope-core && npm install && npm run build
```

**Extension shows no settings in VS Code**
→ The extension must be running (F5 / Extension Dev Host active). Settings only appear once the extension is loaded.

**Analysis returns zeros / no data**
→ The engine fetches live data — check your internet connection.

**GitHub rate limit hit**
→ Add a GitHub token in settings. Free tokens give 5,000 req/hr vs 60 unauthenticated.

**AI Insights tab shows rule-based cards only**
→ Expected without a Groq key. Add `depscope.groqApiKey` to get LLM-generated insights.

**CodeLens badges not visible**
→ Ensure `depscope.showCodeLens` is `true` and an analysis has been run first.

---

## License

MIT
