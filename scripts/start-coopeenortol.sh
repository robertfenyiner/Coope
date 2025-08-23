#!/bin/bash

# ======================================
# SCRIPT DE INICIO PARA COOPEENORTOL
# ======================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

APP_DIR="/opt/coopeenortol"

log "=== INICIANDO COOPEENORTOL ==="

# 1. Ir al directorio de la aplicación
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    success "Cambiado al directorio: $APP_DIR"
else
    error "Directorio no encontrado: $APP_DIR"
    exit 1
fi

# 2. Verificar archivos necesarios
if [ ! -f "ecosystem.config.js" ]; then
    error "Archivo ecosystem.config.js no encontrado"
    exit 1
fi

if [ ! -f "server/index.js" ]; then
    error "Archivo server/index.js no encontrado"
    exit 1
fi

# 3. Configurar archivo .env si no existe
if [ ! -f "server/.env" ] && [ -f "server/.env.coopeenortol" ]; then
    log "Copiando configuración de entorno..."
    cp server/.env.coopeenortol server/.env
    success "Archivo .env creado desde .env.coopeenortol"
fi

# 4. Inicializar base de datos si es necesario
log "Verificando base de datos..."
if systemctl is-active --quiet postgresql; then
    success "PostgreSQL está ejecutándose"
    
    # Crear usuario y base de datos si no existen
    sudo -u postgres psql -c "CREATE USER coopeenortol_user WITH PASSWORD 'Coope2024!';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE coopeenortol_db OWNER coopeenortol_user;" 2>/dev/null || true
    
    # Ejecutar esquema
    if [ -f "server/database/schema.sql" ]; then
        log "Aplicando esquema de base de datos..."
        PGPASSWORD=Coope2024! psql -h localhost -U coopeenortol_user -d coopeenortol_db -f server/database/schema.sql >/dev/null 2>&1
        if [ $? -eq 0 ]; then
            success "Esquema de base de datos aplicado"
        else
            error "Error aplicando esquema (puede ser que ya exista)"
        fi
    fi
else
    error "PostgreSQL no está ejecutándose. Iniciando..."
    sudo systemctl start postgresql
fi

# 5. Instalar dependencias si es necesario
if [ ! -d "server/node_modules" ]; then
    log "Instalando dependencias del servidor..."
    cd server && npm install
    cd ..
fi

if [ ! -d "client/node_modules" ]; then
    log "Instalando dependencias del cliente..."
    cd client && npm install && npm run build
    cd ..
fi

# 6. Detener PM2 si está ejecutándose
log "Deteniendo instancias previas..."
pm2 stop coopeenortol-server 2>/dev/null || true
pm2 delete coopeenortol-server 2>/dev/null || true

# 7. Iniciar aplicación con PM2
log "Iniciando aplicación con PM2..."
pm2 start ecosystem.config.js --env production

if [ $? -eq 0 ]; then
    success "Aplicación iniciada con PM2"
    
    # Esperar un momento para que la aplicación inicie
    sleep 5
    
    # Verificar que esté respondiendo
    if curl -s http://localhost:5000/api/health >/dev/null; then
        success "Backend responde correctamente"
    else
        error "Backend no responde, verificar logs:"
        pm2 logs coopeenortol-server --lines 10
    fi
else
    error "Error iniciando aplicación con PM2"
    exit 1
fi

# 8. Configurar y reiniciar Nginx
log "Configurando Nginx..."

# Verificar configuración
if [ -f "/etc/nginx/sites-available/coopeenortol" ]; then
    success "Configuración de Nginx existe"
    
    # Habilitar sitio
    sudo ln -sf /etc/nginx/sites-available/coopeenortol /etc/nginx/sites-enabled/
    
    # Verificar configuración
    if sudo nginx -t; then
        success "Configuración de Nginx es válida"
        sudo systemctl reload nginx
        success "Nginx reconfigurado"
    else
        error "Error en configuración de Nginx"
    fi
else
    error "Configuración de Nginx no encontrada"
fi

# 9. Verificar estado final
log "=== ESTADO FINAL ==="
echo
log "PM2 Status:"
pm2 list

echo
log "Puertos en uso:"
netstat -tlnp | grep -E ':80|:5000'

echo
log "Test de conectividad:"
if curl -s http://localhost/api/health >/dev/null; then
    success "✓ Frontend accesible en http://localhost"
else
    error "✗ Frontend no accesible"
fi

if curl -s http://localhost:5000/api/health >/dev/null; then
    success "✓ Backend accesible en http://localhost:5000"
else
    error "✗ Backend no accesible"
fi

echo
log "=== COOPEENORTOL INICIADO ==="
log "Frontend: http://$(hostname -I | awk '{print $1}')"
log "API: http://$(hostname -I | awk '{print $1}')/api"
log "Logs: pm2 logs coopeenortol-server"
echo