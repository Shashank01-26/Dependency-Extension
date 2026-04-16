package com.depscope

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.ide.plugins.PluginManagerCore
import org.jetbrains.plugins.terminal.LocalTerminalCustomizer
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Intercepts package-manager install commands typed in IntelliJ terminals.
 *
 * Architecture:
 *  1. [InstallInterceptorServer] starts a TCP server on localhost (random port).
 *  2. [DepScopeTerminalCustomizer] (registered as a LocalTerminalCustomizer extension)
 *     injects DEPSCOPE_PORT and DEPSCOPE_HELPER_SCRIPT env vars into every new terminal
 *     session so the shell wrapper can reach the server.
 *  3. When the wrapper calls intercept-helper.js, the server receives the request,
 *     runs DepScope analysis on that single package, shows a blocking dialog to the
 *     user, and responds with { "proceed": true|false }.
 */

// ── Bundled script resolver ───────────────────────────────────────────────────
//
// Scripts are bundled as plugin resources at build time (see build.gradle.kts
// copyNodeScripts task).  At first use they are extracted to a temp directory
// so they can be executed by the OS.

object BundledScripts {

    private val pluginDir: File? by lazy {
        PluginManagerCore.getPlugin(PluginId.getId("com.depscope"))
            ?.pluginPath?.toFile()
    }

    private val extractDir: File by lazy {
        File(System.getProperty("java.io.tmpdir"), "depscope-plugin").also { it.mkdirs() }
    }

    /** Extract a classpath resource to extractDir and return the File, or null. */
    private fun extract(resourcePath: String): File? {
        val name = resourcePath.substringAfterLast('/')
        val dest = File(extractDir, name)
        if (dest.exists()) return dest   // already extracted

        val stream = BundledScripts::class.java.getResourceAsStream(resourcePath) ?: return null
        stream.use { it.copyTo(dest.outputStream()) }
        // Make shell scripts executable
        if (name.endsWith(".sh") || name.endsWith(".js")) {
            try {
                Files.setPosixFilePermissions(dest.toPath(), setOf(
                    PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE,
                    PosixFilePermission.GROUP_READ, PosixFilePermission.GROUP_EXECUTE,
                    PosixFilePermission.OTHERS_READ, PosixFilePermission.OTHERS_EXECUTE,
                ))
            } catch (_: Exception) {}
        }
        return dest
    }

    val coreScript: String? get() =
        extract("/depscope-core/index.js")?.absolutePath
            ?: pluginDir?.resolve("depscope-core/index.js")?.takeIf { it.exists() }?.absolutePath

    val helperScript: String? get() =
        extract("/scripts/intercept-helper.js")?.absolutePath
            ?: pluginDir?.resolve("scripts/intercept-helper.js")?.takeIf { it.exists() }?.absolutePath

    val wrapperScript: String? get() =
        extract("/scripts/depscope-wrapper.sh")?.absolutePath
            ?: pluginDir?.resolve("scripts/depscope-wrapper.sh")?.takeIf { it.exists() }?.absolutePath
}

// ── Risk helpers ──────────────────────────────────────────────────────────────

private val RISK_ORDER = listOf("low", "medium", "high", "critical")

private fun isBelowOrEqual(risk: String, threshold: String): Boolean =
    RISK_ORDER.indexOf(risk.lowercase()) <= RISK_ORDER.indexOf(threshold.lowercase())

private fun riskIcon(level: String): String = when (level.lowercase()) {
    "low"      -> "✅"
    "medium"   -> "⚠️"
    "high"     -> "🔶"
    "critical" -> "🔴"
    else       -> "❓"
}

// ── Server (singleton per JVM process) ───────────────────────────────────────

object InstallInterceptorServer {

    private val gson = Gson()
    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile var port: Int = 0
        private set

    /** Starts the server if it isn't already running. Idempotent. */
    fun ensureRunning() {
        if (serverSocket != null) return
        synchronized(this) {
            if (serverSocket != null) return
            val ss = ServerSocket(0, 10, java.net.InetAddress.getLoopbackAddress())
            port = ss.localPort
            serverSocket = ss
            Thread(::acceptLoop, "depscope-intercept-server").apply {
                isDaemon = true
                start()
            }
        }
    }

    fun stop() {
        synchronized(this) {
            serverSocket?.close()
            serverSocket = null
            port = 0
        }
    }

    // ── Accept loop ──────────────────────────────────────────────────────────

    private fun acceptLoop() {
        while (true) {
            val ss = serverSocket ?: break
            val client: Socket = try { ss.accept() } catch (_: Exception) { break }
            Thread({ handleClient(client) }, "depscope-intercept-client").apply {
                isDaemon = true
                start()
            }
        }
    }

    private fun handleClient(socket: Socket) {
        try {
            val raw = socket.inputStream.bufferedReader().readLine() ?: return
            val req = gson.fromJson(raw, JsonObject::class.java) ?: return
            val pkg       = req.get("package")?.asString   ?: return
            val ecosystem = req.get("ecosystem")?.asString ?: "npm"

            val proceed = runInterceptFlow(pkg, ecosystem)

            socket.outputStream.writer().use {
                it.write(gson.toJson(mapOf("proceed" to proceed)))
                it.flush()
            }
        } catch (_: Exception) {
            // On any error, write proceed=true so we never silently block the terminal
            try {
                socket.outputStream.writer().use {
                    it.write("{\"proceed\":true}")
                    it.flush()
                }
            } catch (_: Exception) {}
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    // ── Intercept flow ────────────────────────────────────────────────────────

    /**
     * Runs DepScope analysis on [packageName], drives the React webview overlay,
     * and waits for the user to click Continue or Cancel.
     * Returns true if the install should proceed, false to cancel.
     *
     * Blocks the calling (server) thread while waiting for the UI interaction.
     */
    private fun runInterceptFlow(packageName: String, ecosystem: String): Boolean {
        val settings = SettingsState.getInstance().state
        if (!settings.interceptInstalls) return true

        // 1. Open dashboard and show the "analyzing" spinner immediately
        DepScopeWebviewBridge.openToolWindow()
        Thread.sleep(300) // give the tool window time to show
        DepScopeWebviewBridge.postToWebview(
            mapOf("type" to "interceptStart", "package" to packageName, "ecosystem" to ecosystem)
        )

        // 2. Run analysis in background
        var dep: AnalyzedDependency? = null
        val analysisLatch = java.util.concurrent.CountDownLatch(1)

        ApplicationManager.getApplication().invokeLater {
            ProgressManager.getInstance().run(object : Task.Backgroundable(
                null, "DepScope: analyzing $packageName…", false
            ) {
                override fun run(indicator: ProgressIndicator) {
                    indicator.isIndeterminate = true
                    dep = analyzePackage(packageName, ecosystem, settings)
                    analysisLatch.countDown()
                }
            })
        }

        analysisLatch.await(60, java.util.concurrent.TimeUnit.SECONDS)
        val d = dep ?: run {
            // Analysis failed — dismiss overlay and don't block
            DepScopeWebviewBridge.postToWebview(mapOf("type" to "interceptDismiss"))
            return true
        }

        // 3. Always ask the user — send result and wait for decision
        DepScopeWebviewBridge.postToWebview(
            mapOf("type" to "interceptReady", "package" to packageName, "dep" to d)
        )

        val decisionLatch = java.util.concurrent.CountDownLatch(1)
        val resultHolder  = AtomicBoolean(true)

        DepScopeWebviewBridge.pendingInterceptResolve = { proceed ->
            resultHolder.set(proceed)
            decisionLatch.countDown()
        }

        // Safety timeout: if the user never responds, proceed after 5 minutes
        decisionLatch.await(300, java.util.concurrent.TimeUnit.SECONDS)
        DepScopeWebviewBridge.pendingInterceptResolve = null

        val proceed = resultHolder.get()
        if (!proceed) {
            DepScopeWebviewBridge.postToWebview(mapOf("type" to "interceptDismiss"))
        }
        return proceed
    }

    // ── Single-package analysis ───────────────────────────────────────────────

    private fun analyzePackage(
        packageName: String,
        ecosystem: String,
        settings: SettingsState.State,
    ): AnalyzedDependency? {
        val request = mutableMapOf<String, Any>(
            "type"         to "analyze",
            "ecosystem"    to ecosystem,
            "dependencies" to listOf(mapOf("name" to packageName, "version" to "latest", "isDev" to false)),
            "projectName"  to packageName,
            "maxDepth"     to 1,
            "concurrency"  to 1,
        )
        if (settings.groqApiKey.isNotBlank())  request["groqApiKey"]  = settings.groqApiKey
        if (settings.githubToken.isNotBlank()) request["githubToken"] = settings.githubToken

        val coreScript = BundledScripts.coreScript ?: return null

        return try {
            val process = ProcessBuilder("node", coreScript)
                .redirectErrorStream(false)
                .start()

            process.outputStream.bufferedWriter().use { it.write(gson.toJson(request)) }

            val stdout = process.inputStream.bufferedReader().readText()
            process.waitFor()

            val response = gson.fromJson(stdout, JsonObject::class.java)
            if (response.get("success")?.asBoolean == true) {
                val result = gson.fromJson(response.get("result"), ScanResult::class.java)
                result.dependencies.firstOrNull()
            } else null
        } catch (_: Exception) { null }
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun notifyAutoProceeded(pkg: String, riskLevel: String) {
        val icon = riskIcon(riskLevel)
        NotificationGroupManager.getInstance()
            .getNotificationGroup("DepScope")
            .createNotification(
                "DepScope $icon  `$pkg` risk: $riskLevel — proceeding with install.",
                NotificationType.INFORMATION,
            )
            .notify(null)
    }
}

// ── LocalTerminalCustomizer ───────────────────────────────────────────────────

/**
 * Registered via plugin.xml as a `org.intellij.plugins.terminal.localTerminalCustomizer`
 * extension. Injects DEPSCOPE_PORT and DEPSCOPE_HELPER_SCRIPT so the shell wrapper
 * can reach the intercept server.
 */
class DepScopeTerminalCustomizer : LocalTerminalCustomizer() {

    override fun customizeCommandAndEnvironment(
        project: Project,
        workingDirectory: String?,
        command: Array<String>,
        envs: MutableMap<String, String>,
    ): Array<String> {
        val settings = SettingsState.getInstance().state
        if (!settings.interceptInstalls) return command

        InstallInterceptorServer.ensureRunning()
        val port = InstallInterceptorServer.port
        if (port == 0) return command

        val helperScript  = BundledScripts.helperScript  ?: return command
        val wrapperScript = BundledScripts.wrapperScript ?: return command

        // Always set the env vars
        envs["DEPSCOPE_PORT"]          = port.toString()
        envs["DEPSCOPE_HELPER_SCRIPT"] = helperScript

        // Determine which shell is being launched
        val shellBin = command.firstOrNull() ?: return command
        val shellName = File(shellBin).name

        return when {
            shellName.contains("zsh")  -> injectZsh(command, wrapperScript, envs)
            shellName.contains("bash") -> injectBash(command, wrapperScript)
            else                       -> command  // fish/sh etc. — env vars set; no injection
        }
    }

    /**
     * For zsh: point ZDOTDIR at a temp directory containing a .zshrc that
     * sources the real ~/.zshrc first, then the DepScope wrapper.
     * This is the only reliable way to inject into interactive zsh without
     * touching the user's actual dotfiles.
     */
    private fun injectZsh(
        command: Array<String>,
        wrapperScript: String,
        envs: MutableMap<String, String>,
    ): Array<String> {
        val home    = System.getProperty("user.home")
        val zdotdir = File(System.getProperty("java.io.tmpdir"), "depscope-zdotdir")
        zdotdir.mkdirs()

        File(zdotdir, ".zshrc").writeText("""
            # DepScope — injected by IntelliJ plugin
            # Source the user's real .zshrc first so nothing is broken
            [[ -f "$home/.zshrc" ]] && source "$home/.zshrc"
            # Then activate the install interceptor
            source "$wrapperScript" 2>/dev/null || true
        """.trimIndent())

        envs["ZDOTDIR"] = zdotdir.absolutePath
        return command  // command unchanged; shell reads ZDOTDIR/.zshrc automatically
    }

    /**
     * For bash: pass --rcfile pointing at a temp init file that sources
     * ~/.bashrc first, then the DepScope wrapper.
     */
    private fun injectBash(command: Array<String>, wrapperScript: String): Array<String> {
        val home     = System.getProperty("user.home")
        val initFile = File(System.getProperty("java.io.tmpdir"), "depscope-bash-init.sh")

        initFile.writeText("""
            # DepScope — injected by IntelliJ plugin
            [[ -f "$home/.bashrc" ]] && source "$home/.bashrc"
            source "$wrapperScript" 2>/dev/null || true
        """.trimIndent())

        // Replace bare `bash` (or `bash -l` etc.) with `bash --rcfile <init>`
        // Drop any existing --rcfile / --init-file flag pair to avoid conflicts
        val filtered = command.toList()
            .zipWithNext()
            .filter { (a, _) -> a != "--rcfile" && a != "--init-file" }
            .map { (a, _) -> a }
            .toMutableList()
        if (command.isNotEmpty()) filtered.add(command.last())

        return (filtered + listOf("--rcfile", initFile.absolutePath)).toTypedArray()
    }
}
