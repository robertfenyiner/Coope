const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { expenseUpload } = require('../middleware/upload');
const { query, getClient } = require('../database');
const path = require('path');
const fs = require('fs');

// ======================================
// RUTAS PARA GESTIÓN DE DOCUMENTOS
// ======================================

/**
 * @route   GET /api/documentos/tipos
 * @desc    Obtener tipos de documentos disponibles
 * @access  Privado
 */
router.get('/tipos', auth, async (req, res) => {
  try {
    const tipos = await query(`
      SELECT id, codigo, nombre, descripcion, es_obligatorio, 
             formatos_permitidos, tamano_maximo_mb, es_activo
      FROM tipos_documentos
      WHERE es_activo = true
      ORDER BY es_obligatorio DESC, nombre ASC
    `);

    res.json(tipos.rows);
  } catch (err) {
    console.error('Error obteniendo tipos de documentos:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   POST /api/documentos/tipos
 * @desc    Crear nuevo tipo de documento (solo admin)
 * @access  Privado - Admin
 */
router.post('/tipos', auth, async (req, res) => {
  try {
    if (!req.user.es_admin) {
      return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }

    const {
      codigo,
      nombre,
      descripcion,
      es_obligatorio = false,
      formatos_permitidos = ['pdf', 'jpg', 'jpeg', 'png'],
      tamano_maximo_mb = 10
    } = req.body;

    if (!codigo || !nombre) {
      return res.status(400).json({ 
        message: 'Faltan campos obligatorios',
        campos: ['codigo', 'nombre']
      });
    }

    const resultado = await query(`
      INSERT INTO tipos_documentos (codigo, nombre, descripcion, es_obligatorio, formatos_permitidos, tamano_maximo_mb)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [codigo, nombre, descripcion, es_obligatorio, formatos_permitidos, tamano_maximo_mb]);

    res.status(201).json({
      message: 'Tipo de documento creado exitosamente',
      tipoDocumento: resultado.rows[0]
    });

  } catch (err) {
    console.error('Error creando tipo de documento:', err);
    
    if (err.constraint === 'tipos_documentos_codigo_key') {
      return res.status(400).json({ message: 'Ya existe un tipo de documento con este código' });
    }
    
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/documentos/asociado/:asociadoId
 * @desc    Obtener documentos de un asociado específico
 * @access  Privado
 */
router.get('/asociado/:asociadoId', auth, async (req, res) => {
  try {
    const { asociadoId } = req.params;

    const documentos = await query(`
      SELECT 
        da.*,
        td.codigo as tipo_codigo,
        td.nombre as tipo_nombre,
        td.descripcion as tipo_descripcion,
        td.es_obligatorio,
        u.nombre_completo as verificado_por_nombre
      FROM documentos_asociados da
      JOIN tipos_documentos td ON da.tipo_documento_id = td.id
      LEFT JOIN usuarios u ON da.verificado_por = u.id
      WHERE da.asociado_id = $1
      ORDER BY da.creado_en DESC
    `, [asociadoId]);

    // También obtener tipos de documentos obligatorios faltantes
    const tiposFaltantes = await query(`
      SELECT td.*
      FROM tipos_documentos td
      WHERE td.es_obligatorio = true
        AND td.es_activo = true
        AND td.id NOT IN (
          SELECT DISTINCT da.tipo_documento_id
          FROM documentos_asociados da
          WHERE da.asociado_id = $1
            AND da.estado_verificacion != 'rechazado'
        )
    `, [asociadoId]);

    res.json({
      documentos: documentos.rows,
      documentosFaltantes: tiposFaltantes.rows
    });

  } catch (err) {
    console.error('Error obteniendo documentos del asociado:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   POST /api/documentos/subir
 * @desc    Subir documento de asociado
 * @access  Privado
 */
router.post('/subir', auth, expenseUpload.single('documento'), async (req, res) => {
  try {
    const { asociado_id, tipo_documento_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó archivo' });
    }

    if (!asociado_id || !tipo_documento_id) {
      return res.status(400).json({ 
        message: 'Faltan campos obligatorios',
        campos: ['asociado_id', 'tipo_documento_id']
      });
    }

    // Verificar que el asociado existe
    const asociado = await query('SELECT id FROM asociados WHERE id = $1', [asociado_id]);
    if (asociado.rows.length === 0) {
      return res.status(404).json({ message: 'Asociado no encontrado' });
    }

    // Verificar que el tipo de documento existe
    const tipoDocumento = await query(
      'SELECT * FROM tipos_documentos WHERE id = $1 AND es_activo = true',
      [tipo_documento_id]
    );
    if (tipoDocumento.rows.length === 0) {
      return res.status(404).json({ message: 'Tipo de documento no encontrado' });
    }

    const tipo = tipoDocumento.rows[0];

    // Validar formato de archivo
    const extension = path.extname(req.file.originalname).slice(1).toLowerCase();
    if (!tipo.formatos_permitidos.includes(extension)) {
      return res.status(400).json({ 
        message: `Formato de archivo no permitido. Formatos válidos: ${tipo.formatos_permitidos.join(', ')}`
      });
    }

    // Validar tamaño de archivo
    const tamanoMB = req.file.size / (1024 * 1024);
    if (tamanoMB > tipo.tamano_maximo_mb) {
      return res.status(400).json({ 
        message: `Archivo demasiado grande. Tamaño máximo: ${tipo.tamano_maximo_mb}MB`
      });
    }

    // Insertar registro del documento
    const resultado = await query(`
      INSERT INTO documentos_asociados (
        asociado_id, tipo_documento_id, nombre_original, nombre_archivo,
        ruta_archivo, tamano_archivo, tipo_mime, subido_por
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      asociado_id,
      tipo_documento_id,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      req.user.id
    ]);

    res.status(201).json({
      message: 'Documento subido exitosamente',
      documento: resultado.rows[0]
    });

  } catch (err) {
    console.error('Error subiendo documento:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   PUT /api/documentos/:id/verificar
 * @desc    Verificar o rechazar un documento
 * @access  Privado - Admin o usuario con permisos
 */
router.put('/:id/verificar', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_verificacion, observaciones_verificacion } = req.body;

    if (!['verificado', 'rechazado'].includes(estado_verificacion)) {
      return res.status(400).json({ 
        message: 'Estado de verificación inválido. Debe ser "verificado" o "rechazado"'
      });
    }

    // Verificar que el documento existe
    const documento = await query('SELECT * FROM documentos_asociados WHERE id = $1', [id]);
    if (documento.rows.length === 0) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const resultado = await query(`
      UPDATE documentos_asociados 
      SET estado_verificacion = $1, 
          observaciones_verificacion = $2,
          verificado_por = $3,
          fecha_verificacion = NOW(),
          actualizado_en = NOW()
      WHERE id = $4
      RETURNING *
    `, [estado_verificacion, observaciones_verificacion, req.user.id, id]);

    res.json({
      message: `Documento ${estado_verificacion} exitosamente`,
      documento: resultado.rows[0]
    });

  } catch (err) {
    console.error('Error verificando documento:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/documentos/:id/descargar
 * @desc    Descargar archivo de documento
 * @access  Privado
 */
router.get('/:id/descargar', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const documento = await query(`
      SELECT da.*, a.nombre_completo, td.nombre as tipo_nombre
      FROM documentos_asociados da
      JOIN asociados a ON da.asociado_id = a.id
      JOIN tipos_documentos td ON da.tipo_documento_id = td.id
      WHERE da.id = $1
    `, [id]);

    if (documento.rows.length === 0) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const doc = documento.rows[0];
    const rutaArchivo = doc.ruta_archivo;

    // Verificar que el archivo existe
    if (!fs.existsSync(rutaArchivo)) {
      return res.status(404).json({ message: 'Archivo no encontrado en el servidor' });
    }

    // Configurar headers para descarga
    const extension = path.extname(doc.nombre_original);
    const nombreDescarga = `${doc.nombre_completo}-${doc.tipo_nombre}${extension}`.replace(/[^a-zA-Z0-9.-]/g, '_');

    res.setHeader('Content-Disposition', `attachment; filename="${nombreDescarga}"`);
    res.setHeader('Content-Type', doc.tipo_mime);

    // Enviar archivo
    const stream = fs.createReadStream(rutaArchivo);
    stream.pipe(res);

  } catch (err) {
    console.error('Error descargando documento:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/documentos/:id
 * @desc    Eliminar documento
 * @access  Privado - Admin o usuario que subió el documento
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const documento = await query('SELECT * FROM documentos_asociados WHERE id = $1', [id]);
    
    if (documento.rows.length === 0) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const doc = documento.rows[0];

    // Verificar permisos: admin o quien subió el documento
    if (!req.user.es_admin && doc.subido_por !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permisos para eliminar este documento' });
    }

    // Eliminar archivo físico
    if (fs.existsSync(doc.ruta_archivo)) {
      try {
        fs.unlinkSync(doc.ruta_archivo);
      } catch (err) {
        console.error('Error eliminando archivo físico:', err);
      }
    }

    // Eliminar registro de base de datos
    await query('DELETE FROM documentos_asociados WHERE id = $1', [id]);

    res.json({ message: 'Documento eliminado exitosamente' });

  } catch (err) {
    console.error('Error eliminando documento:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/documentos/pendientes
 * @desc    Obtener documentos pendientes de verificación
 * @access  Privado - Admin
 */
router.get('/pendientes', auth, async (req, res) => {
  try {
    if (!req.user.es_admin) {
      return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const documentos = await query(`
      SELECT 
        da.*,
        a.numero_asociado,
        a.nombre_completo as asociado_nombre,
        td.nombre as tipo_documento_nombre,
        u.nombre_completo as subido_por_nombre
      FROM documentos_asociados da
      JOIN asociados a ON da.asociado_id = a.id
      JOIN tipos_documentos td ON da.tipo_documento_id = td.id
      JOIN usuarios u ON da.subido_por = u.id
      WHERE da.estado_verificacion = 'pendiente'
      ORDER BY da.creado_en ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await query(`
      SELECT COUNT(*) as total
      FROM documentos_asociados da
      WHERE da.estado_verificacion = 'pendiente'
    `);

    const totalRegistros = parseInt(total.rows[0].total);
    const totalPaginas = Math.ceil(totalRegistros / limit);

    res.json({
      documentos: documentos.rows,
      paginacion: {
        paginaActual: parseInt(page),
        totalPaginas,
        totalRegistros,
        registrosPorPagina: parseInt(limit)
      }
    });

  } catch (err) {
    console.error('Error obteniendo documentos pendientes:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/documentos/estadisticas
 * @desc    Obtener estadísticas de documentos
 * @access  Privado - Admin
 */
router.get('/estadisticas', auth, async (req, res) => {
  try {
    if (!req.user.es_admin) {
      return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }

    const estadisticas = await Promise.all([
      // Documentos por estado de verificación
      query(`
        SELECT estado_verificacion, COUNT(*) as cantidad
        FROM documentos_asociados
        GROUP BY estado_verificacion
      `),
      
      // Documentos por tipo
      query(`
        SELECT td.nombre, COUNT(da.id) as cantidad
        FROM tipos_documentos td
        LEFT JOIN documentos_asociados da ON td.id = da.tipo_documento_id
        WHERE td.es_activo = true
        GROUP BY td.id, td.nombre
        ORDER BY cantidad DESC
      `),
      
      // Documentos subidos por mes (últimos 6 meses)
      query(`
        SELECT 
          TO_CHAR(creado_en, 'YYYY-MM') as mes,
          COUNT(*) as cantidad
        FROM documentos_asociados
        WHERE creado_en >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(creado_en, 'YYYY-MM')
        ORDER BY mes DESC
      `),
      
      // Asociados con documentación completa vs incompleta
      query(`
        SELECT 
          CASE 
            WHEN faltantes.cantidad_faltante = 0 THEN 'completa'
            ELSE 'incompleta'
          END as estado_documentacion,
          COUNT(*) as cantidad
        FROM (
          SELECT 
            a.id,
            COALESCE(obligatorios.total, 0) - COALESCE(presentados.cantidad, 0) as cantidad_faltante
          FROM asociados a
          LEFT JOIN (
            SELECT COUNT(*) as total
            FROM tipos_documentos
            WHERE es_obligatorio = true AND es_activo = true
          ) obligatorios ON true
          LEFT JOIN (
            SELECT 
              da.asociado_id,
              COUNT(DISTINCT da.tipo_documento_id) as cantidad
            FROM documentos_asociados da
            JOIN tipos_documentos td ON da.tipo_documento_id = td.id
            WHERE td.es_obligatorio = true 
              AND da.estado_verificacion != 'rechazado'
            GROUP BY da.asociado_id
          ) presentados ON a.id = presentados.asociado_id
          WHERE a.estado_asociado = 'activo'
        ) faltantes
        GROUP BY 
          CASE 
            WHEN faltantes.cantidad_faltante = 0 THEN 'completa'
            ELSE 'incompleta'
          END
      `)
    ]);

    res.json({
      documentosPorEstado: estadisticas[0].rows,
      documentosPorTipo: estadisticas[1].rows,
      documentosSubidosPorMes: estadisticas[2].rows,
      estadoDocumentacion: estadisticas[3].rows
    });

  } catch (err) {
    console.error('Error obteniendo estadísticas de documentos:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;