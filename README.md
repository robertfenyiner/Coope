# 🏛️ Coopeenortol - Plataforma de Gestión Cooperativa

## 📋 Descripción

Coopeenortol es una plataforma integral de gestión para cooperativas de empleados, diseñada para manejar de manera eficiente la información de más de 500 asociados. Evolucionada desde una aplicación personal de gastos, ahora ofrece funcionalidades robustas para la administración cooperativa.

## ✨ Características Principales

### 👥 Gestión de Asociados
- ✅ Registro completo de información personal y laboral
- ✅ Sistema de numeración automática de asociados
- ✅ Gestión de estados (activo, inactivo, suspendido, retirado)
- ✅ Información de contacto y emergencia
- ✅ Historial laboral detallado

### 📄 Gestión de Documentos
- ✅ Tipos de documentos configurables
- ✅ Carga de documentos con validación
- ✅ Sistema de verificación y aprobación
- ✅ Documentos obligatorios y opcionales
- ✅ Seguimiento del estado de documentación

### 🔒 Seguridad y Autenticación
- ✅ Autenticación JWT
- ✅ Roles de usuario (admin/usuario)
- ✅ Sesiones con Redis
- ✅ Rate limiting
- ✅ Headers de seguridad con Helmet

### 📊 Reportes y Estadísticas
- ✅ Dashboard con métricas en tiempo real
- ✅ Estadísticas de asociados por departamento
- ✅ Reportes de documentación
- ✅ Exportación de datos

### 🛠️ Arquitectura Robusta
- ✅ Base de datos PostgreSQL para escalabilidad
- ✅ Redis para caché y sesiones
- ✅ API REST bien documentada
- ✅ Frontend React con TypeScript
- ✅ Configuración para producción

## 🚀 Tecnologías Utilizadas

### Backend
- **Node.js** 18+ LTS
- **Express.js** - Framework web
- **PostgreSQL** 14+ - Base de datos principal
- **Redis** 6+ - Caché y sesiones
- **JWT** - Autenticación
- **Bcrypt** - Hash de contraseñas
- **Multer** - Carga de archivos
- **Helmet** - Seguridad HTTP

### Frontend
- **React** 18+ con TypeScript
- **Material-UI** - Componentes UI
- **Tailwind CSS** - Estilos
- **React Router** - Navegación
- **Axios** - Cliente HTTP

### DevOps
- **PM2** - Gestión de procesos
- **Nginx** - Proxy reverso
- **Docker** ready - Contenedores
- **Ubuntu Server** 22.04 - Plataforma de deployment

## 📦 Instalación Rápida

### Para Ubuntu Server 22.04 (Recomendado)

```bash
# Descargar script de instalación automatizada
wget https://raw.githubusercontent.com/robertfenyiner/Coope/main/scripts/install-coopeenortol-ubuntu.sh

# Ejecutar instalación
chmod +x install-coopeenortol-ubuntu.sh
bash install-coopeenortol-ubuntu.sh
```

**Ver documentación completa**: [INSTALACION_UBUNTU_22.04.md](INSTALACION_UBUNTU_22.04.md)

## 🛡️ Seguridad

- ✅ Autenticación JWT con tokens seguros
- ✅ Rate limiting para prevenir ataques
- ✅ Headers de seguridad con Helmet.js
- ✅ Hash de contraseñas con bcrypt
- ✅ Validación de datos completa
- ✅ CORS configurado apropiadamente

## 📚 API Endpoints Principales

### Asociados
- `GET /api/asociados` - Listar asociados con filtros
- `POST /api/asociados` - Crear nuevo asociado
- `GET /api/asociados/:id` - Obtener asociado específico
- `PUT /api/asociados/:id` - Actualizar asociado
- `POST /api/asociados/:id/fotografia` - Subir fotografía

### Documentos
- `GET /api/documentos/tipos` - Tipos de documentos
- `POST /api/documentos/subir` - Subir documento
- `PUT /api/documentos/:id/verificar` - Verificar documento
- `GET /api/documentos/asociado/:id` - Documentos de asociado

## 🚀 Deployment

### Comandos PM2
```bash
pm2 start ecosystem.config.js --env production
pm2 status
pm2 logs coopeenortol-server
pm2 restart coopeenortol-server
```

### Scripts de Mantenimiento
```bash
./scripts/backup.sh     # Backup manual
./scripts/update.sh     # Actualizar aplicación
./scripts/monitor.sh    # Estado del sistema
```

## 📈 Roadmap

- **v2.1**: Módulo de ahorros y préstamos básicos
- **v2.2**: Dashboard avanzado y reportes personalizables  
- **v3.0**: Sistema contable completo y app móvil

## 🤝 Soporte

- **Email**: soporte@coopeenortol.com
- **Issues**: [GitHub Issues](https://github.com/robertfenyiner/Coope/issues)
- **Documentación**: Ver archivos de documentación en el repositorio

---

**Coopeenortol v2.0** - Plataforma robusta para cooperativas de empleados

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![PostgreSQL](https://img.shields.io/badge/postgresql-14+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)