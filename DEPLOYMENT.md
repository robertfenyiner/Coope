# Guía de Despliegue Detallada

Esta guía proporciona instrucciones paso a paso para desplegar la aplicación Expense Tracker en un servidor Ubuntu 24.04.

## 🎯 Objetivo

Desplegar una aplicación web de gestión de gastos completa con:
- Backend Node.js/Express
- Frontend React
- Base de datos SQLite
- Servidor web Nginx
- Gestión de procesos con PM2
- SSL con Let's Encrypt
- Configuración de seguridad

## 📋 Prerequisitos del Servidor

### Hardware Mínimo Recomendado

- **CPU**: 1 vCPU (2 vCPU recomendado)
- **RAM**: 1GB (2GB recomendado)
- **Almacenamiento**: 10GB (20GB recomendado)
- **Ancho de banda**: 1TB/mes

### Software

- Ubuntu 24.04 LTS
- Acceso SSH con sudo
- Dominio apuntando al servidor (opcional para SSL)

## 🚀 Instalación Paso a Paso

### Paso 1: Preparación del Servidor

```bash
# Conectar por SSH
ssh usuario@tu-servidor-ip

# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar herramientas básicas
sudo apt install -y curl wget git unzip software-properties-common

# Configurar zona horaria
sudo timedatectl set-timezone America/Bogota  # Ajustar según tu zona
```

### Paso 2: Instalar Node.js

```bash
# Instalar Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalación
node --version  # Debe mostrar v18.x.x
npm --version   # Debe mostrar 9.x.x o superior

# Actualizar npm a la última versión
sudo npm install -g npm@latest
```

### Paso 3: Instalar Nginx

```bash
# Instalar Nginx
sudo apt install -y nginx

# Iniciar y habilitar Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar estado
sudo systemctl status nginx

# Verificar que funciona
curl http://localhost  # Debe mostrar página de bienvenida de Nginx
```

### Paso 4: Instalar PM2

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Verificar instalación
pm2 --version

# Configurar PM2 para arranque automático
pm2 startup
# Ejecutar el comando que muestre PM2
```

### Paso 5: Configurar Usuario y Permisos

```bash
# Crear usuario para la aplicación (opcional)
sudo adduser expense-app
sudo usermod -aG sudo expense-app

# O usar usuario actual y configurar permisos
sudo mkdir -p /opt/expense-tracker
sudo chown $USER:$USER /opt/expense-tracker
```

### Paso 6: Clonar y Configurar la Aplicación

```bash
# Clonar repositorio
cd /opt
sudo git clone <URL_DEL_REPOSITORIO> gastos-robert
cd gastos-robert

# Cambiar permisos
sudo chown -R $USER:$USER /opt/gastos-robert

# Instalar dependencias del servidor
cd server
npm install --production

# Volver a raíz e instalar dependencias del cliente
cd ../client
npm install

# Construir aplicación para producción
npm run build

# Verificar que se creó la carpeta build
ls -la build/
```

### Paso 7: Configurar Variables de Entorno

```bash
cd /opt/gastos-robert/server

# Crear archivo .env
nano .env
```

Contenido del archivo `.env`:

```env
NODE_ENV=production
PORT=5000

# JWT Configuration
JWT_SECRET=TU_CLAVE_JWT_MUY_SEGURA_Y_LARGA_AQUI_AL_MENOS_32_CARACTERES
JWT_EXPIRES_IN=7d

# Email Configuration (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu-email@gmail.com
EMAIL_PASS=tu-app-password-de-gmail
EMAIL_FROM=tu-email@gmail.com

# Exchange Rate API (optional)
EXCHANGE_API_KEY=tu-clave-api-exchangerate

# Application URL
APP_URL=https://tu-dominio.com

# Database
DB_PATH=./expense_tracker.db
```

```bash
# Proteger archivo de configuración
chmod 600 .env

# Crear directorio para logs
sudo mkdir -p /var/log/expense-tracker
sudo chown $USER:$USER /var/log/expense-tracker
```

### Paso 8: Configurar PM2

```bash
cd /opt/gastos-robert

# Crear archivo de configuración PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'expense-tracker-api',
    script: './server/index.js',
    cwd: '/opt/gastos-robert',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/expense-tracker/error.log',
    out_file: '/var/log/expense-tracker/access.log',
    log_file: '/var/log/expense-tracker/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log'],
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Iniciar aplicación
pm2 start ecosystem.config.js --env production

# Verificar que está corriendo
pm2 status
pm2 logs expense-tracker-api

# Guardar configuración PM2
pm2 save

# Configurar inicio automático
pm2 startup
# Ejecutar el comando que muestre PM2
```

### Paso 9: Configurar Nginx

```bash
# Hacer backup de configuración por defecto
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Crear configuración para la aplicación
sudo nano /etc/nginx/sites-available/expense-tracker
```

Contenido del archivo de configuración de Nginx:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;  # Cambiar por tu dominio
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    # Serve React static files
    location / {
        root /opt/expense-tracker/client/build;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
        
        # Cache static files
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }
    }

    # API proxy
    location /api {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Stricter rate limiting for auth endpoints
    location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(env|log|conf)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

```bash
# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/expense-tracker /etc/nginx/sites-enabled/

# Deshabilitar sitio por defecto
sudo rm /etc/nginx/sites-enabled/default

# Probar configuración
sudo nginx -t

# Si todo está bien, recargar Nginx
sudo systemctl reload nginx

# Verificar estado
sudo systemctl status nginx
```

### Paso 10: Configurar Firewall (UFW)

```bash
# Verificar estado del firewall
sudo ufw status

# Configurar reglas básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH (cambiar 22 por tu puerto SSH si es diferente)
sudo ufw allow 22/tcp

# Permitir HTTP y HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Habilitar firewall
sudo ufw enable

# Verificar configuración
sudo ufw status verbose
```

### Paso 11: Configurar SSL con Let's Encrypt (Opcional pero Recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado (cambiar tu-dominio.com)
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Verificar renovación automática
sudo certbot renew --dry-run

# Configurar renovación automática en crontab
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### Paso 12: Configurar Monitoreo y Logs

```bash
# Configurar rotación de logs
sudo nano /etc/logrotate.d/expense-tracker
```

Contenido del archivo de rotación de logs:

```
/var/log/expense-tracker/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 tu-usuario tu-usuario
    postrotate
        pm2 reload expense-tracker-api
    endscript
}
```

```bash
# Configurar monitoreo con PM2
pm2 install pm2-logrotate

# Configurar alertas básicas (opcional)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

### Paso 13: Configurar Backup Automático

```bash
# Crear script de backup
sudo nano /usr/local/bin/backup-expense-tracker.sh
```

Contenido del script:

```bash
#!/bin/bash

# Configuración
BACKUP_DIR="/backup/expense-tracker"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="/opt/expense-tracker/server/expense_tracker.db"
APP_DIR="/opt/expense-tracker"

# Crear directorio de backup si no existe
mkdir -p $BACKUP_DIR

# Backup de base de datos
cp $DB_PATH $BACKUP_DIR/expense_tracker_$DATE.db

# Backup de configuración
tar -czf $BACKUP_DIR/config_$DATE.tar.gz $APP_DIR/server/.env $APP_DIR/ecosystem.config.js

# Eliminar backups antiguos (más de 30 días)
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
# Hacer ejecutable el script
sudo chmod +x /usr/local/bin/backup-expense-tracker.sh

# Configurar cron para backup diario a las 2 AM
echo "0 2 * * * /usr/local/bin/backup-expense-tracker.sh >> /var/log/backup.log 2>&1" | sudo crontab -
```

## ✅ Verificación de la Instalación

### Paso 14: Pruebas Finales

```bash
# Verificar que todos los servicios están funcionando
sudo systemctl status nginx
pm2 status

# Probar API
curl http://localhost:5000/api/health

# Probar frontend (si tienes dominio configurado)
curl http://tu-dominio.com

# Verificar logs
pm2 logs expense-tracker-api --lines 50
sudo tail -f /var/log/nginx/access.log
```

### Checklist de Verificación

- [ ] Node.js instalado y funcionando
- [ ] Nginx instalado y configurado
- [ ] PM2 gestionando la aplicación
- [ ] Base de datos SQLite creada
- [ ] Variables de entorno configuradas
- [ ] Firewall configurado correctamente
- [ ] SSL configurado (si aplica)
- [ ] Backup automático configurado
- [ ] Logs rotando correctamente
- [ ] Aplicación accesible desde navegador

## 🔧 Comandos de Mantenimiento

### Gestión de la Aplicación

```bash
# Reiniciar aplicación
pm2 restart expense-tracker-api

# Ver logs en tiempo real
pm2 logs expense-tracker-api --follow

# Monitorear recursos
pm2 monit

# Actualizar aplicación
cd /opt/expense-tracker
git pull origin main
npm install --production
cd client && npm run build
pm2 restart expense-tracker-api
```

### Gestión de Nginx

```bash
# Reiniciar Nginx
sudo systemctl restart nginx

# Verificar configuración
sudo nginx -t

# Ver logs de error
sudo tail -f /var/log/nginx/error.log
```

### Monitoreo del Sistema

```bash
# Ver uso de recursos
htop
df -h
free -h

# Ver conexiones activas
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
sudo netstat -tulpn | grep :5000
```

## 🚨 Solución de Problemas Comunes

### Problema: La aplicación no inicia

```bash
# Verificar logs de PM2
pm2 logs expense-tracker-api

# Verificar configuración
cd /opt/expense-tracker/server
node index.js  # Ejecutar directamente para ver errores
```

### Problema: Nginx muestra 502 Bad Gateway

```bash
# Verificar que la API está corriendo
curl http://localhost:5000/api/health

# Verificar logs de Nginx
sudo tail -f /var/log/nginx/error.log

# Verificar configuración de Nginx
sudo nginx -t
```

### Problema: SSL no funciona

```bash
# Verificar certificados
sudo certbot certificates

# Renovar certificados manualmente
sudo certbot renew

# Verificar configuración SSL
sudo nginx -t
```

### Problema: Base de datos no se puede escribir

```bash
# Verificar permisos
ls -la /opt/expense-tracker/server/expense_tracker.db
sudo chown $USER:$USER /opt/expense-tracker/server/expense_tracker.db
```

## 📞 Contacto y Soporte

Si encuentras problemas durante el despliegue:

1. Revisar los logs de la aplicación y Nginx
2. Verificar la configuración de variables de entorno
3. Comprobar que todos los servicios estén funcionando
4. Consultar la documentación adicional en README.md

Para problemas específicos, crear un issue en el repositorio del proyecto con:
- Descripción del problema
- Logs relevantes
- Configuración del sistema
- Pasos para reproducir el error