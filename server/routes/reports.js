const express = require('express');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const pdfService = require('../services/pdfService');
const db = require('../database');

const router = express.Router();

// Generate expense report
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      startDate,
      endDate,
      categoryId,
      format = 'monthly',
      includeSummary = true,
      includeCharts = true
    } = req.body;

    // Ensure reports directory exists
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const options = {
      startDate,
      endDate,
      categoryId,
      format,
      includeSummary,
      includeCharts
    };

    const result = await pdfService.generateExpenseReport(userId, options);

    res.json({
      message: 'Reporte generado correctamente',
      fileName: result.fileName,
      downloadUrl: `/api/reports/download/${result.fileName}`,
      summary: {
        totalExpenses: result.reportData.summary.total_expenses || 0,
        totalAmount: result.reportData.summary.total_amount || 0,
        period: result.reportData.period,
        generatedAt: result.reportData.generatedAt
      }
    });

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      message: 'Error al generar el reporte',
      error: error.message
    });
  }
});

// Download report
router.get('/download/:fileName', authMiddleware, (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // Validate filename to prevent directory traversal
    if (!fileName.match(/^expense-report-\d+-\d+\.pdf$/)) {
      return res.status(400).json({ message: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(__dirname, '../reports', fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    // Check if user owns this report (extract user ID from filename)
    const fileUserId = fileName.split('-')[2];
    if (fileUserId !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-report.pdf"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error al descargar el reporte' });
      }
    });

  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({
      message: 'Error al descargar el reporte',
      error: error.message
    });
  }
});

// Get available report formats
router.get('/formats', authMiddleware, (req, res) => {
  res.json({
    formats: [
      {
        value: 'weekly',
        label: 'Reporte semanal',
        description: 'Últimos 7 días de gastos'
      },
      {
        value: 'monthly',
        label: 'Reporte mensual',
        description: 'Mes actual o seleccionado'
      },
      {
        value: 'quarterly',
        label: 'Reporte trimestral',
        description: 'Últimos 3 meses de gastos'
      },
      {
        value: 'yearly',
        label: 'Reporte anual',
        description: 'Año actual o seleccionado'
      },
      {
        value: 'custom',
        label: 'Rango personalizado',
        description: 'Especifica fecha de inicio y fin'
      }
    ]
  });
});

// Get report templates/presets
router.get('/templates', authMiddleware, (req, res) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  res.json({
    templates: [
      {
        name: 'Esta semana',
        startDate: new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Semana pasada',
        startDate: new Date(now.setDate(now.getDate() - now.getDay() - 7)).toISOString().split('T')[0],
        endDate: new Date(now.setDate(now.getDate() - now.getDay() - 1)).toISOString().split('T')[0]
      },
      {
        name: 'Este mes',
        startDate: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Mes pasado',
        startDate: new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0],
        endDate: new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]
      },
      {
        name: 'Este año',
        startDate: new Date(currentYear, 0, 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Año pasado',
        startDate: new Date(currentYear - 1, 0, 1).toISOString().split('T')[0],
        endDate: new Date(currentYear - 1, 11, 31).toISOString().split('T')[0]
      }
    ]
  });
});

// Generate Excel report
router.post('/generate-excel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      startDate,
      endDate,
      categoryId,
      currencyId,
      description,
      minAmount,
      maxAmount,
      isRecurring
    } = req.body;

    // Build dynamic query with filters
    let query = `
      SELECT 
        e.id,
        e.description,
        e.amount,
        e.amount_cop,
        e.exchange_rate,
        e.date,
        e.is_recurring,
        e.recurring_frequency,
        e.created_at,
        c.name as category_name,
        c.color as category_color,
        cur.code as currency_code,
        cur.name as currency_name,
        cur.symbol as currency_symbol
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN currencies cur ON e.currency_id = cur.id
      WHERE e.user_id = ?
    `;

    const params = [userId];

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(endDate);
    }

    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(categoryId);
    }

    if (currencyId) {
      query += ' AND e.currency_id = ?';
      params.push(currencyId);
    }

    if (description) {
      query += ' AND e.description LIKE ?';
      params.push(`%${description}%`);
    }

    if (minAmount) {
      query += ' AND e.amount >= ?';
      params.push(minAmount);
    }

    if (maxAmount) {
      query += ' AND e.amount <= ?';
      params.push(maxAmount);
    }

    if (typeof isRecurring !== 'undefined') {
      query += ' AND e.is_recurring = ?';
      params.push(isRecurring);
    }

    query += ' ORDER BY e.date DESC, e.created_at DESC';

    // Execute query
    db.all(query, params, async (err, expenses) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error de base de datos' });
      }

      try {
        // Install xlsx if not already installed: npm install xlsx
        const XLSX = require('xlsx');

        // Create a new workbook
        const workbook = XLSX.utils.book_new();

        // Prepare expense data for Excel
        const excelData = expenses.map(expense => ({
          'ID': expense.id,
          'Descripción': expense.description,
          'Monto Original': expense.amount,
          'Moneda': expense.currency_code,
          'Símbolo': expense.currency_symbol,
          'Monto en COP': expense.amount_cop || expense.amount,
          'Tasa de Cambio': expense.exchange_rate || 1,
          'Categoría': expense.category_name,
          'Fecha': expense.date,
          'Es Recurrente': expense.is_recurring ? 'Sí' : 'No',
          'Frecuencia': expense.recurring_frequency || '',
          'Fecha de Creación': new Date(expense.created_at).toLocaleDateString('es-CO')
        }));

        // Create expenses worksheet
        const expensesSheet = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns
        const columnWidths = [
          { wch: 8 },  // ID
          { wch: 30 }, // Descripción
          { wch: 15 }, // Monto Original
          { wch: 8 },  // Moneda
          { wch: 8 },  // Símbolo
          { wch: 15 }, // Monto en COP
          { wch: 12 }, // Tasa de Cambio
          { wch: 20 }, // Categoría
          { wch: 12 }, // Fecha
          { wch: 12 }, // Es Recurrente
          { wch: 12 }, // Frecuencia
          { wch: 15 }  // Fecha de Creación
        ];
        expensesSheet['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(workbook, expensesSheet, 'Gastos');

        // Create summary worksheet
        const summaryQuery = `
          SELECT 
            cur.code as currency_code,
            cur.name as currency_name,
            COUNT(e.id) as expense_count,
            SUM(e.amount) as total_amount_original,
            SUM(COALESCE(e.amount_cop, e.amount)) as total_amount_cop
          FROM expenses e
          JOIN currencies cur ON e.currency_id = cur.id
          WHERE e.user_id = ?
          ${startDate ? ' AND e.date >= ?' : ''}
          ${endDate ? ' AND e.date <= ?' : ''}
          GROUP BY cur.id, cur.code, cur.name
          ORDER BY total_amount_cop DESC
        `;

        db.all(summaryQuery, params.slice(0, startDate && endDate ? 3 : 1), (err, summaryData) => {
          if (!err && summaryData.length > 0) {
            const summarySheet = XLSX.utils.json_to_sheet(summaryData.map(item => ({
              'Moneda': item.currency_code,
              'Nombre de Moneda': item.currency_name,
              'Cantidad de Gastos': item.expense_count,
              'Total Original': item.total_amount_original,
              'Total en COP': item.total_amount_cop
            })));
            
            summarySheet['!cols'] = [
              { wch: 10 }, // Moneda
              { wch: 20 }, // Nombre de Moneda
              { wch: 18 }, // Cantidad de Gastos
              { wch: 15 }, // Total Original
              { wch: 15 }  // Total en COP
            ];

            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen por Moneda');
          }

          // Generate file
          const fileName = `gastos-reporte-${userId}-${Date.now()}.xlsx`;
          const reportsDir = path.join(__dirname, '../reports');

          // Create reports directory if it doesn't exist
          if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
          }

          const filePath = path.join(reportsDir, fileName);
          XLSX.writeFile(workbook, filePath);

          res.json({
            message: 'Reporte Excel generado correctamente',
            fileName: fileName,
            downloadUrl: `/api/reports/download-excel/${fileName}`,
            recordCount: expenses.length,
            summary: {
              totalExpenses: expenses.length,
              dateRange: {
                startDate: startDate || 'Sin límite',
                endDate: endDate || 'Sin límite'
              },
              generatedAt: new Date().toISOString()
            }
          });
        });

      } catch (error) {
        console.error('Error creating Excel file:', error);
        res.status(500).json({ 
          message: 'Error al generar el archivo Excel',
          error: error.message 
        });
      }
    });

  } catch (error) {
    console.error('Error generating Excel report:', error);
    res.status(500).json({
      message: 'Error al generar el reporte Excel',
      error: error.message
    });
  }
});

// Download Excel report
router.get('/download-excel/:fileName', authMiddleware, (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // Validate filename
    if (!fileName.match(/^gastos-reporte-\d+-\d+\.xlsx$/)) {
      return res.status(400).json({ message: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(__dirname, '../reports', fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    // Check if user owns this report
    const fileUserId = fileName.split('-')[2];
    if (fileUserId !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Reporte_Gastos_${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming Excel file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error al descargar el reporte' });
      }
    });

  } catch (error) {
    console.error('Error downloading Excel report:', error);
    res.status(500).json({
      message: 'Error al descargar el reporte Excel',
      error: error.message
    });
  }
});

// Cleanup old reports (admin endpoint or scheduled)
router.delete('/cleanup', authMiddleware, async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    await pdfService.cleanupOldReports(maxAgeHours);
    
    res.json({
      message: 'Reportes antiguos eliminados correctamente'
    });
  } catch (error) {
    console.error('Error cleaning up reports:', error);
    res.status(500).json({
      message: 'Error al eliminar reportes',
      error: error.message
    });
  }
});

module.exports = router;