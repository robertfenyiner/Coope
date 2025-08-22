# 🔧 Configuración de Nginx para Coopeenortol

## 📋 Instalación en Ubuntu Server

### 1. Instalar Nginx

```bash
sudo apt update
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 2. Configurar Coopeenortol

```bash
# Copiar configuración
sudo cp nginx/coopeenortol.conf /etc/nginx/sites-available/coopeenortol

# Crear enlace simbólico
sudo ln -sf /etc/nginx/sites-available/coopeenortol /etc/nginx/sites-enabled/

# Remover configuración por defecto
sudo rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl reload nginx
```

### 3. Verificar Estado

```bash
sudo systemctl status nginx
sudo nginx -t
curl -I http://localhost
```

## 🔧 Configuración Local (Desarrollo)

### Para Windows con Nginx local:

1. Descargar Nginx para Windows desde http://nginx.org/en/download.html
2. Extraer en `C:\nginx`
3. Copiar `nginx/coopeenortol-dev.conf` a `C:\nginx\conf\`
4. Modificar `C:\nginx\conf\nginx.conf`:

```nginx
http {
    include       mime.types;
    default_type  application/octet-stream;
    
    # Incluir configuración de Coopeenortol
    include       coopeenortol-dev.conf;
}
```

5. Iniciar Nginx:
```cmd
cd C:\nginx
nginx.exe
```

### Para macOS con Homebrew:

```bash
# Instalar Nginx
brew install nginx

# Copiar configuración
cp nginx/coopeenortol-dev.conf /usr/local/etc/nginx/servers/

# Iniciar Nginx
brew services start nginx
```

## 🌐 Configuración de Producción

### Configurar SSL con Let's Encrypt (Certbot)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado SSL
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Verificar renovación automática
sudo certbot renew --dry-run
```

### Configuración adicional de seguridad

```bash
# Configurar DH parameters para mayor seguridad
sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048

# Agregar al final de /etc/nginx/nginx.conf dentro del bloque http
echo "ssl_dhparam /etc/nginx/dhparam.pem;" | sudo tee -a /etc/nginx/nginx.conf
```

## 📊 Logs y Monitoreo

### Ubicación de logs:
- **Access log**: `/var/log/nginx/coopeenortol_access.log`
- **Error log**: `/var/log/nginx/coopeenortol_error.log`

### Comandos útiles:

```bash
# Ver logs en tiempo real
sudo tail -f /var/log/nginx/coopeenortol_access.log
sudo tail -f /var/log/nginx/coopeenortol_error.log

# Verificar configuración
sudo nginx -t

# Recargar configuración sin downtime
sudo nginx -s reload

# Ver estado del servicio
sudo systemctl status nginx

# Verificar puertos en uso
sudo netstat -tlnp | grep nginx
```

## 🔍 Solución de Problemas

### Error: "502 Bad Gateway"
- Verificar que el backend (Node.js) esté ejecutándose en puerto 5000
- Comprobar: `curl http://localhost:5000/api/health`
- Revisar logs: `sudo tail -f /var/log/nginx/coopeenortol_error.log`

### Error: "413 Request Entity Too Large"
- Aumentar `client_max_body_size` en la configuración
- Por defecto está configurado en 20M

### Error: "404 Not Found" para rutas de React
- Verificar que `try_files $uri $uri/ /index.html;` esté configurado
- Verificar que el build del frontend exista en `/opt/coopeenortol/client/build`

### Verificar que el frontend esté construido:
```bash
ls -la /opt/coopeenortol/client/build/
```

## 🚀 Configuración de Rendimiento

### Para sitios con mucho tráfico, agregar a `/etc/nginx/nginx.conf`:

```nginx
http {
    # Compresión
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml;
    
    # Limites de conexión
    keepalive_timeout 65;
    keepalive_requests 100;
    
    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 20m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;
    output_buffers 1 32k;
    postpone_output 1460;
}
```

## 📱 Configuración para Aplicaciones Móviles

Si planeas desarrollar una app móvil, agregar estas configuraciones:

```nginx
# Permitir CORS para desarrollo móvil
location /api/ {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type';
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' 0;
        return 204;
    }
    
    # Resto de configuración del proxy...
}
```

---

**¡Importante!** 🔐 

- Siempre hacer backup de configuraciones antes de cambios importantes
- Probar configuraciones con `nginx -t` antes de aplicarlas
- En producción, configurar HTTPS obligatoriamente
- Revisar logs regularmente para detectar problemas