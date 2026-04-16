# DepScope — Developer Setup Guide

This document covers how to build, run, and develop the DepScope VS Code extension locally.

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|-------------|
| Node.js | >= 18.0.0 | Core engine + VS Code extension |
| npm | >= 9.0.0 | Core engine + VS Code extension |
| VS Code | >= 1.85.0 | VS Code extension |

**Optional but recommended:**
- [Groq API key](https://console.groq.com) — free, enables AI insights
- GitHub personal access token — raises API rate limit from 60 to 5,000 req/hr

---

## Project Structure

```
DepScope-Extension/
├── depscope-core/          # Shared Node.js analysis engine (IPC subprocess)
└── extension/
    └── depscope-vscode/    # VS Code extension
```

---

## Local Setup & Run

### 1. Build the shared core engine

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

### 2. Install dependencies and build the extension

```bash
cd extension/depscope-vscode
npm install
npm run build
```

The `build` script compiles the extension, webview, bundles the core, and copies `intercept-helper.js` to `dist/`.

---

### 3. Open in VS Code

```bash
code .
```

Or open VS Code manually: **File → Open Folder** → select `extension/depscope-vscode/`.

---

### 4. Launch the Extension Development Host

Press **F5** (or go to **Run → Start Debugging**).

A second VS Code window opens — this is the sandbox with DepScope active.

---

### 5. Open a project to analyze

In the new window, open any folder that contains a `package.json`, `pubspec.yaml`, or `build.gradle`.

---

### 6. Run an analysis

**Option A — Command Palette:**
`Cmd+Shift+P` → **DepScope: Analyze Dependencies** → Enter

**Option B — Activity Bar:**
Click the shield icon on the left sidebar → DepScope panel opens → click **Analyze**

**Option C — Right-click:**
Right-click `package.json` in the Explorer → **DepScope: Analyze This File**

**Option D — Load sample data (no project needed):**
`Cmd+Shift+P` → **DepScope: Load Sample Data** → pick a preset

---

### Add API Keys

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

---

## Package as .vsix

```bash
cd extension/depscope-vscode
npm install -g @vscode/vsce
npm run package
# Produces: depscope-analyzer-1.0.0.vsix
# Uses MARKETPLACE.md as the marketplace description

# Install permanently:
code --install-extension depscope-analyzer-1.0.0.vsix
```

---

## Troubleshooting

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

**Install interception not working after publishing**
→ Ensure you ran `npm run build` before `npm run package` so `dist/intercept-helper.js` is present in the VSIX.

**AI Insights tab shows rule-based cards only**
→ Expected without a Groq key. Add `depscope.groqApiKey` to get LLM-generated insights.

**CodeLens badges not visible**
→ Ensure `depscope.showCodeLens` is `true` and an analysis has been run first.
