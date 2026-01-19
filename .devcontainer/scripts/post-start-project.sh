#!/usr/bin/env bash
# Project-specific post-start setup for stealth-claude
# This runs AFTER the common post-start script (called by post-start-common.sh)
set -euo pipefail

workspace="${1:-$(pwd)}"

log() { printf '[stealth-claude:post-start] %s\n' "$*"; }

# --- Ticket Initialization ---
# Ensure .tickets exists if tk is available
# (tk is installed by post-start-common.sh if VOIDLABS_TICKET=true)
if command -v tk &>/dev/null; then
    if [[ ! -d "$workspace/.tickets" ]]; then
        log "Creating .tickets directory..."
        mkdir -p "$workspace/.tickets"
    fi
fi

# --- Project-specific setup ---
# Add your recurring post-start tasks here

log "Project-specific setup complete."
