package com.depscope

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(
    name = "DepScopeSettings",
    storages = [Storage("depscope.xml")]
)
@Service
class SettingsState : PersistentStateComponent<SettingsState.State> {

    data class State(
        var groqApiKey: String = "",
        var githubToken: String = "",
        var maxDepth: Int = 3,
        var concurrency: Int = 5,
        var autoAnalyzeOnOpen: Boolean = true,
        var showGutterIcons: Boolean = true,
        var interceptInstalls: Boolean = true,
        var autoProceedBelowRisk: String = "low"  // "low" | "medium" | "high"
    )

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    companion object {
        fun getInstance(): SettingsState =
            ApplicationManager.getApplication().getService(SettingsState::class.java)
    }
}
