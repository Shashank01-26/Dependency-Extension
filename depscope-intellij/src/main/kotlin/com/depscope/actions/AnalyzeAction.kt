package com.depscope.actions

import com.depscope.AnalysisEngine
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys

class AnalyzeAction : AnAction("Analyze with DepScope") {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val engine = AnalysisEngine(project)
        engine.analyzeFile(file.path)
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        val isManifest = file?.name?.let { name ->
            name == "package.json" || name == "pubspec.yaml" ||
                    name.startsWith("build.gradle")
        } ?: false
        e.presentation.isEnabledAndVisible = isManifest
    }
}
