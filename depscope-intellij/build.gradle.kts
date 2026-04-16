plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.depscope"
version = "1.0.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.1")
        bundledPlugin("com.intellij.java")
        bundledPlugin("org.jetbrains.plugins.terminal")
        instrumentationTools()
    }
    implementation("com.google.code.gson:gson:2.10.1")
}

kotlin {
    jvmToolchain(21)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.register<Exec>("buildWebview") {
    group = "build"
    description = "Build the React webview bundle from depscope-vscode"
    workingDir(File(projectDir, "../depscope-vscode"))
    commandLine("npm", "run", "build:webview")
    isIgnoreExitValue = true
}

tasks.register<Exec>("buildDepScopeCore") {
    group = "build"
    description = "Build depscope-core dist"
    workingDir(File(projectDir, "../depscope-core"))
    commandLine("npm", "run", "build")
    isIgnoreExitValue = true
}

tasks.register<Copy>("copyWebviewBundle") {
    group = "build"
    description = "Copy built webview.js into plugin resources"
    from(File(projectDir, "../depscope-vscode/dist/webview.js"))
    into(File(projectDir, "src/main/resources/webview"))
    dependsOn("buildWebview")
}

tasks.register<Copy>("copyNodeScripts") {
    group = "build"
    description = "Bundle Node.js helper scripts into plugin resources"
    // intercept-helper.js and depscope-wrapper.sh
    from(File(projectDir, "../depscope-vscode/src/intercept-helper.js"))
    from(File(projectDir, "../depscope-vscode/scripts/depscope-wrapper.sh"))
    into(File(projectDir, "src/main/resources/scripts"))
    // depscope-core dist
    from(File(projectDir, "../depscope-core/dist/index.js"))
    into(File(projectDir, "src/main/resources/depscope-core"))
    dependsOn("buildDepScopeCore")
}

tasks.named("processResources") {
    dependsOn("copyWebviewBundle")
    dependsOn("copyNodeScripts")
}

intellijPlatform {
    pluginConfiguration {
        name = "DepScope"
        version = "1.0.0"
        description = "Dependency risk analyzer for npm, Flutter, and Android projects"
        changeNotes = "Initial release"
        ideaVersion {
            sinceBuild = "241"
            untilBuild = "251.*"
        }
    }
    signing {
        // Configure signing here for production release
    }
    publishing {
        // Configure JetBrains Marketplace publishing here
    }
}
