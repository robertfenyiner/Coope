#!/bin/bash
# Script de actualización para gastos-robert
# Uso: ./scripts/actualizar-gastos-robert.sh [rama|tag]
set -e

APP_NAME="gastos-robert"
APP_DIR="/home/nina/gastos-robert"
BRANCH=${1:-main}
MAINTENANCE_FILE="$APP_DIR/maintenance.html"
BACKUP_DIR="$APP_DIR/backups/$(date +%Y%m%d%H%M%S)"

if [ "$EUID" -eq 0 ]; then
  echo "Este script no debe ejecutarse como root" >&2
  exit 1
fi

cd "$APP_DIR"

trap 'rm -f "$MAINTENANCE_FILE"' EXIT

echo "Entrando en modo mantenimiento..."
cat > "$MAINTENANCE_FILE" <<'HTML'
<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Mantenimiento</title></head><body><h1>Aplicación en mantenimiento</h1></body></html>
HTML
pm2 stop ${APP_NAME}-api || true

echo "Resguardando base de datos y configuración..."
mkdir -p "$BACKUP_DIR"
[ -f server/gastos_robert.db ] && cp server/gastos_robert.db "$BACKUP_DIR/"
[ -f server/.env ] && cp server/.env "$BACKUP_DIR/"

echo "Actualizando código fuente..."
git fetch --all
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "Instalando dependencias..."
cd server
npm install --production
cd ../client
npm install --production
npm run build
cd ..

echo "Reiniciando servicio..."
pm2 restart ${APP_NAME}-api

echo "Saliendo de modo mantenimiento..."
rm -f "$MAINTENANCE_FILE"

echo "Actualización completada."
