const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { query, getClient } = require('../database');

// ======================================
// RUTAS PARA GESTIÓN DE ASOCIADOS
// ======================================

/**
 * @route   GET /api/asociados
 * @desc    Obtener lista de asociados con filtros y paginación
 * @access  Privado
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      estado = 'activo',
      departamento = '',
      ordenar = 'nombre_completo',
      direccion = 'ASC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Filtro por estado
    if (estado && estado !== 'todos') {
      whereConditions.push(`a.estado_asociado = $${paramIndex++}`);
      params.push(estado);
    }

    // Filtro por departamento
    if (departamento) {
      whereConditions.push(`a.departamento ILIKE $${paramIndex++}`);
      params.push(`%${departamento}%`);
    }

    // Filtro de búsqueda por nombre, cédula o número de asociado
    if (search) {
      whereConditions.push(`(
        a.nombre_completo ILIKE $${paramIndex} OR 
        a.cedula ILIKE $${paramIndex} OR 
        a.numero_asociado ILIKE $${paramIndex} OR
        a.email_personal ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Consulta principal con información laboral
    const consultaAsociados = `
      SELECT 
        a.id,
        a.numero_asociado,
        a.cedula,
        a.nombres,
        a.apellidos,
        a.nombre_completo,
        a.fecha_nacimiento,
        a.genero,
        a.estado_civil,
        a.telefono_personal,
        a.email_personal,
        a.direccion_residencia,
        a.ciudad,
        a.departamento,
        a.fecha_ingreso,
        a.estado_asociado,
        a.fotografia_url,
        il.empresa,
        il.cargo,
        il.salario_total,
        il.fecha_inicio_laboral,
        a.creado_en
      FROM asociados a
      LEFT JOIN informacion_laboral il ON a.id = il.asociado_id AND il.es_activo = true
      ${whereClause}
      ORDER BY ${ordenar} ${direccion}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(parseInt(limit), offset);

    // Consulta para contar total de registros
    const consultaTotal = `
      SELECT COUNT(*) as total
      FROM asociados a
      ${whereClause}
    `;

    const paramsTotal = params.slice(0, params.length - 2); // Remover limit y offset

    const [resultados, total] = await Promise.all([
      query(consultaAsociados, params),
      query(consultaTotal, paramsTotal)
    ]);

    const asociados = resultados.rows;
    const totalRegistros = parseInt(total.rows[0].total);
    const totalPaginas = Math.ceil(totalRegistros / limit);

    res.json({
      asociados,
      paginacion: {
        paginaActual: parseInt(page),
        totalPaginas,
        totalRegistros,
        registrosPorPagina: parseInt(limit),
        hayAnterior: page > 1,
        haySiguiente: page < totalPaginas
      }
    });

  } catch (err) {
    console.error('Error obteniendo asociados:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/asociados/:id
 * @desc    Obtener información completa de un asociado específico
 * @access  Privado
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Información básica del asociado
    const consultaAsociado = `
      SELECT 
        a.*,
        u_creado.nombre_completo as creado_por_nombre,
        u_actualizado.nombre_completo as actualizado_por_nombre
      FROM asociados a
      LEFT JOIN usuarios u_creado ON a.creado_por = u_creado.id
      LEFT JOIN usuarios u_actualizado ON a.actualizado_por = u_actualizado.id
      WHERE a.id = $1
    `;

    // Información laboral
    const consultaLaboral = `
      SELECT * FROM informacion_laboral 
      WHERE asociado_id = $1 
      ORDER BY fecha_inicio_laboral DESC
    `;

    // Documentos del asociado
    const consultaDocumentos = `
      SELECT 
        da.*,
        td.nombre as tipo_documento_nombre,
        td.descripcion as tipo_documento_descripcion,
        u.nombre_completo as verificado_por_nombre
      FROM documentos_asociados da
      JOIN tipos_documentos td ON da.tipo_documento_id = td.id
      LEFT JOIN usuarios u ON da.verificado_por = u.id
      WHERE da.asociado_id = $1
      ORDER BY da.creado_en DESC
    `;

    const [asociado, laboral, documentos] = await Promise.all([
      query(consultaAsociado, [id]),
      query(consultaLaboral, [id]),
      query(consultaDocumentos, [id])
    ]);

    if (asociado.rows.length === 0) {
      return res.status(404).json({ message: 'Asociado no encontrado' });
    }

    res.json({
      asociado: asociado.rows[0],
      informacionLaboral: laboral.rows,
      documentos: documentos.rows
    });

  } catch (err) {
    console.error('Error obteniendo asociado:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   POST /api/asociados
 * @desc    Crear nuevo asociado
 * @access  Privado
 */
router.post('/', auth, async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const {
      cedula,
      nombres,
      apellidos,
      fecha_nacimiento,
      genero,
      estado_civil,
      telefono_personal,
      telefono_trabajo,
      email_personal,
      email_trabajo,
      direccion_residencia,
      barrio,
      ciudad,
      departamento,
      codigo_postal,
      contacto_emergencia_nombre,
      contacto_emergencia_telefono,
      contacto_emergencia_parentesco,
      fecha_ingreso,
      // Información laboral
      empresa,
      nit_empresa,
      direccion_empresa,
      telefono_empresa,
      cargo,
      area_departamento,
      salario_basico,
      otros_ingresos,
      tipo_contrato,
      fecha_inicio_laboral,
      fecha_fin_contrato,
      jefe_inmediato,
      telefono_jefe,
      email_jefe
    } = req.body;

    // Validaciones básicas
    if (!cedula || !nombres || !apellidos || !fecha_nacimiento || !ciudad || !departamento || !direccion_residencia) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Faltan campos obligatorios',
        campos: ['cedula', 'nombres', 'apellidos', 'fecha_nacimiento', 'ciudad', 'departamento', 'direccion_residencia']
      });
    }

    // Verificar que la cédula no esté registrada
    const cedulaExistente = await client.query(
      'SELECT id FROM asociados WHERE cedula = $1',
      [cedula]
    );

    if (cedulaExistente.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Ya existe un asociado con esta cédula' });
    }

    // Generar número de asociado
    const numeroAsociado = await client.query('SELECT generar_numero_asociado() as numero');

    // Insertar asociado
    const insertarAsociado = `
      INSERT INTO asociados (
        numero_asociado, cedula, nombres, apellidos, fecha_nacimiento, genero, estado_civil,
        telefono_personal, telefono_trabajo, email_personal, email_trabajo,
        direccion_residencia, barrio, ciudad, departamento, codigo_postal,
        contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_parentesco,
        fecha_ingreso, creado_por
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21
      ) RETURNING *
    `;

    const resultadoAsociado = await client.query(insertarAsociado, [
      numeroAsociado.rows[0].numero,
      cedula, nombres, apellidos, fecha_nacimiento, genero, estado_civil,
      telefono_personal, telefono_trabajo, email_personal, email_trabajo,
      direccion_residencia, barrio, ciudad, departamento, codigo_postal,
      contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_parentesco,
      fecha_ingreso || new Date(), req.user.id
    ]);

    const asociadoCreado = resultadoAsociado.rows[0];

    // Insertar información laboral si se proporciona
    if (empresa && cargo && fecha_inicio_laboral) {
      const insertarLaboral = `
        INSERT INTO informacion_laboral (
          asociado_id, empresa, nit_empresa, direccion_empresa, telefono_empresa,
          cargo, area_departamento, salario_basico, otros_ingresos, tipo_contrato,
          fecha_inicio_laboral, fecha_fin_contrato, jefe_inmediato, telefono_jefe, email_jefe
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `;

      await client.query(insertarLaboral, [
        asociadoCreado.id, empresa, nit_empresa, direccion_empresa, telefono_empresa,
        cargo, area_departamento, salario_basico, otros_ingresos || 0, tipo_contrato,
        fecha_inicio_laboral, fecha_fin_contrato, jefe_inmediato, telefono_jefe, email_jefe
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Asociado creado exitosamente',
      asociado: asociadoCreado
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando asociado:', err);
    
    if (err.constraint === 'asociados_cedula_key') {
      return res.status(400).json({ message: 'Ya existe un asociado con esta cédula' });
    }
    
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * @route   PUT /api/asociados/:id
 * @desc    Actualizar información de un asociado
 * @access  Privado
 */
router.put('/:id', auth, async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const datosActualizacion = req.body;

    // Verificar que el asociado existe
    const asociadoExistente = await client.query('SELECT id FROM asociados WHERE id = $1', [id]);
    
    if (asociadoExistente.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Asociado no encontrado' });
    }

    // Construir consulta de actualización dinámicamente
    const camposActualizacion = [];
    const valores = [];
    let indiceParametro = 1;

    const camposPermitidos = [
      'nombres', 'apellidos', 'fecha_nacimiento', 'genero', 'estado_civil',
      'telefono_personal', 'telefono_trabajo', 'email_personal', 'email_trabajo',
      'direccion_residencia', 'barrio', 'ciudad', 'departamento', 'codigo_postal',
      'contacto_emergencia_nombre', 'contacto_emergencia_telefono', 'contacto_emergencia_parentesco',
      'estado_asociado', 'fecha_retiro', 'motivo_retiro'
    ];

    for (const campo of camposPermitidos) {
      if (datosActualizacion.hasOwnProperty(campo)) {
        camposActualizacion.push(`${campo} = $${indiceParametro++}`);
        valores.push(datosActualizacion[campo]);
      }
    }

    if (camposActualizacion.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
    }

    // Agregar campos de auditoría
    camposActualizacion.push(`actualizado_por = $${indiceParametro++}`);
    camposActualizacion.push(`actualizado_en = NOW()`);
    valores.push(req.user.id);

    // Agregar ID para WHERE
    valores.push(id);

    const consultaActualizacion = `
      UPDATE asociados 
      SET ${camposActualizacion.join(', ')}
      WHERE id = $${indiceParametro}
      RETURNING *
    `;

    const resultado = await client.query(consultaActualizacion, valores);

    await client.query('COMMIT');

    res.json({
      message: 'Asociado actualizado exitosamente',
      asociado: resultado.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error actualizando asociado:', err);
    
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * @route   POST /api/asociados/:id/fotografia
 * @desc    Subir fotografía del asociado
 * @access  Privado
 */
router.post('/:id/fotografia', auth, upload.single('fotografia'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó archivo de fotografía' });
    }

    // Verificar que el asociado existe
    const asociado = await query('SELECT id FROM asociados WHERE id = $1', [id]);
    
    if (asociado.rows.length === 0) {
      return res.status(404).json({ message: 'Asociado no encontrado' });
    }

    // Actualizar URL de fotografía
    const fotografiaUrl = `/uploads/${req.file.filename}`;
    
    await query(
      'UPDATE asociados SET fotografia_url = $1, actualizado_por = $2, actualizado_en = NOW() WHERE id = $3',
      [fotografiaUrl, req.user.id, id]
    );

    res.json({
      message: 'Fotografía subida exitosamente',
      fotografiaUrl
    });

  } catch (err) {
    console.error('Error subiendo fotografía:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * @route   GET /api/asociados/estadisticas/resumen
 * @desc    Obtener estadísticas generales de asociados
 * @access  Privado
 */
router.get('/estadisticas/resumen', auth, async (req, res) => {
  try {
    const estadisticas = await Promise.all([
      // Total de asociados por estado
      query(`
        SELECT estado_asociado, COUNT(*) as cantidad
        FROM asociados
        GROUP BY estado_asociado
      `),
      
      // Asociados por departamento
      query(`
        SELECT departamento, COUNT(*) as cantidad
        FROM asociados
        WHERE estado_asociado = 'activo'
        GROUP BY departamento
        ORDER BY cantidad DESC
        LIMIT 10
      `),
      
      // Nuevos asociados por mes (últimos 12 meses)
      query(`
        SELECT 
          TO_CHAR(fecha_ingreso, 'YYYY-MM') as mes,
          COUNT(*) as cantidad
        FROM asociados
        WHERE fecha_ingreso >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(fecha_ingreso, 'YYYY-MM')
        ORDER BY mes DESC
      `),
      
      // Distribución por género
      query(`
        SELECT genero, COUNT(*) as cantidad
        FROM asociados
        WHERE estado_asociado = 'activo'
        GROUP BY genero
      `)
    ]);

    res.json({
      estadoPorEstado: estadisticas[0].rows,
      asociadosPorDepartamento: estadisticas[1].rows,
      nuevosAsociadosPorMes: estadisticas[2].rows,
      distribucionPorGenero: estadisticas[3].rows
    });

  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;