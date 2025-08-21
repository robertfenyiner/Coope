const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const db = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Admin middleware
const adminMiddleware = (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

// Create database backup
router.post('/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `gastos-robert-backup-${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFileName);

    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });

    // Export all data
    const exportData = await exportAllData();

    // Write backup file
    await fs.writeFile(backupPath, JSON.stringify(exportData, null, 2));

    res.json({
      message: 'Backup creado exitosamente',
      fileName: backupFileName,
      downloadUrl: `/api/backup/download/${backupFileName}`,
      size: (await fs.stat(backupPath)).size,
      timestamp: new Date().toISOString(),
      recordCounts: {
        users: exportData.users?.length || 0,
        expenses: exportData.expenses?.length || 0,
        categories: exportData.categories?.length || 0,
        currencies: exportData.currencies?.length || 0,
        emailTemplates: exportData.emailTemplates?.length || 0
      }
    });

  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({
      message: 'Error al crear el backup',
      error: error.message
    });
  }
});

// Download backup file
router.get('/download/:fileName', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // Validate filename
    if (!fileName.match(/^gastos-robert-backup-.+\.json$/)) {
      return res.status(400).json({ message: 'Nombre de archivo inválido' });
    }

    const backupPath = path.join(__dirname, '../backups', fileName);

    if (!fsSync.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Archivo de backup no encontrado' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fileStream = fsSync.createReadStream(backupPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming backup file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error al descargar el backup' });
      }
    });

  } catch (error) {
    console.error('Error downloading backup:', error);
    res.status(500).json({
      message: 'Error al descargar el backup',
      error: error.message
    });
  }
});

// List available backups
router.get('/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../backups');
    
    try {
      await fs.access(backupDir);
    } catch {
      return res.json({ backups: [] });
    }

    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(file => 
      file.startsWith('gastos-robert-backup-') && file.endsWith('.json')
    );

    const backups = await Promise.all(
      backupFiles.map(async (fileName) => {
        const filePath = path.join(backupDir, fileName);
        const stats = await fs.stat(filePath);
        return {
          fileName,
          size: stats.size,
          created: stats.birthtime.toISOString(),
          downloadUrl: `/api/backup/download/${fileName}`
        };
      })
    );

    // Sort by creation date, newest first
    backups.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ backups });

  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({
      message: 'Error al listar los backups',
      error: error.message
    });
  }
});

// Restore from backup
router.post('/restore', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { fileName, backupData: directBackupData, clearExistingData = true } = req.body;
    let backupData;

    if (directBackupData) {
      // Direct backup data provided (from file upload)
      backupData = directBackupData;
    } else if (fileName) {
      // Read from server backup file
      const backupPath = path.join(__dirname, '../backups', fileName);

      if (!fsSync.existsSync(backupPath)) {
        return res.status(404).json({ message: 'Archivo de backup no encontrado' });
      }

      // Read backup file
      backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    } else {
      return res.status(400).json({ message: 'Nombre de archivo o datos de backup requeridos' });
    }

    // Validate backup structure
    if (!backupData.metadata || !backupData.metadata.version) {
      return res.status(400).json({ message: 'Formato de backup inválido' });
    }

    // Start transaction-like restore process
    const restoreResults = await restoreAllData(backupData, clearExistingData);

    res.json({
      message: 'Restore completado exitosamente',
      results: restoreResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({
      message: 'Error al restaurar el backup',
      error: error.message
    });
  }
});

// Upload backup file for restore
router.post('/upload', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // This would handle file upload - requires multer middleware
    // For now, we'll just return info about how to use the restore feature
    res.json({
      message: 'Para restaurar un backup, usa el endpoint /api/backup/restore con el fileName',
      instructions: [
        '1. Coloca el archivo .json en la carpeta server/backups/',
        '2. Llama a POST /api/backup/restore con { "fileName": "nombre-del-archivo.json" }'
      ]
    });
  } catch (error) {
    console.error('Error handling backup upload:', error);
    res.status(500).json({
      message: 'Error al procesar la subida del backup',
      error: error.message
    });
  }
});

// Delete backup file
router.delete('/:fileName', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    if (!fileName.match(/^gastos-robert-backup-.+\.json$/)) {
      return res.status(400).json({ message: 'Nombre de archivo inválido' });
    }

    const backupPath = path.join(__dirname, '../backups', fileName);

    if (!fsSync.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Archivo de backup no encontrado' });
    }

    await fs.unlink(backupPath);

    res.json({
      message: 'Backup eliminado exitosamente',
      fileName
    });

  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({
      message: 'Error al eliminar el backup',
      error: error.message
    });
  }
});

// Helper function to export all data
async function exportAllData() {
  return new Promise((resolve, reject) => {
    const exportData = {
      metadata: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        appName: 'Gastos Robert'
      },
      users: [],
      expenses: [],
      categories: [],
      currencies: [],
      emailTemplates: [],
      emailReminders: []
    };

    let completedQueries = 0;
    const totalQueries = 6;

    function checkComplete() {
      completedQueries++;
      if (completedQueries === totalQueries) {
        resolve(exportData);
      }
    }

    // Export users (excluding passwords for security)
    db.all('SELECT id, username, email, is_admin, created_at, updated_at FROM users', (err, rows) => {
      if (err) return reject(err);
      exportData.users = rows;
      checkComplete();
    });

    // Export expenses
    db.all('SELECT * FROM expenses', (err, rows) => {
      if (err) return reject(err);
      exportData.expenses = rows;
      checkComplete();
    });

    // Export categories
    db.all('SELECT * FROM categories', (err, rows) => {
      if (err) return reject(err);
      exportData.categories = rows;
      checkComplete();
    });

    // Export currencies
    db.all('SELECT * FROM currencies', (err, rows) => {
      if (err) return reject(err);
      exportData.currencies = rows;
      checkComplete();
    });

    // Export email templates
    db.all('SELECT * FROM email_templates', (err, rows) => {
      if (err) return reject(err);
      exportData.emailTemplates = rows || [];
      checkComplete();
    });

    // Export email reminders
    db.all('SELECT * FROM email_reminders', (err, rows) => {
      if (err) return reject(err);
      exportData.emailReminders = rows || [];
      checkComplete();
    });
  });
}

// Helper function to restore all data
async function restoreAllData(backupData, clearExisting) {
  return new Promise((resolve, reject) => {
    const results = {
      users: { imported: 0, skipped: 0 },
      expenses: { imported: 0, skipped: 0 },
      categories: { imported: 0, skipped: 0 },
      currencies: { imported: 0, skipped: 0 },
      emailTemplates: { imported: 0, skipped: 0 },
      emailReminders: { imported: 0, skipped: 0 }
    };

    // Begin transaction simulation
    db.serialize(() => {
      if (clearExisting) {
        // Clear existing data (except admin user)
        db.run('DELETE FROM email_reminders');
        db.run('DELETE FROM expenses');
        db.run('DELETE FROM categories WHERE user_id != (SELECT id FROM users WHERE username = "Robert" AND is_admin = 1)');
        db.run('DELETE FROM users WHERE username != "Robert" OR is_admin != 1');
      }

      // Restore currencies first (they're referenced by expenses)
      if (backupData.currencies) {
        backupData.currencies.forEach(currency => {
          db.run(
            'INSERT OR REPLACE INTO currencies (id, code, name, symbol, exchange_rate, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [currency.id, currency.code, currency.name, currency.symbol, currency.exchange_rate, currency.updated_at],
            function(err) {
              if (!err) results.currencies.imported++;
              else results.currencies.skipped++;
            }
          );
        });
      }

      // Restore users (except admin)
      if (backupData.users) {
        backupData.users.forEach(user => {
          if (user.username !== 'Robert' || !user.is_admin) {
            db.run(
              'INSERT OR IGNORE INTO users (id, username, email, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
              [user.id, user.username, user.email, user.is_admin, user.created_at, user.updated_at],
              function(err) {
                if (!err && this.changes > 0) results.users.imported++;
                else results.users.skipped++;
              }
            );
          }
        });
      }

      // Restore categories
      if (backupData.categories) {
        backupData.categories.forEach(category => {
          db.run(
            'INSERT OR REPLACE INTO categories (id, user_id, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [category.id, category.user_id, category.name, category.color, category.icon, category.created_at],
            function(err) {
              if (!err) results.categories.imported++;
              else results.categories.skipped++;
            }
          );
        });
      }

      // Restore expenses
      if (backupData.expenses) {
        backupData.expenses.forEach(expense => {
          db.run(
            `INSERT OR REPLACE INTO expenses 
             (id, user_id, category_id, currency_id, amount, amount_cop, exchange_rate, description, date, 
              is_recurring, recurring_frequency, next_due_date, reminder_days_advance, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              expense.id, expense.user_id, expense.category_id, expense.currency_id, expense.amount,
              expense.amount_cop, expense.exchange_rate, expense.description, expense.date,
              expense.is_recurring, expense.recurring_frequency, expense.next_due_date,
              expense.reminder_days_advance, expense.created_at, expense.updated_at
            ],
            function(err) {
              if (!err) results.expenses.imported++;
              else results.expenses.skipped++;
            }
          );
        });
      }

      // Restore email templates
      if (backupData.emailTemplates) {
        backupData.emailTemplates.forEach(template => {
          db.run(
            'INSERT OR REPLACE INTO email_templates (id, template_name, subject, html_content, text_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [template.id, template.template_name, template.subject, template.html_content, template.text_content, template.created_at, template.updated_at],
            function(err) {
              if (!err) results.emailTemplates.imported++;
              else results.emailTemplates.skipped++;
            }
          );
        });
      }

      // Restore email reminders
      if (backupData.emailReminders) {
        backupData.emailReminders.forEach(reminder => {
          db.run(
            'INSERT OR REPLACE INTO email_reminders (id, user_id, expense_id, reminder_date, is_sent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [reminder.id, reminder.user_id, reminder.expense_id, reminder.reminder_date, reminder.is_sent, reminder.created_at],
            function(err) {
              if (!err) results.emailReminders.imported++;
              else results.emailReminders.skipped++;
            }
          );
        });
      }

      setTimeout(() => resolve(results), 1000); // Wait a bit for all queries to complete
    });
  });
}

module.exports = router;