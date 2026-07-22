#!/bin/bash
set -e

log() { echo "▶ [setup] $*" >&2; }

log "PostgreSQL: attende che sia pronto (pq-init.sh è l'entrypoint della feature)..."
pg_isready -t 30
log "PostgreSQL: creazione database app_dev..."
psql -c "CREATE DATABASE app_dev;" 2>/dev/null || log "PostgreSQL: database già esistente, skip."
log "PostgreSQL: configurato."

log "Claude Code: permessi del volume ~/.claude..."
sudo chown -R "$(id -u):$(id -g)" "$HOME/.claude"
log "Claude Code: volume pronto (CLI installata dalla dev container feature)."

log "Node tools: npm install -g angular/cli..."
npm install -g @angular/cli@21
log "Node tools: pronti."

log ".NET: dotnet restore..."
dotnet restore App.sln
log ".NET: dotnet tool restore..."
dotnet tool restore
log ".NET: npm install frontend..."
(cd App/frontend && npm install)
log "Setup completato."
