#!/usr/bin/env bash
# DepScope Install Interceptor Wrapper
#
# Source this file into your shell session to enable install-time dependency scanning.
# The VS Code extension handles sourcing automatically via onDidOpenTerminal.
#
# Required env vars (set by InstallInterceptor before sourcing):
#   DEPSCOPE_PORT          – localhost TCP port where the VS Code extension listens
#   DEPSCOPE_HELPER_SCRIPT – absolute path to intercept-helper.js

# ─── Internal helper ──────────────────────────────────────────────────────────

__depscope_gate() {
    local pkg="$1"
    local ecosystem="$2"

    # Skip if extension is not active
    [[ -z "${DEPSCOPE_PORT:-}" ]]          && return 0
    [[ -z "${DEPSCOPE_HELPER_SCRIPT:-}" ]] && return 0
    [[ ! -f "$DEPSCOPE_HELPER_SCRIPT" ]]   && return 0

    # Delegate to the Node.js helper which talks to the VS Code extension.
    # Exit 0 → proceed with install.  Exit 1 → user cancelled.
    node "$DEPSCOPE_HELPER_SCRIPT" "$DEPSCOPE_PORT" "$pkg" "$ecosystem"
}

# Returns the first argument that does not start with '-'
__depscope_first_pkg() {
    for arg in "$@"; do
        [[ "$arg" != -* ]] && { echo "$arg"; return; }
    done
}

# ─── npm ──────────────────────────────────────────────────────────────────────

npm() {
    local subcmd="${1:-}"
    shift || true

    case "$subcmd" in
        install|i|add)
            local pkg
            pkg=$(__depscope_first_pkg "$@")
            # Only intercept when a named package is given (not bare `npm install`)
            if [[ -n "$pkg" ]]; then
                __depscope_gate "$pkg" "npm" || return 1
            fi
            ;;
    esac

    command npm "$subcmd" "$@"
}

# ─── yarn ─────────────────────────────────────────────────────────────────────

yarn() {
    local subcmd="${1:-}"
    shift || true

    case "$subcmd" in
        add)
            local pkg
            pkg=$(__depscope_first_pkg "$@")
            if [[ -n "$pkg" ]]; then
                __depscope_gate "$pkg" "npm" || return 1
            fi
            ;;
    esac

    command yarn "$subcmd" "$@"
}

# ─── pnpm ─────────────────────────────────────────────────────────────────────

pnpm() {
    local subcmd="${1:-}"
    shift || true

    case "$subcmd" in
        add|install|i)
            local pkg
            pkg=$(__depscope_first_pkg "$@")
            if [[ -n "$pkg" ]]; then
                __depscope_gate "$pkg" "npm" || return 1
            fi
            ;;
    esac

    command pnpm "$subcmd" "$@"
}

# ─── flutter ──────────────────────────────────────────────────────────────────

flutter() {
    # flutter pub add <pkg>
    if [[ "${1:-}" == "pub" && "${2:-}" == "add" ]]; then
        local pkg
        pkg=$(__depscope_first_pkg "${@:3}")
        if [[ -n "$pkg" ]]; then
            __depscope_gate "$pkg" "flutter" || return 1
        fi
    fi

    command flutter "$@"
}

# Export so subshells (e.g. bash -c "npm install …") also get the overrides
export -f npm            2>/dev/null || true
export -f yarn           2>/dev/null || true
export -f pnpm           2>/dev/null || true
export -f flutter        2>/dev/null || true
export -f __depscope_gate       2>/dev/null || true
export -f __depscope_first_pkg  2>/dev/null || true
