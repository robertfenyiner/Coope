const express = require('express');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const pdfService = require('../services/pdfService');

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
      message: 'Report generated successfully',
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
      message: 'Error generating report', 
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
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const filePath = path.join(__dirname, '../reports', fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Check if user owns this report (extract user ID from filename)
    const fileUserId = fileName.split('-')[2];
    if (fileUserId !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-report.pdf"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error downloading report' });
      }
    });

  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ 
      message: 'Error downloading report', 
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
        label: 'Weekly Report',
        description: 'Last 7 days of expenses'
      },
      {
        value: 'monthly',
        label: 'Monthly Report',
        description: 'Current or selected month'
      },
      {
        value: 'quarterly',
        label: 'Quarterly Report',
        description: 'Last 3 months of expenses'
      },
      {
        value: 'yearly',
        label: 'Yearly Report',
        description: 'Current or selected year'
      },
      {
        value: 'custom',
        label: 'Custom Range',
        description: 'Specify start and end dates'
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
        name: 'This Week',
        startDate: new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Last Week',
        startDate: new Date(now.setDate(now.getDate() - now.getDay() - 7)).toISOString().split('T')[0],
        endDate: new Date(now.setDate(now.getDate() - now.getDay() - 1)).toISOString().split('T')[0]
      },
      {
        name: 'This Month',
        startDate: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Last Month',
        startDate: new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0],
        endDate: new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]
      },
      {
        name: 'This Year',
        startDate: new Date(currentYear, 0, 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      {
        name: 'Last Year',
        startDate: new Date(currentYear - 1, 0, 1).toISOString().split('T')[0],
        endDate: new Date(currentYear - 1, 11, 31).toISOString().split('T')[0]
      }
    ]
  });
});

// Cleanup old reports (admin endpoint or scheduled)
router.delete('/cleanup', authMiddleware, async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    await pdfService.cleanupOldReports(maxAgeHours);
    
    res.json({ 
      message: 'Old reports cleaned up successfully' 
    });
  } catch (error) {
    console.error('Error cleaning up reports:', error);
    res.status(500).json({ 
      message: 'Error cleaning up reports', 
      error: error.message 
    });
  }
});

module.exports = router;