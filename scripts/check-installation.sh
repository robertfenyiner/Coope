#!/bin/bash

# ======================================
# SCRIPT DE VERIFICACIÓN DE INSTALACIÓN
# COOPEENORTOL
# ======================================

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_ok() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
}

check_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo "========================================"
echo "  VERIFICACIÓN DE INSTALACIÓN"
echo "  COOPEENORTOL"
echo "========================================"
echo

# Verificar usuario actual
current_user=$(whoami)
info "Usuario actual: $current_user"

# Verificar sistema operativo
if grep -q "22.04" /etc/os-release; then
    check_ok "Ubuntu 22.04 detectado"
else
    check_warning "Sistema operativo no es Ubuntu 22.04"
fi

# Verificar servicios del sistema
echo
echo "=== SERVICIOS DEL SISTEMA ==="

# PostgreSQL
if systemctl is-active --quiet postgresql; then
    check_ok "PostgreSQL está ejecutándose"
    
    # Verificar versión
    pg_version=$(sudo -u postgres psql -t -c "SELECT version();" | head -1)
    info "Versión PostgreSQL: $(echo $pg_version | cut -d' ' -f1-2)"
    
    # Verificar base de datos
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw coopeenortol_db; then
        check_ok "Base de datos coopeenortol_db existe"
    else
        check_fail "Base de datos coopeenortol_db no existe"
    fi
    
    # Verificar usuario
    if sudo -u postgres psql -t -c "SELECT usename FROM pg_user;" | grep -qw coopeenortol_user; then
        check_ok "Usuario coopeenortol_user existe"
    else
        check_fail "Usuario coopeenortol_user no existe"
    fi
else
    check_fail "PostgreSQL no está ejecutándose"
fi

# Redis
if systemctl is-active --quiet redis-server; then
    check_ok "Redis está ejecutándose"
    
    # Verificar conexión
    if redis-cli ping >/dev/null 2>&1; then
        check_ok "Redis responde a ping"
    else
        check_warning "Redis no responde (puede requerir autenticación)"
    fi
else
    check_fail "Redis no está ejecutándose"
fi

# Nginx
if systemctl is-active --quiet nginx; then
    check_ok "Nginx está ejecutándose"
else
    check_fail "Nginx no está ejecutándose"
fi

# Node.js
echo
echo "=== NODE.JS Y NPM ==="

if command -v node &> /dev/null; then
    node_version=$(node --version)
    check_ok "Node.js instalado: $node_version"
    
    if [[ $node_version =~ v1[8-9]\. ]] || [[ $node_version =~ v2[0-9]\. ]]; then
        check_ok "Versión de Node.js es compatible"
    else
        check_warning "Versión de Node.js puede no ser compatible (recomendado v18+)"
    fi
else
    check_fail "Node.js no está instalado"
fi

if command -v npm &> /dev/null; then
    npm_version=$(npm --version)
    check_ok "npm instalado: v$npm_version"
else
    check_fail "npm no está instalado"
fi

# PM2
if command -v pm2 &> /dev/null; then
    check_ok "PM2 instalado"
    
    # Verificar procesos PM2
    if pm2 list | grep -q coopeenortol-server; then
        check_ok "Proceso coopeenortol-server existe en PM2"
        
        # Verificar estado
        if pm2 list | grep coopeenortol-server | grep -q online; then
            check_ok "coopeenortol-server está online"
        else
            check_fail "coopeenortol-server no está online"
        fi
    else
        check_warning "Proceso coopeenortol-server no encontrado en PM2"
    fi
else
    check_fail "PM2 no está instalado"
fi

# Verificar estructura de archivos
echo
echo "=== ESTRUCTURA DE ARCHIVOS ==="

app_dir="/opt/coopeenortol"
if [ -d "$app_dir" ]; then
    check_ok "Directorio de aplicación existe: $app_dir"
    
    # Verificar archivos clave
    key_files=(
        "package.json"
        "server/package.json"
        "server/index.js"
        "server/database/schema.sql"
        "client/package.json"
        "ecosystem.config.js"
    )
    
    for file in "${key_files[@]}"; do
        if [ -f "$app_dir/$file" ]; then
            check_ok "Archivo existe: $file"
        else
            check_fail "Archivo faltante: $file"
        fi
    done
    
    # Verificar .env
    if [ -f "$app_dir/server/.env" ]; then
        check_ok "Archivo .env existe"
        
        # Verificar configuraciones críticas
        if grep -q "JWT_SECRET=" "$app_dir/server/.env"; then
            if grep -q "tu_jwt_secret" "$app_dir/server/.env"; then
                check_warning "JWT_SECRET no ha sido configurado"
            else
                check_ok "JWT_SECRET está configurado"
            fi
        else
            check_fail "JWT_SECRET no está definido en .env"
        fi
    else
        check_fail "Archivo .env no existe"
    fi
    
    # Verificar build del cliente
    if [ -d "$app_dir/client/build" ]; then
        check_ok "Build del cliente existe"
    else
        check_warning "Build del cliente no existe (ejecutar: npm run build)"
    fi
    
    # Verificar node_modules
    if [ -d "$app_dir/server/node_modules" ]; then
        check_ok "Dependencias del servidor instaladas"
    else
        check_fail "Dependencias del servidor no instaladas"
    fi
    
else
    check_fail "Directorio de aplicación no existe: $app_dir"
fi

# Verificar permisos
echo
echo "=== PERMISOS ==="

app_user="coope"
if id "$app_user" &>/dev/null; then
    check_ok "Usuario $app_user existe"
    
    if [ -d "$app_dir" ]; then
        dir_owner=$(stat -c %U "$app_dir")
        if [ "$dir_owner" = "$app_user" ]; then
            check_ok "Directorio tiene permisos correctos"
        else
            check_fail "Directorio pertenece a $dir_owner, debería ser $app_user"
        fi
    fi
else
    check_fail "Usuario $app_user no existe"
fi

# Verificar puertos
echo
echo "=== PUERTOS ==="

# Puerto 5000 (aplicación)
if netstat -tlnp 2>/dev/null | grep -q ":5000 "; then
    check_ok "Puerto 5000 está en uso (aplicación)"
else
    check_warning "Puerto 5000 no está en uso"
fi

# Puerto 80 (nginx)
if netstat -tlnp 2>/dev/null | grep -q ":80 "; then
    check_ok "Puerto 80 está en uso (nginx)"
else
    check_warning "Puerto 80 no está en uso"
fi

# Prueba de conectividad
echo
echo "=== CONECTIVIDAD ==="

if curl -s http://localhost:5000/api/health >/dev/null 2>&1; then
    check_ok "API responde en puerto 5000"
else
    check_fail "API no responde en puerto 5000"
fi

if curl -s http://localhost >/dev/null 2>&1; then
    check_ok "Servidor web responde en puerto 80"
else
    check_warning "Servidor web no responde en puerto 80"
fi

echo
echo "========================================"
echo "  VERIFICACIÓN COMPLETADA"
echo "========================================"
echo
echo "Para más información sobre problemas encontrados,"
echo "consulte la documentación en:"
echo "https://github.com/robertfenyiner/Coope/blob/main/INSTALACION_UBUNTU_22.04.md"