#!/bin/bash

# ======================================
# SCRIPT DIAGNÓSTICO PARA ERROR 502
# COOPEENORTOL
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

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

log "=== DIAGNÓSTICO DE ERROR 502 BAD GATEWAY ==="
echo

# 1. Verificar Nginx
log "1. Verificando estado de Nginx..."
if systemctl is-active --quiet nginx; then
    success "Nginx está ejecutándose"
    
    if nginx -t >/dev/null 2>&1; then
        success "Configuración de Nginx es válida"
    else
        error "Configuración de Nginx tiene errores:"
        nginx -t
    fi
else
    error "Nginx no está ejecutándose"
    echo "   Para iniciar: sudo systemctl start nginx"
fi

# 2. Verificar puertos
log "2. Verificando puertos..."
if netstat -tlnp | grep :80 >/dev/null 2>&1; then
    success "Puerto 80 está en uso por:"
    netstat -tlnp | grep :80
else
    error "Puerto 80 no está en uso"
fi

if netstat -tlnp | grep :5000 >/dev/null 2>&1; then
    success "Puerto 5000 está en uso por:"
    netstat -tlnp | grep :5000
else
    error "Puerto 5000 no está en uso (backend no está corriendo)"
fi

# 3. Verificar PM2
log "3. Verificando PM2..."
if command -v pm2 >/dev/null 2>&1; then
    success "PM2 está instalado"
    
    if pm2 list | grep -q "coopeenortol-server"; then
        success "Aplicación está en PM2:"
        pm2 list | grep coopeenortol
    else
        error "Aplicación no está ejecutándose en PM2"
        echo "   Para iniciar: pm2 start ecosystem.config.js"
    fi
    
    log "Estado detallado de PM2:"
    pm2 list
else
    error "PM2 no está instalado"
fi

# 4. Verificar conectividad del backend
log "4. Verificando conectividad del backend..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health | grep -q "200"; then
    success "Backend responde correctamente en puerto 5000"
    echo "   Respuesta de health check:"
    curl -s http://localhost:5000/api/health | jq . 2>/dev/null || curl -s http://localhost:5000/api/health
else
    error "Backend no responde en puerto 5000"
    
    # Intentar conectar directamente
    if curl -s --max-time 5 http://localhost:5000 >/dev/null 2>&1; then
        warning "Backend responde pero endpoint /api/health falla"
    else
        error "Backend no responde en absoluto"
    fi
fi

# 5. Verificar base de datos
log "5. Verificando base de datos PostgreSQL..."
if systemctl is-active --quiet postgresql; then
    success "PostgreSQL está ejecutándose"
    
    # Intentar conectar a la base de datos
    if sudo -u postgres psql -d coopeenortol_db -c "SELECT 1;" >/dev/null 2>&1; then
        success "Base de datos coopeenortol_db es accesible"
    else
        error "No se puede conectar a la base de datos coopeenortol_db"
    fi
else
    error "PostgreSQL no está ejecutándose"
fi

# 6. Verificar logs
log "6. Revisando logs recientes..."

if [ -f "/var/log/nginx/coopeenortol_error.log" ]; then
    log "Últimos errores de Nginx:"
    tail -5 /var/log/nginx/coopeenortol_error.log
else
    warning "Log de errores de Nginx no encontrado"
fi

if pm2 list | grep -q "coopeenortol-server"; then
    log "Últimos logs de la aplicación:"
    pm2 logs coopeenortol-server --lines 5 --nostream
fi

# 7. Verificar archivos de la aplicación
log "7. Verificando archivos de la aplicación..."
APP_DIR="/opt/coopeenortol"

if [ -d "$APP_DIR" ]; then
    success "Directorio de aplicación existe: $APP_DIR"
    
    if [ -f "$APP_DIR/server/index.js" ]; then
        success "Archivo principal del servidor existe"
    else
        error "Archivo principal del servidor no encontrado"
    fi
    
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
        success "Archivo de configuración PM2 existe"
    else
        error "Archivo ecosystem.config.js no encontrado"
    fi
    
    if [ -f "$APP_DIR/server/.env" ]; then
        success "Archivo .env existe"
    else
        warning "Archivo .env no encontrado (usando .env.coopeenortol?)"
    fi
else
    error "Directorio de aplicación no encontrado: $APP_DIR"
fi

# 8. Verificar permisos
log "8. Verificando permisos..."
if [ -d "/opt/coopeenortol" ]; then
    log "Permisos del directorio de aplicación:"
    ls -la /opt/coopeenortol/ | head -10
fi

# 9. Verificar configuración de Nginx
log "9. Verificando configuración de Nginx para Coopeenortol..."
if [ -f "/etc/nginx/sites-available/coopeenortol" ]; then
    success "Archivo de configuración existe"
    
    if [ -L "/etc/nginx/sites-enabled/coopeenortol" ]; then
        success "Configuración está habilitada"
    else
        error "Configuración no está habilitada en sites-enabled"
        echo "   Para habilitar: sudo ln -sf /etc/nginx/sites-available/coopeenortol /etc/nginx/sites-enabled/"
    fi
else
    error "Archivo de configuración de Nginx no encontrado"
fi

echo
log "=== SOLUCIONES SUGERIDAS ==="
echo "1. Si el backend no está corriendo:"
echo "   cd /opt/coopeenortol && pm2 start ecosystem.config.js"
echo
echo "2. Si hay problemas de base de datos:"
echo "   sudo systemctl start postgresql"
echo "   cd /opt/coopeenortol && sudo -u postgres psql -d coopeenortol_db -f server/database/schema.sql"
echo
echo "3. Si hay problemas de Nginx:"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo
echo "4. Para ver logs en tiempo real:"
echo "   pm2 logs coopeenortol-server"
echo "   sudo tail -f /var/log/nginx/coopeenortol_error.log"
echo
echo "5. Para reiniciar todo:"
echo "   cd /opt/coopeenortol && pm2 restart ecosystem.config.js"
echo "   sudo systemctl reload nginx"