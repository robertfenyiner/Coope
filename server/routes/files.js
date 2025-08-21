const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const { expenseUpload, profileUpload, uploadsDir } = require('../middleware/upload');

const router = express.Router();

// Admin middleware
const adminMiddleware = (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

// Upload expense attachments
router.post('/expense/:expenseId', authMiddleware, expenseUpload.array('attachments', 5), async (req, res) => {
  try {
    const expenseId = parseInt(req.params.expenseId);
    const userId = req.user.id;

    // Verify expense belongs to user or user is admin
    const expense = await new Promise((resolve, reject) => {
      db.get('SELECT user_id FROM expenses WHERE id = ?', [expenseId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!expense) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    if (expense.user_id !== userId && !req.user.is_admin) {
      return res.status(403).json({ message: 'No tienes permisos para agregar archivos a este gasto' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No se enviaron archivos' });
    }

    const uploadedFiles = [];

    // Save file information to database
    for (const file of req.files) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO file_attachments 
           (user_id, expense_id, file_type, original_name, file_name, file_path, file_size, mime_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            expenseId,
            'expense',
            file.originalname,
            file.filename,
            file.path,
            file.size,
            file.mimetype
          ],
          function(err) {
            if (err) reject(err);
            else {
              uploadedFiles.push({
                id: this.lastID,
                originalName: file.originalname,
                fileName: file.filename,
                size: file.size,
                mimeType: file.mimetype,
                downloadUrl: `/files/download/${this.lastID}`
              });
              resolve();
            }
          }
        );
      });
    }

    res.json({
      message: `${uploadedFiles.length} archivo(s) subido(s) exitosamente`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('Error uploading expense attachments:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          if (fsSync.existsSync(file.path)) {
            await fs.unlink(file.path);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
    }

    res.status(500).json({
      message: 'Error al subir los archivos',
      error: error.message
    });
  }
});

// Test endpoint without auth for debugging
router.post('/test-profile', profileUpload.single('profilePicture'), async (req, res) => {
  try {
    console.log(`[TEST_UPLOAD] Archivo recibido sin autenticación`);
    
    if (!req.file) {
      console.log(`[TEST_UPLOAD] Error: No se recibió archivo`);
      return res.status(400).json({ message: 'No se envió archivo' });
    }
    
    console.log(`[TEST_UPLOAD] Archivo guardado:`, {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path
    });
    
    res.json({
      message: 'Archivo subido exitosamente (modo prueba)',
      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        size: req.file.size,
        path: req.file.path
      }
    });
    
  } catch (error) {
    console.error('[TEST_UPLOAD] Error:', error);
    res.status(500).json({
      message: 'Error en la prueba de subida',
      error: error.message
    });
  }
});

// Upload profile picture
router.post('/profile', authMiddleware, profileUpload.single('profilePicture'), async (req, res) => {
  console.log(`[PROFILE_UPLOAD] Inicio de procesamiento de subida`);
  try {
    const userId = req.user.id;
    console.log(`[PROFILE_UPLOAD] Usuario ${userId} subiendo foto de perfil`);

    if (!req.file) {
      console.log(`[PROFILE_UPLOAD] Error: No se recibió archivo`);
      return res.status(400).json({ message: 'No se envió archivo' });
    }
    
    console.log(`[PROFILE_UPLOAD] Archivo recibido:`, {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path
    });

    // Delete old profile picture if exists
    const oldPicture = await new Promise((resolve, reject) => {
      db.get('SELECT profile_picture FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row?.profile_picture);
      });
    });

    if (oldPicture) {
      // Delete old file and database record
      try {
        const oldFileRecord = await new Promise((resolve, reject) => {
          db.get('SELECT file_path FROM file_attachments WHERE file_name = ? AND file_type = "profile"', [oldPicture], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (oldFileRecord && fsSync.existsSync(oldFileRecord.file_path)) {
          await fs.unlink(oldFileRecord.file_path);
        }

        // Delete database record
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM file_attachments WHERE file_name = ? AND file_type = "profile"', [oldPicture], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (cleanupError) {
        console.error('Error cleaning up old profile picture:', cleanupError);
      }
    }

    // Save new file information to database
    const fileId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO file_attachments 
         (user_id, file_type, original_name, file_name, file_path, file_size, mime_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          'profile',
          req.file.originalname,
          req.file.filename,
          req.file.path,
          req.file.size,
          req.file.mimetype
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Update user's profile picture reference
    console.log(`[PROFILE_UPLOAD] Actualizando base de datos: usuario ${userId}, filename: ${req.file.filename}`);
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET profile_picture = ? WHERE id = ?', [req.file.filename, userId], function(err) {
        if (err) {
          console.log(`[PROFILE_UPLOAD] Error actualizando base de datos:`, err);
          reject(err);
        } else {
          console.log(`[PROFILE_UPLOAD] Base de datos actualizada. Filas afectadas: ${this.changes}`);
          resolve();
        }
      });
    });

    const response = {
      message: 'Foto de perfil actualizada exitosamente',
      profilePicture: {
        id: fileId,
        fileName: req.file.filename,
        downloadUrl: `/files/profile/${req.file.filename}`
      }
    };
    
    console.log(`[PROFILE_UPLOAD] Enviando respuesta:`, response);
    res.json(response);

  } catch (error) {
    console.error('Error uploading profile picture:', error);
    
    // Clean up uploaded file on error
    if (req.file && fsSync.existsSync(req.file.path)) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    res.status(500).json({
      message: 'Error al subir la foto de perfil',
      error: error.message
    });
  }
});

// Download profile picture by filename (public endpoint - profile pictures are not sensitive)
router.get('/profile/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`[PROFILE_GET] Solicitando foto de perfil: ${filename}`);

    // Verificar que el archivo existe en la base de datos (sin verificación de usuario)
    const fileExists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM file_attachments WHERE file_name = ? AND file_type = "profile"', 
        [filename], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!fileExists) {
      console.log(`[PROFILE_GET] Archivo no encontrado en BD: ${filename}`);
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }

    // Get file information from database
    const fileRecord = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM file_attachments WHERE file_name = ? AND file_type = "profile"',
        [filename],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!fileRecord) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }

    // Check if file exists
    if (!fsSync.existsSync(fileRecord.file_path)) {
      return res.status(404).json({ message: 'Archivo físico no encontrado' });
    }

    // Set appropriate headers for image with CORS
    res.setHeader('Content-Type', fileRecord.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.setHeader('Content-Length', fileRecord.file_size);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for profile pictures
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    console.log(`[PROFILE_GET] Sirviendo archivo: ${fileRecord.file_path}`);

    // Stream file
    const fileStream = fsSync.createReadStream(fileRecord.file_path);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming profile picture:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error al cargar la imagen' });
      }
    });

  } catch (error) {
    console.error('Error serving profile picture:', error);
    res.status(500).json({
      message: 'Error al cargar la imagen',
      error: error.message
    });
  }
});

// Download file
router.get('/download/:fileId', authMiddleware, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    const userId = req.user.id;

    // Get file information
    const fileRecord = await new Promise((resolve, reject) => {
      db.get(
        `SELECT fa.*, e.user_id as expense_user_id 
         FROM file_attachments fa 
         LEFT JOIN expenses e ON fa.expense_id = e.id 
         WHERE fa.id = ?`,
        [fileId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!fileRecord) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }

    // Check permissions
    const canAccess = 
      fileRecord.user_id === userId || // Owner
      (fileRecord.expense_user_id && fileRecord.expense_user_id === userId) || // Expense owner
      req.user.is_admin; // Admin

    if (!canAccess) {
      return res.status(403).json({ message: 'No tienes permisos para acceder a este archivo' });
    }

    // Check if file exists
    if (!fsSync.existsSync(fileRecord.file_path)) {
      return res.status(404).json({ message: 'Archivo físico no encontrado' });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', fileRecord.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_name}"`);
    res.setHeader('Content-Length', fileRecord.file_size);

    // Stream file
    const fileStream = fsSync.createReadStream(fileRecord.file_path);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error al descargar el archivo' });
      }
    });

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      message: 'Error al descargar el archivo',
      error: error.message
    });
  }
});

// Get files for an expense
router.get('/expense/:expenseId', authMiddleware, async (req, res) => {
  try {
    const expenseId = parseInt(req.params.expenseId);
    const userId = req.user.id;

    // Verify expense belongs to user or user is admin
    const expense = await new Promise((resolve, reject) => {
      db.get('SELECT user_id FROM expenses WHERE id = ?', [expenseId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!expense) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    if (expense.user_id !== userId && !req.user.is_admin) {
      return res.status(403).json({ message: 'No tienes permisos para ver los archivos de este gasto' });
    }

    // Get files
    const files = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, original_name, file_name, file_size, mime_type, created_at 
         FROM file_attachments 
         WHERE expense_id = ? AND file_type = 'expense' 
         ORDER BY created_at DESC`,
        [expenseId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const filesWithUrls = files.map(file => ({
      id: file.id,
      originalName: file.original_name,
      fileName: file.file_name,
      size: file.file_size,
      mimeType: file.mime_type,
      createdAt: file.created_at,
      downloadUrl: `/files/download/${file.id}`,
      isImage: file.mime_type.startsWith('image/')
    }));

    res.json({ files: filesWithUrls });

  } catch (error) {
    console.error('Error getting expense files:', error);
    res.status(500).json({
      message: 'Error al obtener los archivos',
      error: error.message
    });
  }
});

// Delete file
router.delete('/:fileId', authMiddleware, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    const userId = req.user.id;

    // Get file information
    const fileRecord = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM file_attachments WHERE id = ?', [fileId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!fileRecord) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }

    // Check permissions
    if (fileRecord.user_id !== userId && !req.user.is_admin) {
      return res.status(403).json({ message: 'No tienes permisos para eliminar este archivo' });
    }

    // Delete physical file
    if (fsSync.existsSync(fileRecord.file_path)) {
      await fs.unlink(fileRecord.file_path);
    }

    // Delete database record
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM file_attachments WHERE id = ?', [fileId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // If it was a profile picture, update user record
    if (fileRecord.file_type === 'profile') {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET profile_picture = NULL WHERE id = ?', [fileRecord.user_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({ message: 'Archivo eliminado exitosamente' });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      message: 'Error al eliminar el archivo',
      error: error.message
    });
  }
});

// Admin: Get all files in the system
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, fileType, userId } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        fa.*,
        u.username,
        u.email,
        e.description as expense_description,
        e.amount as expense_amount
      FROM file_attachments fa
      JOIN users u ON fa.user_id = u.id
      LEFT JOIN expenses e ON fa.expense_id = e.id
      WHERE 1=1
    `;

    const params = [];

    if (fileType) {
      query += ' AND fa.file_type = ?';
      params.push(fileType);
    }

    if (userId) {
      query += ' AND fa.user_id = ?';
      params.push(parseInt(userId));
    }

    query += ' ORDER BY fa.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const files = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM file_attachments fa WHERE 1=1';
    const countParams = [];

    if (fileType) {
      countQuery += ' AND fa.file_type = ?';
      countParams.push(fileType);
    }

    if (userId) {
      countQuery += ' AND fa.user_id = ?';
      countParams.push(parseInt(userId));
    }

    const totalCount = await new Promise((resolve, reject) => {
      db.get(countQuery, countParams, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });

    const filesWithUrls = files.map(file => ({
      id: file.id,
      originalName: file.original_name,
      fileName: file.file_name,
      fileType: file.file_type,
      size: file.file_size,
      mimeType: file.mime_type,
      createdAt: file.created_at,
      downloadUrl: `/files/download/${file.id}`,
      isImage: file.mime_type.startsWith('image/'),
      user: {
        id: file.user_id,
        username: file.username,
        email: file.email
      },
      expense: file.expense_id ? {
        id: file.expense_id,
        description: file.expense_description,
        amount: file.expense_amount
      } : null
    }));

    res.json({
      files: filesWithUrls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Error getting all files:', error);
    res.status(500).json({
      message: 'Error al obtener los archivos',
      error: error.message
    });
  }
});

// Admin: Get storage statistics
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          file_type,
          COUNT(*) as file_count,
          SUM(file_size) as total_size,
          AVG(file_size) as avg_size
        FROM file_attachments 
        GROUP BY file_type
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const totalStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_size
        FROM file_attachments
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row || { total_files: 0, total_size: 0 });
      });
    });

    res.json({
      totalStats,
      byType: stats
    });

  } catch (error) {
    console.error('Error getting file stats:', error);
    res.status(500).json({
      message: 'Error al obtener las estadísticas',
      error: error.message
    });
  }
});

module.exports = router;