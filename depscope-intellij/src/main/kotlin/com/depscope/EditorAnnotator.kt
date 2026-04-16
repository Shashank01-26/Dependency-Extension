package com.depscope

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.util.IconLoader
import com.intellij.psi.PsiElement
import javax.swing.Icon

class EditorAnnotator : Annotator {

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (!SettingsState.getInstance().state.showGutterIcons) return
        val project = element.project
        val text = element.text ?: return

        // Simple heuristic: look for quoted strings that could be package names
        // in manifest files
        val containingFile = element.containingFile?.name ?: return
        if (containingFile !in listOf("package.json", "pubspec.yaml") &&
            !containingFile.startsWith("build.gradle")) return

        // This is a simplified annotator — in production, you'd integrate with
        // the AnalysisEngine results cache to show real risk badges
        val namePattern = Regex(""""([a-z@][a-z0-9._/-]+)"\s*:\s*"[^"]+"""")
        val match = namePattern.find(text) ?: return
        val packageName = match.groupValues[1]

        // Check if we have a cached result for this package
        // For now, show an informational gutter icon for recognized manifest entries
        if (packageName.isNotBlank() && packageName.length > 2) {
            holder.newSilentAnnotation(HighlightSeverity.INFORMATION)
                .range(element.textRange)
                .gutterIconRenderer(DepScopeGutterIconRenderer(packageName))
                .create()
        }
    }
}

class DepScopeGutterIconRenderer(private val packageName: String) : GutterIconRenderer() {
    override fun getIcon(): Icon = IconLoader.getIcon("/icons/depscope-small.svg", javaClass)
    override fun getTooltipText(): String = "DepScope: Click 'Analyze with DepScope' to see risk score for $packageName"
    override fun isNavigateAction(): Boolean = false
    override fun equals(other: Any?): Boolean = other is DepScopeGutterIconRenderer && other.packageName == packageName
    override fun hashCode(): Int = packageName.hashCode()
}
