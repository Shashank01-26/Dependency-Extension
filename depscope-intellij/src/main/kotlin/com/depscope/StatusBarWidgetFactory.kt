package com.depscope

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.event.MouseEvent

class StatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "DepScopeStatusBar"
    override fun getDisplayName(): String = "DepScope Risk Score"
    override fun isAvailable(project: Project): Boolean = true
    override fun createWidget(project: Project): StatusBarWidget = DepScopeStatusWidget(project)
    override fun disposeWidget(widget: StatusBarWidget) { widget.dispose() }
    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

class DepScopeStatusWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {
    private var statusBar: StatusBar? = null
    private var text = "DepScope"

    override fun ID(): String = "DepScopeStatusBar"

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun dispose() {}

    override fun getText(): String = text

    override fun getTooltipText(): String = "DepScope — Click to open dashboard"

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
        // Open DepScope tool window
        val toolWindowManager = com.intellij.openapi.wm.ToolWindowManager.getInstance(project)
        toolWindowManager.getToolWindow("DepScope")?.show()
    }

    override fun getAlignment(): Float = 0.5f

    fun updateScore(score: Int, level: String) {
        text = "DepScope: $score/100 ${level.uppercase()}"
        statusBar?.updateWidget(ID())
    }
}
