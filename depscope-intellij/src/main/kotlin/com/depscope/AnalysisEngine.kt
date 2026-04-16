package com.depscope

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.file.Paths

data class RiskScore(
    val maintenance: Double,
    val security: Double,
    val popularity: Double,
    val community: Double,
    val depthRisk: Double,
    val overall: Double
)

data class RiskFlag(
    val type: String,
    val severity: String,
    val message: String
)

data class Vulnerability(
    val title: String,
    val severity: String,
    val cve: String,
    val affectedVersions: String
)

data class RegistryData(
    val weeklyDownloads: Long,
    val maintainers: Int,
    val lastPublish: String,
    val deprecation: String?,
    val versions: Int,
    val license: String,
    val description: String,
    val homepage: String
)

data class GitHubData(
    val stars: Int,
    val forks: Int,
    val openIssues: Int,
    val lastCommit: String,
    val archived: Boolean
)

data class AnalyzedDependency(
    val name: String,
    val version: String,
    val isDev: Boolean,
    val registryData: RegistryData,
    val github: GitHubData?,
    val vulnerabilities: List<Vulnerability>,
    val score: RiskScore,
    val riskLevel: String,
    val flags: List<RiskFlag>,
    val depth: Int,
    val directDeps: List<String>,
    val transitiveCount: Int
)

data class ScanSummary(
    val overallScore: Double,
    val overallRiskLevel: String,
    val totalDependencies: Int,
    val directCount: Int,
    val devCount: Int,
    val criticalCount: Int,
    val highCount: Int,
    val mediumCount: Int,
    val lowCount: Int,
    val vulnerabilityCount: Int
)

data class ScanMetadata(
    val projectName: String,
    val timestamp: String,
    val ecosystem: String
)

data class ScanResult(
    val metadata: ScanMetadata,
    val summary: ScanSummary,
    val dependencies: List<AnalyzedDependency>
)

class AnalysisEngine(private val project: Project) {

    private val gson = Gson()
    var lastResult: ScanResult? = null
    private val listeners = mutableListOf<(ScanResult) -> Unit>()

    fun addResultListener(listener: (ScanResult) -> Unit) {
        listeners.add(listener)
    }

    fun analyzeFile(manifestPath: String) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "DepScope: Analyzing dependencies...", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                indicator.text = "Reading manifest file..."

                val file = File(manifestPath)
                if (!file.exists()) return

                val ecosystem = detectEcosystem(manifestPath)
                val content = file.readText()
                val deps = parseDependencies(content, ecosystem)

                if (deps.isEmpty()) {
                    notifyUser("DepScope: No dependencies found in ${file.name}", NotificationType.WARNING)
                    return
                }

                indicator.text = "Analyzing ${deps.size} dependencies..."

                val settings = SettingsState.getInstance().state
                val request = buildRequest(ecosystem, deps, file.parentFile.name, settings)

                val result = runCoreProcess(request)
                if (result != null) {
                    lastResult = result
                    ApplicationManager.getApplication().invokeLater {
                        listeners.forEach { it(result) }
                        if (result.summary.criticalCount > 0) {
                            notifyUser(
                                "DepScope: ${result.summary.criticalCount} critical-risk dependencies detected. Open Dashboard →",
                                NotificationType.WARNING
                            )
                        }
                    }
                }
            }
        })
    }

    private fun buildRequest(ecosystem: String, deps: List<Map<String, Any>>, projectName: String, settings: SettingsState.State): String {
        val request = mutableMapOf<String, Any>(
            "type" to "analyze",
            "ecosystem" to ecosystem,
            "dependencies" to deps,
            "projectName" to projectName,
            "maxDepth" to settings.maxDepth,
            "concurrency" to settings.concurrency
        )
        if (settings.groqApiKey.isNotBlank()) request["groqApiKey"] = settings.groqApiKey
        if (settings.githubToken.isNotBlank()) request["githubToken"] = settings.githubToken
        return gson.toJson(request)
    }

    private fun runCoreProcess(requestJson: String): ScanResult? {
        val corePaths = listOf(
            Paths.get(System.getProperty("user.home"), "Downloads", "workspace", "DepScope-Extension", "depscope-core", "dist", "index.js").toString(),
            "/usr/local/lib/depscope-core/dist/index.js",
        )

        val coreScript = corePaths.firstOrNull { File(it).exists() } ?: run {
            notifyUser("DepScope: Could not find depscope-core. Please build it first.", NotificationType.ERROR)
            return null
        }

        return try {
            val process = ProcessBuilder("node", coreScript)
                .redirectErrorStream(false)
                .start()

            process.outputStream.bufferedWriter().use { it.write(requestJson) }

            val stdout = process.inputStream.bufferedReader().readText()
            val stderr = process.errorStream.bufferedReader().readText()

            process.waitFor()

            val response = gson.fromJson(stdout, JsonObject::class.java)
            if (response.get("success")?.asBoolean == true) {
                gson.fromJson(response.get("result"), ScanResult::class.java)
            } else {
                notifyUser("DepScope: Analysis error — ${response.get("error")?.asString}", NotificationType.ERROR)
                null
            }
        } catch (e: Exception) {
            notifyUser("DepScope: Failed to run analysis — ${e.message}", NotificationType.ERROR)
            null
        }
    }

    fun analyzeWithRequest(request: Map<String, Any>) {
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "DepScope: Analyzing sample...", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                val result = runCoreProcess(gson.toJson(request))
                if (result != null) {
                    lastResult = result
                    ApplicationManager.getApplication().invokeLater {
                        listeners.forEach { it(result) }
                    }
                }
            }
        })
    }

    private fun notifyUser(message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("DepScope")
            .createNotification(message, type)
            .notify(project)
    }

    private fun detectEcosystem(filePath: String): String {
        return when {
            filePath.endsWith("package.json") -> "npm"
            filePath.endsWith("pubspec.yaml") -> "flutter"
            filePath.contains("build.gradle") -> "android"
            else -> "npm"
        }
    }

    private fun parseDependencies(content: String, ecosystem: String): List<Map<String, Any>> {
        return when (ecosystem) {
            "npm" -> parsePackageJson(content)
            "flutter" -> parsePubspec(content)
            "android" -> parseBuildGradle(content)
            else -> emptyList()
        }
    }

    private fun parsePackageJson(content: String): List<Map<String, Any>> {
        val deps = mutableListOf<Map<String, Any>>()
        try {
            val obj = gson.fromJson(content, JsonObject::class.java)
            obj.getAsJsonObject("dependencies")?.entrySet()?.forEach { (name, version) ->
                deps.add(mapOf("name" to name, "version" to version.asString.replace(Regex("^[\\^~>=<]"), ""), "isDev" to false))
            }
            obj.getAsJsonObject("devDependencies")?.entrySet()?.forEach { (name, version) ->
                deps.add(mapOf("name" to name, "version" to version.asString.replace(Regex("^[\\^~>=<]"), ""), "isDev" to true))
            }
        } catch (_: Exception) {}
        return deps
    }

    private fun parsePubspec(content: String): List<Map<String, Any>> {
        val deps = mutableListOf<Map<String, Any>>()
        var inDeps = false
        var isDev = false
        for (line in content.lines()) {
            val stripped = line.trimEnd()
            when {
                stripped == "dependencies:" -> { inDeps = true; isDev = false }
                stripped == "dev_dependencies:" -> { inDeps = true; isDev = true }
                stripped.matches(Regex("^\\w+:.*")) && !stripped.startsWith(" ") && !stripped.startsWith("\t") -> {
                    if (stripped != "dependencies:" && stripped != "dev_dependencies:") inDeps = false
                }
                inDeps && (stripped.startsWith("  ") || stripped.startsWith("\t")) -> {
                    val match = stripped.trim().let { Regex("^([a-z_][a-z0-9_-]*):\\s*(.*)$").find(it) }
                    match?.let {
                        val name = it.groupValues[1]
                        val version = it.groupValues[2].replace(Regex("[^0-9.]"), "").ifEmpty { "0.0.0" }
                        if (name != "flutter" && name != "sdk") {
                            deps.add(mapOf("name" to name, "version" to version, "isDev" to isDev))
                        }
                    }
                }
            }
        }
        return deps
    }

    private fun parseBuildGradle(content: String): List<Map<String, Any>> {
        val deps = mutableListOf<Map<String, Any>>()
        val seen = mutableSetOf<String>()
        val re = Regex("""(?:implementation|api|testImplementation|debugImplementation)\s*[('"]([^'"]+)[)'"]""")
        re.findAll(content).forEach { match ->
            val dep = match.groupValues[1]
            val parts = dep.split(":")
            if (parts.size >= 3) {
                val name = "${parts[0]}:${parts[1]}"
                if (seen.add(name)) {
                    val isDev = match.value.contains("test") || match.value.contains("debug")
                    deps.add(mapOf("name" to name, "version" to parts[2], "isDev" to isDev))
                }
            }
        }
        return deps
    }
}
