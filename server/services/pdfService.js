const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../database');

class PDFService {
  constructor() {
    // Ensure reports directory exists
    this.reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateExpenseReport(userId, options = {}) {
    const {
      startDate,
      endDate,
      categoryId,
      format = 'monthly', // 'monthly', 'weekly', 'yearly', 'custom'
      includeSummary = true,
      includeCharts = true
    } = options;

    return new Promise((resolve, reject) => {
      // Get user info
      db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
        if (err || !user) {
          reject(new Error('Usuario no encontrado'));
          return;
        }

        try {
          const reportData = await this.getReportData(userId, options);
          const fileName = `expense-report-${userId}-${Date.now()}.pdf`;
          const filePath = path.join(this.reportsDir, fileName);

          await this.createPDFReport(user, reportData, filePath, options);
          
          resolve({
            fileName,
            filePath,
            reportData
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async getReportData(userId, options) {
    const { startDate, endDate, categoryId } = options;
    
    let whereClause = 'WHERE e.user_id = ?';
    let params = [userId];

    if (startDate) {
      whereClause += ' AND e.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND e.date <= ?';
      params.push(endDate);
    }

    if (categoryId) {
      whereClause += ' AND e.category_id = ?';
      params.push(categoryId);
    }

    // Get expenses
    const expensesQuery = `
      SELECT e.*, c.name as category_name, c.color as category_color,
             cur.code as currency_code, cur.symbol as currency_symbol
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN currencies cur ON e.currency_id = cur.id
      ${whereClause}
      ORDER BY e.date DESC, e.created_at DESC
    `;

    // Get summary stats
    const summaryQuery = `
      SELECT 
        COUNT(e.id) as total_expenses,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount,
        MIN(e.amount) as min_amount,
        MAX(e.amount) as max_amount
      FROM expenses e
      ${whereClause}
    `;

    // Get category breakdown
    const categoryQuery = `
      SELECT 
        c.name as category_name,
        c.color as category_color,
        COUNT(e.id) as expense_count,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY total_amount DESC
    `;

    // Get monthly breakdown
    const monthlyQuery = `
      SELECT 
        strftime('%Y-%m', e.date) as month,
        COUNT(e.id) as expense_count,
        SUM(e.amount) as total_amount
      FROM expenses e
      ${whereClause}
      GROUP BY strftime('%Y-%m', e.date)
      ORDER BY month DESC
    `;

    const [expenses, summary, categoryBreakdown, monthlyBreakdown] = await Promise.all([
      this.executeQuery(expensesQuery, params),
      this.executeQuery(summaryQuery, params),
      this.executeQuery(categoryQuery, params),
      this.executeQuery(monthlyQuery, params)
    ]);

    return {
      expenses,
      summary: summary[0] || {},
      categoryBreakdown,
      monthlyBreakdown,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
  }

  executeQuery(query, params) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async createPDFReport(user, reportData, filePath, options) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        
        doc.pipe(stream);

        // Header
        this.addHeader(doc, user, reportData);
        
        // Summary section
        if (options.includeSummary) {
          this.addSummarySection(doc, reportData);
        }

        // Category breakdown
        this.addCategoryBreakdown(doc, reportData);

        // Monthly trends
        this.addMonthlyTrends(doc, reportData);

        // Detailed expenses list
        this.addExpensesList(doc, reportData);

        // Footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve(filePath);
        });

        stream.on('error', (error) => {
          console.error('PDF Stream error:', error);
          reject(error);
        });

        doc.on('error', (error) => {
          console.error('PDF Document error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('PDF Creation error:', error);
        reject(error);
      }
    });
  }

  addHeader(doc, user, reportData) {
    // Title
    doc.fontSize(24)
       .fillColor('#2563eb')
       .text('Expense Report', 50, 50);

    // User info
    doc.fontSize(12)
       .fillColor('#374151')
       .text(`Generated for: ${user.username}`, 50, 85)
       .text(`Email: ${user.email}`, 50, 100)
       .text(`Generated on: ${new Date(reportData.generatedAt).toLocaleDateString()}`, 50, 115);

    // Period
    if (reportData.period.startDate || reportData.period.endDate) {
      const startDate = reportData.period.startDate ? new Date(reportData.period.startDate).toLocaleDateString() : 'Beginning';
      const endDate = reportData.period.endDate ? new Date(reportData.period.endDate).toLocaleDateString() : 'Today';
      
      doc.text(`Period: ${startDate} - ${endDate}`, 50, 130);
    }

    doc.moveDown(2);
  }

  addSummarySection(doc, reportData) {
    const { summary } = reportData;
    
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Summary', 50, doc.y);
    
    doc.moveDown(0.5);

    // Summary boxes
    const boxWidth = 120;
    const boxHeight = 60;
    const startX = 50;
    let currentX = startX;

    const summaryItems = [
      { label: 'Total Expenses', value: summary.total_expenses || 0 },
      { label: 'Total Amount', value: `$${(summary.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Average', value: `$${(summary.avg_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Highest', value: `$${(summary.max_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` }
    ];

    summaryItems.forEach((item, index) => {
      if (index > 0 && index % 4 === 0) {
        currentX = startX;
        doc.y += boxHeight + 10;
      }

      // Box background
      doc.rect(currentX, doc.y, boxWidth, boxHeight)
         .fillAndStroke('#f3f4f6', '#e5e7eb');

      // Value
      doc.fontSize(18)
         .fillColor('#1f2937')
         .text(item.value, currentX + 10, doc.y + 15, { width: boxWidth - 20, align: 'center' });

      // Label
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(item.label, currentX + 10, doc.y + 40, { width: boxWidth - 20, align: 'center' });

      currentX += boxWidth + 15;
    });

    doc.y += boxHeight + 20;
  }

  addCategoryBreakdown(doc, reportData) {
    const { categoryBreakdown } = reportData;
    
    if (categoryBreakdown.length === 0) return;

    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Spending by Category', 50, doc.y);
    
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const categoryCol = 50;
    const expensesCol = 200;
    const amountCol = 300;
    const percentCol = 450;

    doc.fontSize(12)
       .fillColor('#374151')
       .text('Category', categoryCol, tableTop, { width: 140 })
       .text('Expenses', expensesCol, tableTop, { width: 80 })
       .text('Amount', amountCol, tableTop, { width: 120 })
       .text('Percentage', percentCol, tableTop, { width: 80 });

    // Underline header
    doc.strokeColor('#d1d5db')
       .lineWidth(1)
       .moveTo(categoryCol, tableTop + 15)
       .lineTo(550, tableTop + 15)
       .stroke();

    const totalAmount = reportData.summary.total_amount || 1;
    let currentY = tableTop + 25;

    categoryBreakdown.forEach((category, index) => {
      const percentage = ((category.total_amount / totalAmount) * 100).toFixed(1);
      
      doc.fontSize(10)
         .fillColor('#374151')
         .text(category.category_name, categoryCol, currentY, { width: 140 })
         .text(category.expense_count.toString(), expensesCol, currentY, { width: 80 })
         .text(`$${category.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountCol, currentY, { width: 120 })
         .text(`${percentage}%`, percentCol, currentY, { width: 80 });

      currentY += 20;

      // Add page break if needed
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }
    });

    doc.y = currentY + 20;
  }

  addMonthlyTrends(doc, reportData) {
    const { monthlyBreakdown } = reportData;
    
    if (monthlyBreakdown.length === 0) return;

    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Monthly Trends', 50, doc.y);
    
    doc.moveDown(0.5);

    // Simple chart (text-based)
    monthlyBreakdown.slice(0, 6).forEach((month) => {
      const monthName = new Date(month.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      
      doc.fontSize(11)
         .fillColor('#374151')
         .text(`${monthName}: $${month.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${month.expense_count} expenses)`, 50, doc.y);
      
      doc.moveDown(0.3);
    });

    doc.moveDown(1);
  }

  addExpensesList(doc, reportData) {
    const { expenses } = reportData;
    
    if (expenses.length === 0) return;

    // Add new page for expenses list
    doc.addPage();

    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Detailed Expenses', 50, 50);
    
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const dateCol = 50;
    const descCol = 120;
    const categoryCol = 300;
    const amountCol = 420;
    const currencyCol = 500;

    doc.fontSize(10)
       .fillColor('#374151')
       .text('Date', dateCol, tableTop)
       .text('Description', descCol, tableTop)
       .text('Category', categoryCol, tableTop)
       .text('Amount', amountCol, tableTop)
       .text('Currency', currencyCol, tableTop);

    // Underline header
    doc.strokeColor('#d1d5db')
       .lineWidth(1)
       .moveTo(dateCol, tableTop + 12)
       .lineTo(550, tableTop + 12)
       .stroke();

    let currentY = tableTop + 20;

    expenses.slice(0, 50).forEach((expense, index) => { // Limit to 50 expenses
      const date = new Date(expense.date).toLocaleDateString();
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text(date, dateCol, currentY, { width: 60 })
         .text(expense.description.substring(0, 25), descCol, currentY, { width: 170 })
         .text(expense.category_name, categoryCol, currentY, { width: 110 })
         .text(`${expense.currency_symbol}${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountCol, currentY, { width: 70 })
         .text(expense.currency_code, currencyCol, currentY, { width: 40 });

      currentY += 15;

      // Add page break if needed
      if (currentY > 750) {
        doc.addPage();
        currentY = 50;
      }
    });

    if (expenses.length > 50) {
      doc.moveDown(1)
         .fontSize(10)
         .fillColor('#6b7280')
         .text(`... and ${expenses.length - 50} more expenses`, 50, doc.y);
    }
  }

  addFooter(doc) {
    try {
      const pageCount = doc.bufferedPageRange().count;
      
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fontSize(8)
           .fillColor('#9ca3af')
           .text(`Generated by Expense Tracker - Page ${i + 1} of ${pageCount}`, 50, 770, {
             width: 500,
             align: 'center'
           });
      }
    } catch (error) {
      console.error('Error adding footer:', error);
      // Continue without footer if there's an error
    }
  }

  async cleanupOldReports(maxAgeHours = 24) {
    try {
      const files = fs.readdirSync(this.reportsDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.reportsDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old report: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old reports:', error);
    }
  }
}

module.exports = new PDFService();