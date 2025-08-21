# Instalación de Coopeenortol en Ubuntu Server 22.04

## Guía Completa de Instalación y Configuración

### Requisitos del Sistema

- **Sistema Operativo**: Ubuntu Server 22.04 LTS
- **RAM**: Mínimo 4GB (Recomendado 8GB para 500+ asociados)
- **Almacenamiento**: Mínimo 50GB SSD
- **CPU**: 2 cores mínimo (Recomendado 4 cores)
- **Red**: Conexión estable a internet

### Requisitos de Software

- Node.js 18+ LTS
- PostgreSQL 14+
- Redis 6+
- Nginx
- PM2 (para gestión de procesos)
- Git

---

## 1. Preparación del Servidor

### 1.1 Actualizar el Sistema

```bash
# Actualizar repositorios y sistema
sudo apt update && sudo apt upgrade -y

# Instalar herramientas básicas
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
```

### 1.2 Crear Usuario para la Aplicación

```bash
# Crear usuario dedicado para Coopeenortol
sudo adduser --system --group --home /opt/coopeenortol --shell /bin/bash coopeenortol

# Agregar usuario al grupo sudo (opcional para mantenimiento)
sudo usermod -aG sudo coopeenortol

# Crear directorio de la aplicación
sudo mkdir -p /opt/coopeenortol
sudo chown -R coopeenortol:coopeenortol /opt/coopeenortol
```

---

## 2. Instalación de PostgreSQL

### 2.1 Instalar PostgreSQL

```bash
# Instalar PostgreSQL 14+
sudo apt install -y postgresql postgresql-contrib postgresql-client

# Iniciar y habilitar servicio
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.2 Configurar PostgreSQL

```bash
# Cambiar a usuario postgres
sudo -u postgres psql

-- Dentro de PostgreSQL, ejecutar:
-- Crear base de datos y usuario
CREATE DATABASE coopeenortol_db;
CREATE USER coopeenortol_user WITH ENCRYPTED PASSWORD 'Coope2024!';
GRANT ALL PRIVILEGES ON DATABASE coopeenortol_db TO coopeenortol_user;
ALTER USER coopeenortol_user CREATEDB;

-- Salir de PostgreSQL
\q
```

### 2.3 Configurar Autenticación

```bash
# Editar configuración de PostgreSQL
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Agregar esta línea antes de las demás reglas:
# local   coopeenortol_db  coopeenortol_user  md5

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

### 2.4 Optimizar PostgreSQL para Producción

```bash
# Editar configuración principal
sudo nano /etc/postgresql/14/main/postgresql.conf

# Modificar estos parámetros según los recursos del servidor:
# shared_buffers = 256MB                    # 25% de la RAM
# effective_cache_size = 1GB               # 75% de la RAM
# maintenance_work_mem = 64MB
# checkpoint_completion_target = 0.9
# wal_buffers = 16MB
# default_statistics_target = 100
# random_page_cost = 1.1
# max_connections = 100

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

---

## 3. Instalación de Redis

```bash
# Instalar Redis
sudo apt install -y redis-server

# Configurar Redis
sudo nano /etc/redis/redis.conf

# Modificar estas configuraciones:
# bind 127.0.0.1 ::1
# requirepass Coope2024Redis!
# maxmemory 512mb
# maxmemory-policy allkeys-lru

# Reiniciar Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

---

## 4. Instalación de Node.js

```bash
# Instalar NodeJS 18 LTS usando NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node --version
npm --version

# Instalar PM2 globalmente
sudo npm install -g pm2
```

---

## 5. Instalación de Nginx

```bash
# Instalar Nginx
sudo apt install -y nginx

# Iniciar y habilitar Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar instalación
sudo systemctl status nginx
```

---

## 6. Configuración del Firewall

```bash
# Configurar UFW (Uncomplicated Firewall)
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 5432  # PostgreSQL (solo si necesitas acceso externo)
sudo ufw status
```

---

## 7. Despliegue de la Aplicación

### 7.1 Clonar el Repositorio

```bash
# Cambiar al usuario de la aplicación
sudo su - coopeenortol

# Navegar al directorio de la aplicación
cd /opt/coopeenortol

# Clonar el repositorio
git clone https://github.com/robertfenyiner/Coope.git .

# O si usas SSH:
# git clone git@github.com:robertfenyiner/Coope.git .
```

### 7.2 Configurar Variables de Entorno

```bash
# Crear archivo de variables de entorno para el servidor
cp server/.env.example server/.env
nano server/.env
```

**Contenido del archivo .env:**

```bash
# Base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=coopeenortol_db
DB_USER=coopeenortol_user
DB_PASSWORD=Coope2024!

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Coope2024Redis!

# JWT
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui_2024
JWT_EXPIRES_IN=24h

# Email (configurar según tu proveedor)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_password_de_aplicacion
FROM_EMAIL=noreply@coopeenortol.com
FROM_NAME=Coopeenortol

# Configuración de archivos
UPLOAD_DIR=/opt/coopeenortol/uploads
MAX_FILE_SIZE=10485760
ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf,doc,docx

# Configuración del servidor
NODE_ENV=production
PORT=5000
```

### 7.3 Instalar Dependencias

```bash
# Instalar dependencias del proyecto principal
npm install

# Instalar dependencias del servidor
cd server
npm install

# Instalar dependencias del cliente
cd ../client
npm install

# Volver al directorio raíz
cd /opt/coopeenortol
```

### 7.4 Inicializar Base de Datos

```bash
# Ejecutar el script de inicialización de base de datos
cd server
node -e "
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'coopeenortol_user',
  host: 'localhost',
  database: 'coopeenortol_db',
  password: 'Coope2024!',
  port: 5432,
});

const schema = fs.readFileSync('./database/schema.sql', 'utf8');
pool.query(schema).then(() => {
  console.log('Base de datos inicializada correctamente');
  process.exit(0);
}).catch(err => {
  console.error('Error inicializando base de datos:', err);
  process.exit(1);
});
"
```

### 7.5 Construir la Aplicación Frontend

```bash
# Construir el cliente para producción
cd client
npm run build

# Volver al directorio raíz
cd /opt/coopeenortol
```

---

## 8. Configuración de PM2

### 8.1 Crear Archivo de Configuración PM2

```bash
# Crear archivo ecosystem.config.js
nano ecosystem.config.js
```

**Contenido del archivo ecosystem.config.js:**

```javascript
module.exports = {
  apps: [{
    name: 'coopeenortol-server',
    script: './server/index.js',
    cwd: '/opt/coopeenortol',
    instances: 2, // Usar 2 instancias para balanceo de carga
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/opt/coopeenortol/logs/err.log',
    out_file: '/opt/coopeenortol/logs/out.log',
    log_file: '/opt/coopeenortol/logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
```

### 8.2 Iniciar la Aplicación con PM2

```bash
# Crear directorio de logs
mkdir -p /opt/coopeenortol/logs

# Iniciar la aplicación
pm2 start ecosystem.config.js --env production

# Configurar PM2 para arranque automático
pm2 startup
pm2 save

# Verificar estado
pm2 status
pm2 logs
```

---

## 9. Configuración de Nginx

### 9.1 Crear Configuración del Sitio

```bash
# Crear archivo de configuración de Nginx
sudo nano /etc/nginx/sites-available/coopeenortol
```

**Contenido del archivo de configuración:**

```nginx
server {
    listen 80;
    server_name tu_ip_del_servidor; # Cambiar por tu IP o dominio

    # Configuración de logs
    access_log /var/log/nginx/coopeenortol_access.log;
    error_log /var/log/nginx/coopeenortol_error.log;

    # Configuración de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Configuración de archivos estáticos del frontend
    location / {
        root /opt/coopeenortol/client/build;
        try_files $uri $uri/ /index.html;
        
        # Cache para archivos estáticos
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Proxy para API del backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Configuración para archivos subidos
    location /uploads/ {
        alias /opt/coopeenortol/uploads/;
        
        # Seguridad para archivos subidos
        add_header X-Content-Type-Options nosniff;
        
        # Cache para archivos subidos
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Límites de tamaño de archivo
    client_max_body_size 20M;
}
```

### 9.2 Habilitar el Sitio

```bash
# Habilitar el sitio
sudo ln -s /etc/nginx/sites-available/coopeenortol /etc/nginx/sites-enabled/

# Deshabilitar sitio por defecto
sudo rm /etc/nginx/sites-enabled/default

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## 10. Configuración de SSL con Let's Encrypt (Opcional)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL (requiere dominio configurado)
sudo certbot --nginx -d tu_dominio.com

# Verificar renovación automática
sudo certbot renew --dry-run
```

---

## 11. Scripts de Mantenimiento

### 11.1 Script de Backup

```bash
# Crear directorio para scripts
mkdir -p /opt/coopeenortol/scripts

# Crear script de backup
nano /opt/coopeenortol/scripts/backup.sh
```

**Contenido del script de backup:**

```bash
#!/bin/bash

# Script de backup para Coopeenortol
# Ejecutar como: ./backup.sh

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/opt/coopeenortol/backups"
DB_NAME="coopeenortol_db"
DB_USER="coopeenortol_user"

# Crear directorio de backups si no existe
mkdir -p $BACKUP_DIR

# Backup de la base de datos
echo "Iniciando backup de base de datos..."
pg_dump -h localhost -U $DB_USER -d $DB_NAME > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Backup de archivos subidos
echo "Iniciando backup de archivos..."
tar -czf "$BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz" /opt/coopeenortol/uploads/

# Backup de configuración
tar -czf "$BACKUP_DIR/config_backup_$TIMESTAMP.tar.gz" /opt/coopeenortol/server/.env /opt/coopeenortol/ecosystem.config.js

# Eliminar backups antiguos (mantener solo últimos 7 días)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completado: $TIMESTAMP"
```

```bash
# Hacer ejecutable
chmod +x /opt/coopeenortol/scripts/backup.sh

# Programar backup diario con crontab
crontab -e

# Agregar esta línea para backup diario a las 2:00 AM
# 0 2 * * * /opt/coopeenortol/scripts/backup.sh
```

### 11.2 Script de Actualización

```bash
# Crear script de actualización
nano /opt/coopeenortol/scripts/update.sh
```

**Contenido del script de actualización:**

```bash
#!/bin/bash

# Script de actualización para Coopeenortol
# Ejecutar como: ./update.sh

cd /opt/coopeenortol

echo "Iniciando actualización de Coopeenortol..."

# Hacer backup antes de actualizar
./scripts/backup.sh

# Detener la aplicación
pm2 stop coopeenortol-server

# Actualizar código desde Git
git pull origin main

# Instalar nuevas dependencias
npm install
cd server && npm install
cd ../client && npm install && npm run build

# Ejecutar migraciones de base de datos si existen
# node server/migrations/run.js

# Reiniciar la aplicación
pm2 start coopeenortol-server

echo "Actualización completada"
```

```bash
# Hacer ejecutable
chmod +x /opt/coopeenortol/scripts/update.sh
```

---

## 12. Monitoreo y Logs

### 12.1 Configurar Logrotate

```bash
# Crear configuración de logrotate
sudo nano /etc/logrotate.d/coopeenortol
```

**Contenido:**

```
/opt/coopeenortol/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su coopeenortol coopeenortol
}
```

### 12.2 Script de Monitoreo

```bash
# Crear script de monitoreo
nano /opt/coopeenortol/scripts/monitor.sh
```

**Contenido:**

```bash
#!/bin/bash

# Script de monitoreo básico

echo "=== Estado de Coopeenortol ==="
echo "Fecha: $(date)"
echo

# Estado de PM2
echo "=== Estado de PM2 ==="
pm2 status

# Estado de PostgreSQL
echo "=== Estado de PostgreSQL ==="
sudo systemctl status postgresql --no-pager -l

# Estado de Redis
echo "=== Estado de Redis ==="
sudo systemctl status redis-server --no-pager -l

# Estado de Nginx
echo "=== Estado de Nginx ==="
sudo systemctl status nginx --no-pager -l

# Uso de disco
echo "=== Uso de Disco ==="
df -h /opt/coopeenortol

# Memoria utilizada
echo "=== Uso de Memoria ==="
free -h
```

---

## 13. Verificación de la Instalación

### 13.1 Verificar Servicios

```bash
# Verificar que todos los servicios estén funcionando
sudo systemctl status postgresql
sudo systemctl status redis-server
sudo systemctl status nginx
pm2 status

# Verificar logs
pm2 logs coopeenortol-server --lines 50
```

### 13.2 Probar la Aplicación

```bash
# Probar conexión al backend
curl http://localhost:5000/api/health

# Probar acceso web
curl http://tu_ip_del_servidor
```

---

## 14. Solución de Problemas Comunes

### 14.1 Error de Conexión a PostgreSQL

```bash
# Verificar estado del servicio
sudo systemctl status postgresql

# Verificar configuración de conexión
sudo -u postgres psql -c "\l"

# Verificar logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### 14.2 Error de PM2

```bash
# Reiniciar PM2
pm2 restart all

# Ver logs detallados
pm2 logs --lines 100

# Verificar memoria
pm2 monit
```

### 14.3 Error de Nginx

```bash
# Verificar configuración
sudo nginx -t

# Ver logs de error
sudo tail -f /var/log/nginx/error.log

# Reiniciar servicio
sudo systemctl restart nginx
```

---

## 15. Comandos Útiles para Mantenimiento

```bash
# Ver estado general del sistema
./scripts/monitor.sh

# Hacer backup manual
./scripts/backup.sh

# Actualizar aplicación
./scripts/update.sh

# Ver logs en tiempo real
pm2 logs coopeenortol-server --lines 0

# Reiniciar aplicación
pm2 restart coopeenortol-server

# Ver métricas de rendimiento
pm2 monit

# Limpiar logs antiguos
pm2 flush

# Ver procesos y uso de recursos
htop
```

---

## 16. Configuración de Desarrollo Local

Para configurar un entorno de desarrollo local, seguir estos pasos:

```bash
# Clonar repositorio
git clone https://github.com/robertfenyiner/Coope.git
cd Coope

# Instalar dependencias
npm run install-deps

# Configurar variables de entorno para desarrollo
cp server/.env.example server/.env

# Iniciar en modo desarrollo
npm run dev
```

---

## Contacto y Soporte

Para soporte técnico o dudas sobre la instalación, contactar al equipo de desarrollo de Coopeenortol.

**Versión de la documentación**: 2.0.0  
**Última actualización**: $(date)
**Compatible con**: Ubuntu Server 22.04 LTS