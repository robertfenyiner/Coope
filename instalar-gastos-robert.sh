#!/bin/bash

set -e
# Validar que el script se ejecute como el usuario 'nina'
if [ "$(whoami)" != "nina" ]; then
  echo -e "\033[0;31mEste instalador debe ejecutarse como el usuario 'nina', no como root.\033[0m"
  echo -e "\033[1;33mSi el usuario 'nina' no existe, puedes crearlo y darle acceso root con:\033[0m"
  echo -e "\033[1;33msudo adduser nina\033[0m"
  echo -e "\033[1;33msudo usermod -aG sudo nina\033[0m"
  echo -e "\033[1;33mLuego inicia sesión como nina:\033[0m"
  echo -e "\033[1;33msu - nina\033[0m"
  echo -e "\033[1;33mSi el instalador está en /root, muévelo a /home/nina antes de ejecutarlo:\033[0m"
  echo -e "\033[1;33msudo mv /root/instalar-gastos-robert.sh /home/nina/instalar-gastos-robert.sh\033[0m"
  echo -e "\033[1;33msudo chown nina:nina /home/nina/instalar-gastos-robert.sh\033[0m"
  echo -e "\033[1;33mLuego ejecuta:\033[0m"
  echo -e "\033[1;33mbash instalar-gastos-robert.sh\033[0m"
  exit 1
fi

APP_NAME="gastos-robert"
REPO_URL="https://github.com/robertfenyiner/gastos.git"
USER_HOME="/home/nina"
CURRENT_USER="nina"
APP_DIR="$USER_HOME/$APP_NAME"
DB_PATH="$APP_DIR/server/gastos_robert.db"
PORT=5000

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}==== Instalador Automático Gastos Robert ====${NC}"

# Limpiar cualquier instalación previa en /root/gastos-robert y /home/robert/gastos-robert
if [ -d "/root/gastos-robert" ]; then
    echo -e "${YELLOW}Eliminando instalación previa en /root/gastos-robert...${NC}"
    sudo rm -rf /root/gastos-robert
fi
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Eliminando instalación previa en $APP_DIR...${NC}"
    sudo rm -rf "$APP_DIR"
fi

# 1. Actualizar sistema y herramientas básicas
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip software-properties-common build-essential

# 2. Verificar/instalar Node.js y npm
if command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}Node.js ya está instalado: $(node --version)${NC}"
else
    echo -e "${GREEN}Instalando Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if command -v npm >/dev/null 2>&1; then
    echo -e "${YELLOW}npm ya está instalado: $(npm --version)${NC}"
    NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -ge 20 ]; then
        echo -e "${GREEN}Actualizando npm...${NC}"
        sudo npm install -g npm@latest
    else
        echo -e "${YELLOW}No se actualizará npm porque Node.js < 20. Usando versión actual.${NC}"
    fi
else
    echo -e "${RED}npm no está instalado, instalando Node.js primero...${NC}"
    # Node.js ya se instala arriba si falta
fi

# 3. Verificar/instalar Nginx
if systemctl is-active --quiet nginx; then
    echo -e "${YELLOW}Nginx ya está corriendo.${NC}"
else
    echo -e "${GREEN}Instalando y arrancando Nginx...${NC}"
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
fi

# 4. Verificar/instalar PM2 y limpiar procesos previos
if command -v pm2 >/dev/null 2>&1; then
    echo -e "${YELLOW}PM2 ya está instalado: $(pm2 --version)${NC}"
else
    echo -e "${GREEN}Instalando PM2...${NC}"
    sudo npm install -g pm2
fi
if pm2 list | grep -q "$APP_NAME"; then
    echo -e "${YELLOW}Deteniendo y eliminando procesos PM2 previos de $APP_NAME...${NC}"
    pm2 stop "$APP_NAME" || true
    pm2 delete "$APP_NAME" || true
fi
if [ "$(pm2 list | grep -c 'online')" -gt 0 ]; then
    echo -e "${YELLOW}Deteniendo todos los procesos PM2 previos...${NC}"
    pm2 stop all || true
    pm2 delete all || true
fi

# Configurar PM2 arranque automático (no requiere pasos manuales si ejecutas como root o con sudo)
echo -e "${GREEN}Configurando arranque automático de PM2...${NC}"
pm2 startup systemd -u "$CURRENT_USER" --hp "$USER_HOME" >/dev/null 2>&1 || true
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$CURRENT_USER" --hp "$USER_HOME" >/dev/null 2>&1 || true
echo -e "${GREEN}Arranque automático de PM2 configurado.${NC}"

# 5. Clonar el repositorio (forzar clon limpio y mostrar errores)
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Eliminando carpeta existente antes de clonar...${NC}"
    sudo rm -rf "$APP_DIR"
fi

echo -e "${GREEN}Clonando repositorio desde $REPO_URL ...${NC}"
git clone "$REPO_URL" "$APP_DIR"
CLONE_EXIT_CODE=$?
if [ $CLONE_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Error al clonar el repositorio. Verifica tu conexión a internet y que la URL sea correcta.${NC}"
    exit 1
fi

if [ ! -d "$APP_DIR" ] || [ ! "$(ls -A "$APP_DIR")" ]; then
    echo -e "${RED}El repositorio está vacío o no se clonó correctamente.${NC}"
    exit 1
fi

sudo chown -R "$CURRENT_USER":"$CURRENT_USER" "$APP_DIR"

# --- Configuración adicional ---
read -p "Ingresa la IP pública del servidor: " SERVER_IP

# 1) Eliminar duplicados JS en el frontend
rm -f "$APP_DIR/client/src/App.js" "$APP_DIR/client/src/index.js"

# 2) Ajustar .env (backend y copia en la raíz)
cd "$APP_DIR/server"
[ ! -f .env ] && cp .env.example .env
sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://$SERVER_IP|" .env
sed -i "s|APP_URL=.*|APP_URL=http://$SERVER_IP|" .env
sed -i "s|DB_PATH=.*|DB_PATH=./gastos_robert.db|" .env

cp .env "$APP_DIR/.env"
sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://$SERVER_IP|" "$APP_DIR/.env"
sed -i "s|APP_URL=.*|APP_URL=http://$SERVER_IP|" "$APP_DIR/.env"

# 3) Actualizar IP en ecosystem.config.js
sed -i "s/host: \\['[^']*'\\]/host: ['$SERVER_IP']/" "$APP_DIR/ecosystem.config.js"
# --- Fin configuración adicional ---

# 6. Configurar variables de entorno
cd "$APP_DIR/server"
if [ ! -f ".env" ]; then
    cp .env.example .env
fi
sed -i "s|^DB_PATH=.*|DB_PATH=./gastos_robert.db|" .env
if ! grep -q "^JWT_SECRET=" .env; then
    echo "JWT_SECRET=$(openssl rand -hex 48)" >> .env
fi
chmod 600 .env
sudo chown "$CURRENT_USER":"$CURRENT_USER" .env

# 7. Crear base de datos si no existe
if [ ! -f "$DB_PATH" ]; then
    touch "$DB_PATH"
    chown "$CURRENT_USER":"$CURRENT_USER" "$DB_PATH"
    chmod 600 "$DB_PATH"
    echo -e "${GREEN}Base de datos creada en $DB_PATH${NC}"
fi

# 8. Instalar dependencias y construir frontend
echo -e "${GREEN}Instalando dependencias del backend...${NC}"
cd "$APP_DIR/server"
npm install --production || { echo -e "${RED}Error en npm install --production (backend)${NC}"; exit 1; }
echo -e "${GREEN}Dependencias del backend instaladas.${NC}"
# Copiar .env del backend a la raíz del proyecto para PM2
cp "$APP_DIR/server/.env" "$APP_DIR/.env"

# Crear carpeta de logs y asignar permisos correctos (antes del build frontend)
sudo mkdir -p /var/log/gastos-robert
sudo chown nina:nina /var/log/gastos-robert

echo -e "${GREEN}Instalando dependencias del frontend...${NC}"
cd "$APP_DIR/client"
rm -rf node_modules package-lock.json
npm install || { echo -e "${RED}Error en npm install (frontend)${NC}"; exit 1; }
echo -e "${GREEN}Dependencias del frontend instaladas.${NC}"
# Instalar react-scripts versión estable
npm install react-scripts@5.0.1 --save || { echo -e "${RED}Error instalando react-scripts@5.0.1${NC}"; exit 1; }
echo -e "${GREEN}react-scripts@5.0.1 instalado correctamente.${NC}"

echo -e "${GREEN}Construyendo frontend...${NC}"
npm run build || { echo -e "${RED}Error en npm run build (frontend)${NC}"; exit 1; }
echo -e "${GREEN}Frontend construido correctamente.${NC}"

# Asegurar permisos de lectura para Nginx en archivos estáticos y acceso en toda la ruta
chmod -R o+rX "$APP_DIR/client/build"
sudo chown -R "$CURRENT_USER":"$CURRENT_USER" "$APP_DIR/client/build"
# Permitir acceso de otros (o+x) en toda la ruta para Nginx
sudo chmod o+x "$USER_HOME"
sudo chmod o+x "$APP_DIR"
sudo chmod o+x "$APP_DIR/client"

# 9. Configurar Nginx
NGINX_CONFIG="/etc/nginx/sites-available/$APP_NAME"
sudo tee "$NGINX_CONFIG" > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    root $APP_DIR/client/build;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:$PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
sudo ln -sf "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$APP_NAME"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 10. Iniciar la aplicación con PM2
cd "$APP_DIR"
pm2 start ecosystem.config.js --env production
pm2 save

# Obtener IP pública de forma universal
PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print $1}')

echo -e "${GREEN}==== Instalación completada ====${NC}"
echo -e "${YELLOW}Accede a la app en: http://$PUBLIC_IP/${NC}"

echo -e "${YELLOW}API health: http://$PUBLIC_IP:$PORT/api/health${NC}"


# Reiniciar PM2 para asegurar que los cambios de entorno y logs se apliquen
pm2 restart gastos-robert-api --update-env

# Motivo por el que el proyecto puede estar en /root:
# Si ejecutas el instalador como root (por ejemplo, usando 'sudo su -' o 'sudo bash ...'), 
# los comandos que crean archivos y carpetas pueden terminar en /root en vez de /home/nina,
# especialmente si $HOME apunta a /root.

# Explicación clara:
# La carpeta del proyecto se instala en /root si ejecutas el instalador como root (por ejemplo, usando 'sudo su -' o 'sudo bash ...').
# En ese caso, la variable $HOME apunta a /root y todos los comandos que usan rutas relativas o $HOME crearán archivos en /root.

# Solución:
# 1. Cambia al usuario nina antes de ejecutar el instalador:
#    su - nina
#    bash instalar-gastos-robert.sh
# 2. Así, $HOME será /home/nina y el proyecto se instalará en /home/nina/gastos-robert.

# Recomendación:
# - Borra cualquier carpeta /root/gastos-robert.
# - Ejecuta el instalador solo como usuario nina, nunca como root.
