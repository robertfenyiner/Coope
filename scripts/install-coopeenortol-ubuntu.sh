#!/bin/bash

# ======================================
# SCRIPT DE INSTALACIÓN AUTOMÁTICA
# COOPEENORTOL - Ubuntu Server 22.04
# ======================================

set -e  # Salir si ocurre algún error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
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

# Verificar que se ejecuta como root
if [[ $EUID -eq 0 ]]; then
   error "Este script no debe ejecutarse como root"
   echo "Ejecuta: bash install-coopeenortol-ubuntu.sh"
   exit 1
fi

# Verificar Ubuntu 22.04
if ! grep -q "22.04" /etc/os-release; then
    error "Este script está diseñado para Ubuntu 22.04"
    exit 1
fi

log "Iniciando instalación de Coopeenortol..."

# ======================================
# CONFIGURACIÓN DE VARIABLES
# ======================================

# Solicitar configuración al usuario
echo
echo "========================================"
echo "    CONFIGURACIÓN DE COOPEENORTOL"
echo "========================================"
echo

read -p "Ingrese la dirección IP del servidor: " SERVER_IP
read -p "Ingrese dominio (opcional, presiona Enter para omitir): " DOMAIN
read -s -p "Ingrese contraseña para PostgreSQL: " DB_PASSWORD
echo
read -s -p "Ingrese contraseña para Redis: " REDIS_PASSWORD
echo
read -p "Ingrese email para notificaciones: " ADMIN_EMAIL

# Configuraciones por defecto
DB_NAME="coopeenortol_db"
DB_USER="coopeenortol_user"
APP_USER="coope"
APP_DIR="/opt/coopeenortol"

echo
log "Configuración recibida. Iniciando instalación..."

# ======================================
# ACTUALIZACIÓN DEL SISTEMA
# ======================================

log "Actualizando sistema..."
sudo apt update && sudo apt upgrade -y

log "Instalando herramientas básicas..."
sudo apt install -y curl wget git unzip software-properties-common \
    apt-transport-https ca-certificates gnupg lsb-release \
    build-essential htop tree vim ufw

# ======================================
# CREACIÓN DE USUARIO DE APLICACIÓN
# ======================================

log "Configurando usuario de aplicación..."
if ! id "$APP_USER" &>/dev/null; then
    # Crear el directorio primero si no existe
    sudo mkdir -p $APP_DIR
    
    # Crear usuario del sistema
    sudo adduser --system --group --home $APP_DIR --shell /bin/bash $APP_USER
    success "Usuario $APP_USER creado"
else
    warning "Usuario $APP_USER ya existe"
    # Asegurar que el directorio existe
    sudo mkdir -p $APP_DIR
fi

# Configurar permisos del directorio
sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod 755 $APP_DIR

# Verificar que el usuario puede acceder al directorio
sudo -u $APP_USER test -w $APP_DIR || {
    error "El usuario $APP_USER no puede escribir en $APP_DIR"
    exit 1
}

success "Usuario y directorio configurados correctamente"

# ======================================
# INSTALACIÓN DE POSTGRESQL
# ======================================

log "Instalando PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib postgresql-client

# Iniciar servicios
sudo systemctl start postgresql
sudo systemctl enable postgresql

log "Configurando PostgreSQL..."
# Crear base de datos y usuario (con manejo de errores si ya existen)
sudo -u postgres psql << EOF
-- Intentar crear base de datos
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME') THEN
        CREATE DATABASE $DB_NAME;
        RAISE NOTICE 'Base de datos $DB_NAME creada exitosamente';
    ELSE
        RAISE NOTICE 'Base de datos $DB_NAME ya existe, continuando...';
    END IF;
END
\$\$;

-- Intentar crear usuario
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'Usuario $DB_USER creado exitosamente';
    ELSE
        RAISE NOTICE 'Usuario $DB_USER ya existe, continuando...';
    END IF;
END
\$\$;

-- Otorgar privilegios
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER USER $DB_USER CREATEDB;
\q
EOF

# Configurar autenticación
sudo sed -i "/^local.*all.*postgres.*peer/a local   $DB_NAME  $DB_USER  md5" /etc/postgresql/14/main/pg_hba.conf

# Optimizar PostgreSQL para producción
sudo bash -c "cat >> /etc/postgresql/14/main/postgresql.conf << EOF

# Optimizaciones para Coopeenortol
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
max_connections = 100
EOF"

sudo systemctl restart postgresql
success "PostgreSQL configurado correctamente"

# ======================================
# INSTALACIÓN DE REDIS
# ======================================

log "Instalando Redis..."
sudo apt install -y redis-server

# --- Solución automática de permisos y procesos Redis ---
log "Verificando permisos y procesos de Redis antes de reiniciar..."
# Asegurar permisos correctos en el directorio de trabajo
if [ -d "/var/lib/redis" ]; then
    sudo chown redis:redis /var/lib/redis
    sudo chmod 770 /var/lib/redis
fi
# Matar procesos Redis atascados si existen
if pgrep redis-server >/dev/null; then
    for pid in $(pgrep redis-server); do
        sudo kill -9 $pid || true
    done
    # Eliminar archivo de lock si existe
    sudo rm -f /var/run/redis/redis-server.pid
fi
log "Permisos y procesos de Redis verificados."

# Configurar Redis
sudo bash -c "cat > /etc/redis/redis.conf << EOF
bind 127.0.0.1 ::1
port 6379
requirepass $REDIS_PASSWORD
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
EOF"

sudo systemctl restart redis-server
sudo systemctl enable redis-server
success "Redis configurado correctamente"

# ======================================
# INSTALACIÓN DE NODE.JS
# ======================================

log "Instalando Node.js 18 LTS..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node_version=$(node --version)
npm_version=$(npm --version)
log "Node.js instalado: $node_version"
log "npm instalado: $npm_version"

# Instalar PM2
sudo npm install -g pm2
success "Node.js y PM2 instalados correctamente"

# ======================================
# INSTALACIÓN DE NGINX
# ======================================

log "Instalando Nginx..."
sudo apt install -y nginx

sudo systemctl start nginx
sudo systemctl enable nginx
success "Nginx instalado correctamente"

# ======================================
# CONFIGURACIÓN DEL FIREWALL
# ======================================

log "Configurando firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
# sudo ufw allow 5432  # PostgreSQL - solo para acceso externo si es necesario
success "Firewall configurado"

# ======================================
# CLONACIÓN DEL REPOSITORIO
# ======================================

log "Clonando repositorio de Coopeenortol..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR

# Verificar si ya existe un repositorio
if [ -d ".git" ]; then
    echo "Repositorio existente encontrado, actualizando..."
    git pull origin main
else
    echo "Clonando repositorio desde GitHub..."
    git clone https://github.com/robertfenyiner/Coope.git .
    
    if [ \$? -ne 0 ]; then
        echo "ERROR: Falló la clonación del repositorio"
        echo "Verifique que el repositorio esté público y accesible"
        exit 1
    fi
fi

# Verificar que se clonó correctamente
if [ ! -f "package.json" ]; then
    echo "ERROR: El repositorio no se clonó correctamente"
    echo "Contenido del directorio:"
    ls -la
    exit 1
fi

echo "Repositorio clonado/actualizado exitosamente"
EOF

success "Repositorio configurado"

# ======================================
# CONFIGURACIÓN DE VARIABLES DE ENTORNO
# ======================================

log "Configurando variables de entorno..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR/server

cat > .env << EOL
# Base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# JWT
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=24h

# Email (configurar según tu proveedor)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$ADMIN_EMAIL
SMTP_PASS=tu_password_de_aplicacion
FROM_EMAIL=noreply@coopeenortol.com
FROM_NAME=Coopeenortol

# Configuración de archivos
UPLOAD_DIR=$APP_DIR/uploads
MAX_FILE_SIZE=10485760
ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf,doc,docx

# Configuración del servidor
NODE_ENV=production
PORT=5000
EOL
EOF

success "Variables de entorno configuradas"

# ======================================
# INSTALACIÓN DE DEPENDENCIAS
# ======================================

log "Instalando dependencias de la aplicación..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR

echo "Instalando dependencias del proyecto principal..."
npm install --production

echo "Instalando dependencias del servidor..."
cd server
npm install --production

echo "Instalando dependencias del cliente..."
cd ../client
npm install

# Intentar corregir vulnerabilidades automáticamente
echo "Verificando y corrigiendo vulnerabilidades de seguridad..."
npm audit fix || echo "Algunas vulnerabilidades no pudieron ser corregidas automáticamente"

cd ..
echo "Instalación de dependencias completada"
EOF

success "Dependencias instaladas"

# ======================================
# INICIALIZACIÓN DE BASE DE DATOS
# ======================================

log "Inicializando base de datos..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR

# Verificar que el archivo schema.sql existe
if [ ! -f "server/database/schema.sql" ]; then
    echo "ERROR: No se encontró el archivo server/database/schema.sql"
    echo "Contenido del directorio server:"
    ls -la server/ || echo "Directorio server no existe"
    echo "Contenido del directorio server/database:"
    ls -la server/database/ || echo "Directorio server/database no existe"
    exit 1
fi

echo "Ejecutando schema de base de datos desde: \$(pwd)/server/database/schema.sql"
export PGPASSWORD=$DB_PASSWORD
psql -h localhost -U $DB_USER -d $DB_NAME -f server/database/schema.sql

if [ \$? -eq 0 ]; then
    echo "Schema de base de datos ejecutado exitosamente"
else
    echo "ERROR: Falló la ejecución del schema de base de datos"
    exit 1
fi
EOF

success "Base de datos inicializada"

# ======================================
# CONSTRUCCIÓN DEL FRONTEND
# ======================================

log "Construyendo frontend para producción..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR/client
npm run build
EOF

success "Frontend construido"

# ======================================
# CONFIGURACIÓN DE PM2
# ======================================

log "Configurando PM2..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR

cat > ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'coopeenortol-server',
    script: './server/index.js',
    cwd: '$APP_DIR',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '$APP_DIR/logs/err.log',
    out_file: '$APP_DIR/logs/out.log',
    log_file: '$APP_DIR/logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
EOL

mkdir -p logs
mkdir -p uploads
EOF

success "PM2 configurado"

# ======================================
# CONFIGURACIÓN DE NGINX
# ======================================

log "Configurando Nginx..."

# Determinar server_name
if [ -n "$DOMAIN" ]; then
    SERVER_NAME="$DOMAIN"
else
    SERVER_NAME="$SERVER_IP"
fi

sudo bash << EOF
cat > /etc/nginx/sites-available/coopeenortol << EOL
server {
    listen 80;
    server_name $SERVER_NAME;

    access_log /var/log/nginx/coopeenortol_access.log;
    error_log /var/log/nginx/coopeenortol_error.log;

    # Configuración de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Frontend
    location / {
        root $APP_DIR/client/build;
        try_files \$uri \$uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Archivos subidos
    location /uploads/ {
        alias $APP_DIR/uploads/;
        add_header X-Content-Type-Options nosniff;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    client_max_body_size 20M;
}
EOL

# Habilitar sitio
ln -sf /etc/nginx/sites-available/coopeenortol /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
nginx -t
systemctl restart nginx
EOF

success "Nginx configurado"

# ======================================
# INICIAR APLICACIÓN
# ======================================

log "Iniciando aplicación con PM2..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR
pm2 start ecosystem.config.js --env production
pm2 save
EOF

# Configurar PM2 para inicio automático
sudo env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp $APP_DIR

success "Aplicación iniciada"

# ======================================
# SCRIPTS DE MANTENIMIENTO
# ======================================

log "Creando scripts de mantenimiento..."
sudo -u $APP_USER bash << EOF
cd $APP_DIR
mkdir -p scripts

# Script de backup
cat > scripts/backup.sh << 'EOL'
#!/bin/bash
TIMESTAMP=\$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$APP_DIR/backups"
mkdir -p \$BACKUP_DIR

echo "Iniciando backup de base de datos..."
export PGPASSWORD=$DB_PASSWORD
pg_dump -h localhost -U $DB_USER -d $DB_NAME > "\$BACKUP_DIR/db_backup_\$TIMESTAMP.sql"

echo "Iniciando backup de archivos..."
tar -czf "\$BACKUP_DIR/uploads_backup_\$TIMESTAMP.tar.gz" $APP_DIR/uploads/

tar -czf "\$BACKUP_DIR/config_backup_\$TIMESTAMP.tar.gz" $APP_DIR/server/.env $APP_DIR/ecosystem.config.js

find \$BACKUP_DIR -name "*.sql" -mtime +7 -delete
find \$BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completado: \$TIMESTAMP"
EOL

# Script de actualización
cat > scripts/update.sh << 'EOL'
#!/bin/bash
cd $APP_DIR

echo "Iniciando actualización de Coopeenortol..."
./scripts/backup.sh

pm2 stop coopeenortol-server
git pull origin main
npm install
cd server && npm install
cd ../client && npm install && npm run build
pm2 start coopeenortol-server

echo "Actualización completada"
EOL

# Script de monitoreo
cat > scripts/monitor.sh << 'EOL'
#!/bin/bash
echo "=== Estado de Coopeenortol ==="
echo "Fecha: \$(date)"
echo
echo "=== Estado de PM2 ==="
pm2 status
echo
echo "=== Uso de Disco ==="
df -h $APP_DIR
echo
echo "=== Uso de Memoria ==="
free -h
EOL

chmod +x scripts/*.sh
EOF

# ======================================
# CONFIGURAR LOGROTATE
# ======================================

log "Configurando logrotate..."
sudo bash << EOF
cat > /etc/logrotate.d/coopeenortol << EOL
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su $APP_USER $APP_USER
}
EOL
EOF

# ======================================
# CONFIGURAR CRONTAB PARA BACKUPS
# ======================================

log "Configurando backup automático..."
sudo -u $APP_USER bash << EOF
(crontab -l 2>/dev/null; echo "0 2 * * * $APP_DIR/scripts/backup.sh") | crontab -
EOF

# ======================================
# VERIFICACIONES FINALES
# ======================================

log "Realizando verificaciones finales..."

# Esperar un momento para que los servicios se inicien
sleep 10

# Verificar servicios
if systemctl is-active --quiet postgresql; then
    success "PostgreSQL está funcionando"
else
    error "PostgreSQL no está funcionando"
fi

if systemctl is-active --quiet redis-server; then
    success "Redis está funcionando"
else
    error "Redis no está funcionando"
fi

if systemctl is-active --quiet nginx; then
    success "Nginx está funcionando"
else
    error "Nginx no está funcionando"
fi

# Verificar PM2
if sudo -u $APP_USER pm2 list | grep -q "coopeenortol-server"; then
    success "Aplicación Coopeenortol está funcionando en PM2"
else
    error "Aplicación Coopeenortol no está funcionando en PM2"
fi

# Verificar conexión a la aplicación
if curl -s http://localhost:5000/api/health >/dev/null; then
    success "API de Coopeenortol responde correctamente"
else
    warning "API de Coopeenortol no responde (puede necesitar tiempo adicional para iniciar)"
fi

# ======================================
# RESUMEN DE INSTALACIÓN
# ======================================

echo
echo "========================================"
echo "    INSTALACIÓN COMPLETADA"
echo "========================================"
echo
success "Coopeenortol ha sido instalado correctamente!"
echo
echo "Información de acceso:"
echo "  • URL: http://$SERVER_NAME"
echo "  • Usuario admin: admin"
echo "  • Email admin: admin@coopeenortol.com"
echo "  • Contraseña admin: (configurar en primer acceso)"
echo
echo "Ubicación de archivos:"
echo "  • Aplicación: $APP_DIR"
echo "  • Logs: $APP_DIR/logs"
echo "  • Backups: $APP_DIR/backups"
echo "  • Uploads: $APP_DIR/uploads"
echo
echo "Comandos útiles:"
echo "  • Ver estado: sudo -u $APP_USER pm2 status"
echo "  • Ver logs: sudo -u $APP_USER pm2 logs"
echo "  • Hacer backup: sudo -u $APP_USER $APP_DIR/scripts/backup.sh"
echo "  • Actualizar: sudo -u $APP_USER $APP_DIR/scripts/update.sh"
echo "  • Monitorear: sudo -u $APP_USER $APP_DIR/scripts/monitor.sh"
echo
warning "IMPORTANTE: Configura las credenciales de email en $APP_DIR/server/.env"
warning "IMPORTANTE: Cambia las contraseñas por defecto en el primer acceso"
echo
echo "Para soporte, consulta la documentación en:"
echo "https://github.com/coopeenortol/plataforma/blob/main/INSTALACION_UBUNTU_22.04.md"
echo