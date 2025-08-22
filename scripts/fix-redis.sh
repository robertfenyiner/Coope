#!/bin/bash

# ======================================
# SCRIPT PARA ARREGLAR PROBLEMAS DE REDIS
# COOPEENORTOL
# ======================================

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[ÉXITO]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[ADVERTENCIA]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log "Iniciando diagnóstico y reparación de Redis..."

# Verificar si Redis está instalado
if ! command -v redis-cli &> /dev/null; then
    warning "Redis no está instalado"
    echo
    echo "Opciones disponibles:"
    echo "1. Instalar Redis"
    echo "2. Configurar aplicación para funcionar sin Redis"
    echo "3. Salir"
    echo
    read -p "Seleccione una opción (1-3): " opcion
    
    case $opcion in
        1)
            log "Instalando Redis..."
            if command -v apt &> /dev/null; then
                sudo apt update
                sudo apt install -y redis-server
                sudo systemctl enable redis-server
                sudo systemctl start redis-server
                success "Redis instalado y configurado"
            elif command -v yum &> /dev/null; then
                sudo yum install -y redis
                sudo systemctl enable redis
                sudo systemctl start redis
                success "Redis instalado y configurado"
            else
                error "No se pudo detectar el gestor de paquetes del sistema"
                exit 1
            fi
            ;;
        2)
            log "Configurando aplicación para funcionar sin Redis..."
            
            # Crear configuración sin Redis
            APP_DIR="/opt/coopeenortol"
            if [ ! -d "$APP_DIR" ]; then
                APP_DIR="$(pwd)"
            fi
            
            if [ -f "$APP_DIR/server/.env" ]; then
                # Comentar configuración de Redis
                sed -i 's/^REDIS_/#REDIS_/g' "$APP_DIR/server/.env"
                echo "" >> "$APP_DIR/server/.env"
                echo "# Deshabilitar Redis para desarrollo" >> "$APP_DIR/server/.env"
                echo "DISABLE_REDIS=true" >> "$APP_DIR/server/.env"
                success "Configuración actualizada para funcionar sin Redis"
            else
                warning "Archivo .env no encontrado"
            fi
            ;;
        3)
            log "Saliendo..."
            exit 0
            ;;
        *)
            error "Opción inválida"
            exit 1
            ;;
    esac
else
    log "Redis está instalado, verificando configuración..."
    
    # Verificar si Redis está ejecutándose
    if systemctl is-active --quiet redis-server 2>/dev/null || systemctl is-active --quiet redis 2>/dev/null; then
        success "Redis está ejecutándose"
        
        # Verificar conexión
        if redis-cli ping >/dev/null 2>&1; then
            success "Redis responde correctamente"
        else
            warning "Redis no responde a ping"
            
            # Intentar conectar con autenticación
            if [ -f "/etc/redis/redis.conf" ]; then
                REDIS_PASS=$(grep "^requirepass" /etc/redis/redis.conf | cut -d' ' -f2)
                if [ -n "$REDIS_PASS" ]; then
                    log "Intentando conexión con autenticación..."
                    if redis-cli -a "$REDIS_PASS" ping >/dev/null 2>&1; then
                        success "Redis responde con autenticación"
                    else
                        error "Redis no responde ni con autenticación"
                    fi
                fi
            fi
        fi
    else
        warning "Redis no está ejecutándose"
        
        # Intentar iniciar Redis
        log "Intentando iniciar Redis..."
        if sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null; then
            success "Redis iniciado correctamente"
        else
            error "No se pudo iniciar Redis"
            
            # Verificar logs de Redis
            log "Verificando logs de Redis..."
            if [ -f "/var/log/redis/redis-server.log" ]; then
                echo "Últimas líneas del log de Redis:"
                tail -10 /var/log/redis/redis-server.log
            fi
            
            # Verificar permisos
            log "Verificando permisos de Redis..."
            if [ -d "/var/lib/redis" ]; then
                ls -la /var/lib/redis
            fi
            
            # Verificar configuración
            if [ -f "/etc/redis/redis.conf" ]; then
                log "Verificando configuración de Redis..."
                echo "Puerto configurado:"
                grep "^port" /etc/redis/redis.conf || echo "Puerto por defecto (6379)"
                echo "Directorio de trabajo:"
                grep "^dir" /etc/redis/redis.conf
                echo "Archivo de log:"
                grep "^logfile" /etc/redis/redis.conf
            fi
        fi
    fi
fi

echo
echo "=========================================="
echo "   DIAGNÓSTICO DE REDIS COMPLETADO"
echo "=========================================="
echo
echo "Para verificar el estado después de los cambios:"
echo "  redis-cli ping"
echo "  systemctl status redis-server"
echo "  tail -f /var/log/redis/redis-server.log"
echo