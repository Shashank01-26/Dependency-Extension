package com.depscope

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

class SettingsConfigurable : Configurable {
    private var groqKeyField: JBPasswordField? = null
    private var githubTokenField: JBTextField? = null
    private var maxDepthField: JBTextField? = null
    private var concurrencyField: JBTextField? = null
    private var autoAnalyzeCheckbox: JBCheckBox? = null
    private var gutterIconsCheckbox: JBCheckBox? = null
    private var interceptInstallsCheckbox: JBCheckBox? = null
    private var autoProceedBelowRiskField: JBTextField? = null

    override fun getDisplayName(): String = "DepScope"

    override fun createComponent(): JComponent {
        groqKeyField = JBPasswordField()
        githubTokenField = JBTextField()
        maxDepthField = JBTextField()
        concurrencyField = JBTextField()
        autoAnalyzeCheckbox = JBCheckBox("Auto-analyze on project open")
        gutterIconsCheckbox = JBCheckBox("Show gutter icons in editor")
        interceptInstallsCheckbox = JBCheckBox("Intercept package-manager installs (run DepScope before install)")
        autoProceedBelowRiskField = JBTextField()

        return FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Groq API Key:"), groqKeyField!!, 1, false)
            .addLabeledComponent(JBLabel("GitHub Token (optional):"), githubTokenField!!, 1, false)
            .addLabeledComponent(JBLabel("Max Dependency Depth:"), maxDepthField!!, 1, false)
            .addLabeledComponent(JBLabel("Concurrency:"), concurrencyField!!, 1, false)
            .addComponent(autoAnalyzeCheckbox!!, 1)
            .addComponent(gutterIconsCheckbox!!, 1)
            .addComponent(interceptInstallsCheckbox!!, 1)
            .addLabeledComponent(
                JBLabel("Auto-proceed below risk (low/medium/high):"),
                autoProceedBelowRiskField!!, 1, false
            )
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    override fun isModified(): Boolean {
        val settings = SettingsState.getInstance().state
        return String(groqKeyField?.password ?: CharArray(0)) != settings.groqApiKey ||
                githubTokenField?.text != settings.githubToken ||
                maxDepthField?.text != settings.maxDepth.toString() ||
                concurrencyField?.text != settings.concurrency.toString() ||
                autoAnalyzeCheckbox?.isSelected != settings.autoAnalyzeOnOpen ||
                gutterIconsCheckbox?.isSelected != settings.showGutterIcons ||
                interceptInstallsCheckbox?.isSelected != settings.interceptInstalls ||
                autoProceedBelowRiskField?.text != settings.autoProceedBelowRisk
    }

    override fun apply() {
        val settings = SettingsState.getInstance().state
        settings.groqApiKey = String(groqKeyField?.password ?: CharArray(0))
        settings.githubToken = githubTokenField?.text ?: ""
        settings.maxDepth = maxDepthField?.text?.toIntOrNull() ?: 3
        settings.concurrency = concurrencyField?.text?.toIntOrNull() ?: 5
        settings.autoAnalyzeOnOpen = autoAnalyzeCheckbox?.isSelected ?: true
        settings.showGutterIcons = gutterIconsCheckbox?.isSelected ?: true
        settings.interceptInstalls = interceptInstallsCheckbox?.isSelected ?: true
        val rawRisk = autoProceedBelowRiskField?.text?.trim()?.lowercase() ?: "low"
        settings.autoProceedBelowRisk = if (rawRisk in listOf("low", "medium", "high")) rawRisk else "low"
    }

    override fun reset() {
        val settings = SettingsState.getInstance().state
        groqKeyField?.text = settings.groqApiKey
        githubTokenField?.text = settings.githubToken
        maxDepthField?.text = settings.maxDepth.toString()
        concurrencyField?.text = settings.concurrency.toString()
        autoAnalyzeCheckbox?.isSelected = settings.autoAnalyzeOnOpen
        gutterIconsCheckbox?.isSelected = settings.showGutterIcons
        interceptInstallsCheckbox?.isSelected = settings.interceptInstalls
        autoProceedBelowRiskField?.text = settings.autoProceedBelowRisk
    }
}
