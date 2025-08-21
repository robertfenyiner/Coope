#!/bin/bash

# ======================================
# SCRIPT DE LIMPIEZA DE COOPEENORTOL
# ======================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

success() {
    echo "✅ $1"
}

log "Iniciando limpieza del proyecto Coopeenortol..."

# Limpiar archivos temporales
log "Limpiando archivos temporales..."
find . -name "*.tmp" -delete 2>/dev/null || true
find . -name "*.temp" -delete 2>/dev/null || true
find . -name "*.log" -delete 2>/dev/null || true

# Limpiar node_modules si existen
if [ -d "node_modules" ]; then
    log "Limpiando node_modules del proyecto principal..."
    rm -rf node_modules
fi

if [ -d "client/node_modules" ]; then
    log "Limpiando node_modules del cliente..."
    rm -rf client/node_modules
fi

if [ -d "server/node_modules" ]; then
    log "Limpiando node_modules del servidor..."
    rm -rf server/node_modules
fi

# Limpiar archivos de build
if [ -d "client/build" ]; then
    log "Limpiando build del cliente..."
    rm -rf client/build
fi

# Limpiar cache de npm
log "Limpiando cache de npm..."
npm cache clean --force 2>/dev/null || true

# Limpiar archivos de base de datos de desarrollo
log "Limpiando archivos de base de datos de desarrollo..."
find . -name "*.db" -delete 2>/dev/null || true
find . -name "*.sqlite" -delete 2>/dev/null || true
find . -name "*.sqlite3" -delete 2>/dev/null || true

# Limpiar directorios de uploads de desarrollo
if [ -d "server/uploads" ] && [ "$(ls -A server/uploads 2>/dev/null)" ]; then
    log "Limpiando uploads de desarrollo..."
    rm -rf server/uploads/*
fi

# Limpiar directorios de logs
if [ -d "logs" ]; then
    log "Limpiando logs..."
    rm -rf logs/*
fi

# Limpiar archivos de PM2
if [ -d ".pm2" ]; then
    log "Limpiando archivos de PM2..."
    rm -rf .pm2
fi

# Limpiar archivos de environment específicos
log "Limpiando archivos de environment..."
find . -name ".env.local" -delete 2>/dev/null || true
find . -name ".env.development.local" -delete 2>/dev/null || true
find . -name ".env.test.local" -delete 2>/dev/null || true
find . -name ".env.production.local" -delete 2>/dev/null || true

# Limpiar archivos de backup
log "Limpiando archivos de backup..."
find . -name "*.backup" -delete 2>/dev/null || true
find . -name "*.bak" -delete 2>/dev/null || true
find . -name "*~" -delete 2>/dev/null || true

success "Limpieza completada"
log "El proyecto está listo para commit o deployment"

# Mostrar tamaño del proyecto después de la limpieza
if command -v du &> /dev/null; then
    log "Tamaño del proyecto después de la limpieza:"
    du -sh . 2>/dev/null || echo "No se pudo calcular el tamaño"
fi