#!/bin/bash

# ======================================
# INSTALACIÓN MANUAL SIMPLIFICADA
# COOPEENORTOL - Ubuntu Server 22.04
# ======================================

# Este script es para casos donde el instalador automático falla
# Asume que PostgreSQL, Redis y Node.js ya están instalados

set -e

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[ÉXITO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuración
APP_USER="coope"
APP_DIR="/opt/coopeenortol"
DB_NAME="coopeenortol_db"
DB_USER="coopeenortol_user"

log "Iniciando instalación manual de Coopeenortol..."

# Verificar usuario actual
current_user=$(whoami)
if [ "$current_user" != "$APP_USER" ]; then
    error "Este script debe ejecutarse como usuario '$APP_USER'"
    echo "Ejecute: sudo su - $APP_USER"
    echo "Luego: bash scripts/install-manual.sh"
    exit 1
fi

# Verificar directorio
if [ ! -d "$APP_DIR" ]; then
    error "Directorio $APP_DIR no existe"
    echo "Crear con: sudo mkdir -p $APP_DIR && sudo chown $APP_USER:$APP_USER $APP_DIR"
    exit 1
fi

cd $APP_DIR

# Clonar repositorio si no existe
if [ ! -d ".git" ]; then
    log "Clonando repositorio..."
    git clone https://github.com/robertfenyiner/Coope.git .
else
    log "Actualizando repositorio..."
    git pull origin main
fi

# Verificar archivos necesarios
if [ ! -f "server/database/schema.sql" ]; then
    error "Archivo schema.sql no encontrado"
    echo "Creando schema.sql temporal..."
    
    mkdir -p server/database
    cat > server/database/schema.sql << 'EOF'
-- Schema temporal básico para Coopeenortol
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla de usuarios básica
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    es_admin BOOLEAN DEFAULT FALSE,
    es_activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Insertar usuario admin por defecto
INSERT INTO usuarios (username, email, password_hash, nombre_completo, es_admin) VALUES
('admin', 'admin@coopeenortol.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeaHxz4XZA3Vh9K16', 'Administrador del Sistema', true)
ON CONFLICT (username) DO NOTHING;
EOF

    success "Schema básico creado"
fi

# Instalar dependencias
log "Instalando dependencias..."

# Proyecto principal
npm install --production || {
    error "Falló instalación de dependencias principales"
    exit 1
}

# Servidor
cd server
npm install --production || {
    error "Falló instalación de dependencias del servidor"
    exit 1
}

# Cliente
cd ../client
npm install || {
    error "Falló instalación de dependencias del cliente"
    exit 1
}

# Construir cliente
log "Construyendo frontend..."
npm run build || {
    error "Falló construcción del frontend"
    exit 1
}

cd ..

# Crear archivo .env si no existe
if [ ! -f "server/.env" ]; then
    log "Creando archivo .env..."
    cp server/.env.coopeenortol server/.env
    
    # Generar JWT secret seguro
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/tu_jwt_secret_muy_seguro_aqui_32_caracteres_minimo/$JWT_SECRET/" server/.env
    
    success "Archivo .env creado. IMPORTANTE: Revisar y configurar credenciales"
fi

# Inicializar base de datos
log "Inicializando base de datos..."
read -s -p "Ingrese la contraseña de PostgreSQL para el usuario $DB_USER: " DB_PASSWORD
echo

export PGPASSWORD=$DB_PASSWORD
psql -h localhost -U $DB_USER -d $DB_NAME -f server/database/schema.sql || {
    error "Falló inicialización de base de datos"
    echo "Verifique que:"
    echo "1. PostgreSQL esté ejecutándose"
    echo "2. El usuario $DB_USER exista"
    echo "3. La base de datos $DB_NAME exista"
    echo "4. Las credenciales sean correctas"
    exit 1
}

# Crear directorios necesarios
mkdir -p logs uploads backups

# Configurar PM2
log "Configurando PM2..."
pm2 delete coopeenortol-server 2>/dev/null || true
pm2 start ecosystem.config.js --env production

success "Instalación manual completada"

echo
echo "========================================"
echo "    INSTALACIÓN COMPLETADA"
echo "========================================"
echo
echo "Próximos pasos:"
echo "1. Configurar Nginx (ver documentación)"
echo "2. Revisar archivo server/.env"
echo "3. Configurar credenciales de email"
echo "4. Acceder a la aplicación via navegador"
echo
echo "Comandos útiles:"
echo "  pm2 status                 - Ver estado"
echo "  pm2 logs coopeenortol-server - Ver logs"
echo "  pm2 restart coopeenortol-server - Reiniciar"
echo