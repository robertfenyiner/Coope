-- ======================================
-- ESQUEMA DE BASE DE DATOS COOPEENORTOL
-- Plataforma de Gestión Cooperativa
-- ======================================

-- Extensiones necesarias para UUID y funcionalidades avanzadas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ======================================
-- TABLAS PRINCIPALES DEL SISTEMA
-- ======================================

-- Tabla de usuarios del sistema (administradores, empleados)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    telefono VARCHAR(20),
    es_admin BOOLEAN DEFAULT FALSE,
    es_activo BOOLEAN DEFAULT TRUE,
    ultimo_acceso TIMESTAMP,
    foto_perfil TEXT,
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ======================================
-- MÓDULO DE ASOCIADOS
-- ======================================

-- Tabla principal de asociados de la cooperativa
CREATE TABLE IF NOT EXISTS asociados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_asociado VARCHAR(20) UNIQUE NOT NULL, -- Número único del asociado
    cedula VARCHAR(20) UNIQUE NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    nombre_completo VARCHAR(200) GENERATED ALWAYS AS (nombres || ' ' || apellidos) STORED,
    fecha_nacimiento DATE NOT NULL,
    genero VARCHAR(10) CHECK (genero IN ('masculino', 'femenino', 'otro')),
    estado_civil VARCHAR(20) CHECK (estado_civil IN ('soltero', 'casado', 'union_libre', 'divorciado', 'viudo')),
    
    -- Información de contacto
    telefono_personal VARCHAR(20),
    telefono_trabajo VARCHAR(20),
    email_personal VARCHAR(100),
    email_trabajo VARCHAR(100),
    
    -- Información de ubicación
    direccion_residencia TEXT NOT NULL,
    barrio VARCHAR(100),
    ciudad VARCHAR(100) NOT NULL,
    departamento VARCHAR(100) NOT NULL,
    codigo_postal VARCHAR(10),
    
    -- Información de emergencia
    contacto_emergencia_nombre VARCHAR(200),
    contacto_emergencia_telefono VARCHAR(20),
    contacto_emergencia_parentesco VARCHAR(50),
    
    -- Estado en la cooperativa
    fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
    estado_asociado VARCHAR(20) DEFAULT 'activo' CHECK (estado_asociado IN ('activo', 'inactivo', 'suspendido', 'retirado')),
    fecha_retiro DATE,
    motivo_retiro TEXT,
    
    -- Fotografía y documentos
    fotografia_url TEXT,
    
    -- Campos de auditoría
    creado_por UUID REFERENCES usuarios(id),
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_por UUID REFERENCES usuarios(id),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Información laboral de los asociados
CREATE TABLE IF NOT EXISTS informacion_laboral (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asociado_id UUID NOT NULL REFERENCES asociados(id) ON DELETE CASCADE,
    
    -- Información de la empresa
    empresa VARCHAR(200) NOT NULL,
    nit_empresa VARCHAR(20),
    direccion_empresa TEXT,
    telefono_empresa VARCHAR(20),
    
    -- Información del cargo
    cargo VARCHAR(150) NOT NULL,
    area_departamento VARCHAR(100),
    salario_basico DECIMAL(15,2),
    otros_ingresos DECIMAL(15,2) DEFAULT 0,
    salario_total DECIMAL(15,2) GENERATED ALWAYS AS (salario_basico + COALESCE(otros_ingresos, 0)) STORED,
    
    -- Información del contrato
    tipo_contrato VARCHAR(30) CHECK (tipo_contrato IN ('indefinido', 'fijo', 'obra_labor', 'prestacion_servicios')),
    fecha_inicio_laboral DATE NOT NULL,
    fecha_fin_contrato DATE,
    
    -- Información del jefe inmediato
    jefe_inmediato VARCHAR(200),
    telefono_jefe VARCHAR(20),
    email_jefe VARCHAR(100),
    
    -- Estado
    es_activo BOOLEAN DEFAULT TRUE,
    fecha_retiro_empresa DATE,
    
    -- Auditoría
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Tipos de documentos permitidos
CREATE TABLE IF NOT EXISTS tipos_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    es_obligatorio BOOLEAN DEFAULT FALSE,
    formatos_permitidos TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'jpeg', 'png'],
    tamano_maximo_mb INTEGER DEFAULT 10,
    es_activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Documentos adjuntos de los asociados
CREATE TABLE IF NOT EXISTS documentos_asociados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asociado_id UUID NOT NULL REFERENCES asociados(id) ON DELETE CASCADE,
    tipo_documento_id UUID NOT NULL REFERENCES tipos_documentos(id),
    
    -- Información del archivo
    nombre_original VARCHAR(255) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    tamano_archivo BIGINT NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    
    -- Estado del documento
    estado_verificacion VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado')),
    observaciones_verificacion TEXT,
    verificado_por UUID REFERENCES usuarios(id),
    fecha_verificacion TIMESTAMP,
    
    -- Auditoría
    subido_por UUID REFERENCES usuarios(id),
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ======================================
-- TABLAS HEREDADAS DEL SISTEMA ANTERIOR
-- (Adaptadas para PostgreSQL)
-- ======================================

-- Tabla de categorías (para gastos y movimientos financieros)
CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
    icono VARCHAR(50) DEFAULT 'shopping-cart',
    es_global BOOLEAN DEFAULT FALSE, -- Categorías globales disponibles para todos
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de monedas
CREATE TABLE IF NOT EXISTS monedas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(3) UNIQUE NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    simbolo VARCHAR(5) NOT NULL,
    tasa_cambio DECIMAL(10,6) DEFAULT 1.0,
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de gastos/movimientos financieros
CREATE TABLE IF NOT EXISTS gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    asociado_id UUID REFERENCES asociados(id), -- Vincular gastos a asociados si aplica
    categoria_id UUID NOT NULL REFERENCES categorias(id),
    moneda_id UUID NOT NULL REFERENCES monedas(id),
    
    monto DECIMAL(15,2) NOT NULL,
    monto_cop DECIMAL(15,2),
    tasa_cambio DECIMAL(10,6),
    descripcion TEXT,
    fecha_gasto DATE NOT NULL,
    
    es_recurrente BOOLEAN DEFAULT FALSE,
    frecuencia_recurrencia VARCHAR(20),
    proxima_fecha DATE,
    dias_recordatorio INTEGER DEFAULT 1,
    
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de archivos adjuntos (generalizada)
CREATE TABLE IF NOT EXISTS archivos_adjuntos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    gasto_id UUID REFERENCES gastos(id) ON DELETE CASCADE,
    asociado_id UUID REFERENCES asociados(id) ON DELETE CASCADE,
    
    tipo_archivo VARCHAR(20) NOT NULL CHECK (tipo_archivo IN ('gasto', 'perfil', 'documento_asociado')),
    nombre_original VARCHAR(255) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    tamano_archivo BIGINT NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de plantillas de email
CREATE TABLE IF NOT EXISTS plantillas_email (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_plantilla VARCHAR(50) UNIQUE NOT NULL,
    asunto VARCHAR(255) NOT NULL,
    contenido_html TEXT NOT NULL,
    contenido_texto TEXT NOT NULL,
    variables_disponibles TEXT[], -- Array de variables que acepta la plantilla
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ======================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ======================================

-- Índices para asociados
CREATE INDEX IF NOT EXISTS idx_asociados_cedula ON asociados(cedula);
CREATE INDEX IF NOT EXISTS idx_asociados_numero ON asociados(numero_asociado);
CREATE INDEX IF NOT EXISTS idx_asociados_estado ON asociados(estado_asociado);
CREATE INDEX IF NOT EXISTS idx_asociados_fecha_ingreso ON asociados(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_asociados_nombre_completo ON asociados(nombre_completo);

-- Índices para información laboral
CREATE INDEX IF NOT EXISTS idx_info_laboral_asociado ON informacion_laboral(asociado_id);
CREATE INDEX IF NOT EXISTS idx_info_laboral_empresa ON informacion_laboral(empresa);

-- Índices para documentos
CREATE INDEX IF NOT EXISTS idx_documentos_asociado ON documentos_asociados(asociado_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos_asociados(tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_estado ON documentos_asociados(estado_verificacion);

-- Índices para gastos
CREATE INDEX IF NOT EXISTS idx_gastos_usuario ON gastos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_gastos_asociado ON gastos(asociado_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha_gasto);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria_id);

-- ======================================
-- TRIGGERS PARA AUDITORÍA AUTOMÁTICA
-- ======================================

-- Trigger para actualizar timestamp en asociados
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_asociados_timestamp
    BEFORE UPDATE ON asociados
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER trigger_info_laboral_timestamp
    BEFORE UPDATE ON informacion_laboral
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER trigger_documentos_timestamp
    BEFORE UPDATE ON documentos_asociados
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_timestamp();

-- ======================================
-- FUNCIONES UTILITARIAS
-- ======================================

-- Función para generar número de asociado automático
CREATE OR REPLACE FUNCTION generar_numero_asociado()
RETURNS TEXT AS $$
DECLARE
    nuevo_numero TEXT;
    contador INTEGER;
BEGIN
    -- Obtener el próximo número disponible
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_asociado FROM 5) AS INTEGER)), 0) + 1
    INTO contador
    FROM asociados
    WHERE numero_asociado ~ '^ASC-[0-9]+$';
    
    -- Formatear el número con ceros a la izquierda
    nuevo_numero := 'ASC-' || LPAD(contador::TEXT, 6, '0');
    
    RETURN nuevo_numero;
END;
$$ LANGUAGE plpgsql;

-- ======================================
-- DATOS INICIALES
-- ======================================

-- Insertar tipos de documentos por defecto
INSERT INTO tipos_documentos (codigo, nombre, descripcion, es_obligatorio) VALUES
('cedula_ciudadania', 'Cédula de Ciudadanía', 'Documento de identificación principal', true),
('cedula_extranjeria', 'Cédula de Extranjería', 'Documento de identificación para extranjeros', false),
('pasaporte', 'Pasaporte', 'Documento de identificación internacional', false),
('hoja_vida', 'Hoja de Vida', 'Currículum vitae del asociado', true),
('certificado_laboral', 'Certificado Laboral', 'Certificación laboral vigente', true),
('desprendible_nomina', 'Desprendible de Nómina', 'Comprobante de ingresos', true),
('certificado_ingresos', 'Certificado de Ingresos', 'Certificación de ingresos y retenciones', false),
('referencias_comerciales', 'Referencias Comerciales', 'Referencias comerciales del asociado', false),
('referencias_personales', 'Referencias Personales', 'Referencias personales del asociado', false),
('autorizacion_centrales', 'Autorización Centrales de Riesgo', 'Autorización para consulta en centrales de riesgo', true)
ON CONFLICT (codigo) DO NOTHING;

-- Insertar monedas por defecto
INSERT INTO monedas (codigo, nombre, simbolo) VALUES
('COP', 'Peso Colombiano', '$'),
('USD', 'Dólar Americano', '$'),
('EUR', 'Euro', '€')
ON CONFLICT (codigo) DO NOTHING;

-- Insertar usuario administrador por defecto
INSERT INTO usuarios (username, email, password_hash, nombre_completo, es_admin) VALUES
('admin', 'admin@coopeenortol.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeaHxz4XZA3Vh9K16', 'Administrador del Sistema', true)
ON CONFLICT (username) DO NOTHING;

-- Comentarios de documentación
COMMENT ON TABLE asociados IS 'Tabla principal que almacena información completa de todos los asociados de la cooperativa';
COMMENT ON TABLE informacion_laboral IS 'Información laboral detallada de cada asociado para evaluación crediticia';
COMMENT ON TABLE documentos_asociados IS 'Almacena referencias a todos los documentos digitalizados de los asociados';
COMMENT ON TABLE tipos_documentos IS 'Catálogo de tipos de documentos que pueden subir los asociados';

COMMENT ON COLUMN asociados.numero_asociado IS 'Número único del asociado en formato ASC-000001';
COMMENT ON COLUMN asociados.estado_asociado IS 'Estado actual del asociado en la cooperativa';
COMMENT ON COLUMN documentos_asociados.estado_verificacion IS 'Estado de verificación del documento por parte del personal autorizado';