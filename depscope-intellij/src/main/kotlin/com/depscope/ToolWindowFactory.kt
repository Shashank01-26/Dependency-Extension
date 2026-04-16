package com.depscope

import com.google.gson.Gson
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import java.awt.*
import java.io.File
import java.nio.file.Paths
import javax.swing.*

// ── Webview bridge ────────────────────────────────────────────────────────────
// Allows InstallInterceptorServer (a singleton with no project reference) to
// post messages to the active JCEF dashboard panel and receive decisions back.

object DepScopeWebviewBridge {
    private val gson = Gson()

    @Volatile var activePanel: DepScopeDashboardPanel? = null
    @Volatile var activeProject: Project? = null
    /** Resolved by the webview when the user picks Continue or Cancel. */
    @Volatile var pendingInterceptResolve: ((Boolean) -> Unit)? = null

    fun postToWebview(message: Map<String, Any?>) {
        activePanel?.dispatchToWebview(message) ?: run {
            // Dashboard not open yet — open it first, then post after a short delay
            openToolWindow()
            ApplicationManager.getApplication().invokeLater {
                Thread.sleep(400)
                activePanel?.dispatchToWebview(message)
            }
        }
    }

    fun openToolWindow() {
        val project = activeProject ?: return
        ApplicationManager.getApplication().invokeLater {
            ToolWindowManager.getInstance(project).getToolWindow("DepScope")?.show()
        }
    }
}

class DepScopeToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = DepScopeDashboardPanel(project)
        val content = ContentFactory.getInstance().createContent(panel.component, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

class DepScopeDashboardPanel(private val project: Project) {
    private val gson = Gson()
    private val engine = AnalysisEngine(project)

    init {
        DepScopeWebviewBridge.activePanel   = this
        DepScopeWebviewBridge.activeProject = project
    }

    // Try JCEF first, fall back to Swing table if unavailable
    private val useJcef = try {
        Class.forName("com.intellij.ui.jcef.JBCefBrowser")
        true
    } catch (_: ClassNotFoundException) { false }

    private var browser: JBCefBrowser? = null
    private var jsQuery: JBCefJSQuery? = null
    private val fallback = SwingFallbackPanel(project, engine)

    val component: JComponent by lazy {
        if (useJcef) buildJcefComponent() else fallback.component
    }

    private fun buildJcefComponent(): JComponent {
        val b = JBCefBrowser()
        browser = b
        val q = JBCefJSQuery.create(b as JBCefBrowserBase)
        jsQuery = q

        // Handle messages sent from the React webview (analyze, export, loadSample, interceptDecision, etc.)
        q.addHandler { msg ->
            try {
                val json = gson.fromJson(msg, com.google.gson.JsonObject::class.java)
                when (json.get("type")?.asString) {
                    "analyze" -> {
                        val projectBase = project.basePath ?: return@addHandler null
                        val found = listOf("package.json", "pubspec.yaml", "build.gradle", "build.gradle.kts")
                            .mapNotNull { n -> File(projectBase, n).takeIf { it.exists() }?.absolutePath }
                            .firstOrNull()
                        if (found != null) engine.analyzeFile(found)
                    }
                    "loadSample" -> showSamplePicker()
                    "exportJson" -> {
                        engine.lastResult?.let { result ->
                            SwingUtilities.invokeLater {
                                val chooser = JFileChooser(project.basePath).apply {
                                    dialogTitle = "Save JSON Report"
                                    selectedFile = File("depscope-report.json")
                                }
                                if (chooser.showSaveDialog(component) == JFileChooser.APPROVE_OPTION) {
                                    chooser.selectedFile.writeText(gson.toJson(result))
                                    notify("DepScope: JSON report saved to ${chooser.selectedFile.name}", NotificationType.INFORMATION)
                                }
                            }
                        }
                    }
                    "interceptDecision" -> {
                        val proceed = json.get("proceed")?.asBoolean ?: true
                        DepScopeWebviewBridge.pendingInterceptResolve?.invoke(proceed)
                        DepScopeWebviewBridge.pendingInterceptResolve = null
                    }
                }
            } catch (_: Exception) {}
            null
        }

        engine.addResultListener { result ->
            SwingUtilities.invokeLater { sendResultToWebview(result) }
        }

        // Load the webview HTML
        loadWebview()

        val wrapper = JPanel(BorderLayout()).apply {
            background = Color(0x0d, 0x0f, 0x14)
            add(b.component, BorderLayout.CENTER)
        }
        return wrapper
    }

    private fun loadWebview() {
        val b = browser ?: return
        val q = jsQuery ?: return

        // Find webview.js — check plugin resources, then filesystem (dev mode)
        val webviewJs = loadWebviewJs()

        // Inject vscode API bridge + load React app
        val bridgeScript = """
            window.acquireVsCodeApi = (function() {
                var api = {
                    postMessage: function(msg) {
                        ${q.inject("JSON.stringify(msg)")}
                    },
                    getState: function() { return {}; },
                    setState: function(s) {}
                };
                return function() { return api; };
            })();
        """.trimIndent()

        val html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>DepScope</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    html, body { height: 100%; overflow: hidden; }
                    body { background: #0d0f14; color: #e2e8f0; font-family: 'Plus Jakarta Sans', sans-serif; }
                    #root { height: 100vh; overflow: auto; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #0d0f14; }
                    ::-webkit-scrollbar-thumb { background: #1e2130; border-radius: 3px; }
                </style>
                <script>$bridgeScript</script>
            </head>
            <body>
                <div id="root"></div>
                <script>$webviewJs</script>
            </body>
            </html>
        """.trimIndent()

        b.loadHTML(html)
    }

    private fun loadWebviewJs(): String {
        // 1. Try plugin resources (bundled)
        val resourceStream = javaClass.getResourceAsStream("/webview/webview.js")
        if (resourceStream != null) {
            return resourceStream.bufferedReader().readText()
        }

        // 2. Try filesystem — dev mode (sibling directory)
        val devPaths = listOf(
            Paths.get(System.getProperty("user.home"), "Downloads", "workspace", "DepScope-Extension", "depscope-vscode", "dist", "webview.js").toString(),
            Paths.get(System.getProperty("user.dir"), "..", "depscope-vscode", "dist", "webview.js").toString(),
        )
        for (path in devPaths) {
            val f = File(path)
            if (f.exists()) return f.readText()
        }

        // 3. Fallback message
        return """
            document.getElementById('root').innerHTML = '<div style="padding:40px;color:#94a3b8;font-family:sans-serif;text-align:center">' +
                '<div style="font-size:48px;margin-bottom:16px">🔨</div>' +
                '<h2 style="color:#e2e8f0;margin-bottom:12px">Webview not built</h2>' +
                '<p>Run this command first:</p>' +
                '<pre style="background:#13151c;padding:12px;border-radius:8px;margin-top:12px;color:#6366f1">cd depscope-vscode &amp;&amp; npm install &amp;&amp; npm run build</pre>' +
                '</div>';
        """.trimIndent()
    }

    private fun sendResultToWebview(result: ScanResult) {
        dispatchToWebview(mapOf("type" to "setResult", "result" to result))
    }

    fun dispatchToWebview(message: Map<String, Any?>) {
        val b = browser ?: return
        val json = gson.toJson(message).replace("\\", "\\\\").replace("`", "\\`")
        b.cefBrowser.executeJavaScript(
            """
            (function() {
                window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(`$json`) }));
            })();
            """.trimIndent(),
            b.cefBrowser.url ?: "", 0
        )
    }

    private fun showSamplePicker() {
        SwingUtilities.invokeLater {
            val samples = arrayOf(
                "npm-high-risk", "npm-low-risk",
                "flutter-high-risk", "flutter-low-risk",
                "android-high-risk", "android-low-risk"
            )
            val choice = JOptionPane.showInputDialog(
                component, "Select sample preset:", "Load Sample",
                JOptionPane.QUESTION_MESSAGE, null, samples, samples[0]
            ) as? String ?: return@invokeLater

            val sampleDeps = mapOf(
                "npm-high-risk" to ("npm" to listOf(
                    mapOf("name" to "lodash", "version" to "3.10.1", "isDev" to false),
                    mapOf("name" to "request", "version" to "2.88.2", "isDev" to false),
                    mapOf("name" to "event-stream", "version" to "3.3.4", "isDev" to false),
                    mapOf("name" to "left-pad", "version" to "1.3.0", "isDev" to false),
                    mapOf("name" to "node-uuid", "version" to "1.4.8", "isDev" to false),
                )),
                "npm-low-risk" to ("npm" to listOf(
                    mapOf("name" to "react", "version" to "18.3.0", "isDev" to false),
                    mapOf("name" to "typescript", "version" to "5.4.5", "isDev" to true),
                    mapOf("name" to "vite", "version" to "5.2.0", "isDev" to true),
                    mapOf("name" to "zod", "version" to "3.22.4", "isDev" to false),
                )),
                "flutter-high-risk" to ("flutter" to listOf(
                    mapOf("name" to "http", "version" to "0.12.0", "isDev" to false),
                    mapOf("name" to "uuid", "version" to "3.0.0", "isDev" to false),
                    mapOf("name" to "intl", "version" to "0.16.1", "isDev" to false),
                )),
                "flutter-low-risk" to ("flutter" to listOf(
                    mapOf("name" to "flutter_riverpod", "version" to "2.5.1", "isDev" to false),
                    mapOf("name" to "go_router", "version" to "13.2.0", "isDev" to false),
                    mapOf("name" to "dio", "version" to "5.4.3", "isDev" to false),
                )),
                "android-high-risk" to ("android" to listOf(
                    mapOf("name" to "com.google.code.gson:gson", "version" to "2.8.0", "isDev" to false),
                    mapOf("name" to "log4j:log4j", "version" to "1.2.17", "isDev" to false),
                )),
                "android-low-risk" to ("android" to listOf(
                    mapOf("name" to "com.squareup.retrofit2:retrofit", "version" to "2.11.0", "isDev" to false),
                    mapOf("name" to "com.squareup.okhttp3:okhttp", "version" to "4.12.0", "isDev" to false),
                )),
            )

            val (ecosystem, deps) = sampleDeps[choice] ?: return@invokeLater
            val request = mapOf(
                "type" to "analyze",
                "ecosystem" to ecosystem,
                "dependencies" to deps,
                "projectName" to choice
            )
            // Run analysis via a temporary engine call
            val settings = SettingsState.getInstance().state
            val fullRequest = request.toMutableMap().apply {
                if (settings.groqApiKey.isNotBlank()) put("groqApiKey", settings.groqApiKey)
                if (settings.githubToken.isNotBlank()) put("githubToken", settings.githubToken)
            }
            engine.analyzeWithRequest(fullRequest)
        }
    }

    private fun notify(msg: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("DepScope")
            .createNotification(msg, type)
            .notify(project)
    }
}

// ── Swing fallback (used when JCEF unavailable) ───────────────────────────────

class SwingFallbackPanel(private val project: Project, private val engine: AnalysisEngine) {
    val component: JPanel = JPanel(BorderLayout())
    private val BG      = Color(0x0d, 0x0f, 0x14)
    private val SURFACE = Color(0x13, 0x15, 0x1c)
    private val ACCENT  = Color(0x63, 0x66, 0xf1)
    private val TEXT    = Color(0xe2, 0xe8, 0xf0)
    private val MUTED   = Color(0x64, 0x74, 0x8b)
    private val BORDER  = Color(0x1e, 0x21, 0x30)
    private val tableModel = javax.swing.table.DefaultTableModel(
        arrayOf("Package", "Version", "Risk", "Score", "Downloads", "Flags"), 0
    )
    private val table = com.intellij.ui.table.JBTable(tableModel)
    private val statusLabel = com.intellij.ui.components.JBLabel("No analysis yet.")

    init {
        setupUI()
        engine.addResultListener { result ->
            SwingUtilities.invokeLater { updateTable(result) }
        }
    }

    private fun setupUI() {
        component.background = BG
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 8, 6)).apply { background = SURFACE }
        toolbar.add(JLabel("DepScope").apply { font = font.deriveFont(Font.BOLD, 14f); foreground = TEXT })
        toolbar.add(styledBtn("▶ Analyze", ACCENT, Color.WHITE) { startAnalysis() })
        toolbar.add(styledBtn("Open File", BORDER, TEXT) { chooseFile() })
        val statusBar = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4)).apply {
            background = SURFACE
            add(statusLabel.apply { foreground = MUTED })
        }
        val top = JPanel(BorderLayout()).apply {
            background = SURFACE
            add(toolbar, BorderLayout.NORTH); add(statusBar, BorderLayout.SOUTH)
        }
        setupTable()
        component.add(top, BorderLayout.NORTH)
        component.add(com.intellij.ui.components.JBScrollPane(table), BorderLayout.CENTER)
    }

    private fun styledBtn(text: String, bg: Color, fg: Color, action: () -> Unit) =
        JButton(text).apply {
            background = bg; foreground = fg; isFocusPainted = false; isOpaque = true
            border = BorderFactory.createEmptyBorder(6, 12, 6, 12)
            addActionListener { action() }
        }

    private fun setupTable() {
        table.apply {
            background = SURFACE; foreground = TEXT; gridColor = BORDER; rowHeight = 30
            font = Font(Font.MONOSPACED, Font.PLAIN, 12)
            tableHeader.apply { background = SURFACE; foreground = MUTED }
        }
    }

    private fun startAnalysis() {
        val base = project.basePath ?: return
        val found = listOf("package.json", "pubspec.yaml", "build.gradle", "build.gradle.kts")
            .mapNotNull { File(base, it).takeIf { f -> f.exists() }?.absolutePath }
            .firstOrNull()
        if (found != null) { statusLabel.text = "Analyzing..."; engine.analyzeFile(found) }
        else statusLabel.text = "No manifest found."
    }

    private fun chooseFile() {
        val chooser = JFileChooser(project.basePath)
        if (chooser.showOpenDialog(component) == JFileChooser.APPROVE_OPTION) {
            statusLabel.text = "Analyzing ${chooser.selectedFile.name}..."
            engine.analyzeFile(chooser.selectedFile.absolutePath)
        }
    }

    private fun updateTable(result: ScanResult) {
        statusLabel.text = "Score: ${result.summary.overallScore.toInt()}/100 ${result.summary.overallRiskLevel.uppercase()} · ${result.summary.totalDependencies} deps"
        tableModel.rowCount = 0
        result.dependencies.filter { it.depth <= 1 }.sortedByDescending { it.score.overall }.forEach { dep ->
            tableModel.addRow(arrayOf(
                dep.name, dep.version, dep.riskLevel,
                "${dep.score.overall.toInt()}/100",
                "${dep.registryData.weeklyDownloads / 1000}K/wk",
                dep.flags.joinToString(", ") { it.type }.take(40)
            ))
        }
    }
}
