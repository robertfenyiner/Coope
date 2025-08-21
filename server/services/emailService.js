const nodemailer = require('nodemailer');
const cron = require('node-cron');
const db = require('../database');
const pdfService = require('./pdfService');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
    this.scheduleReminderChecks();
  }

  initializeTransporter() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('Email configuration not found. Email reminders will be disabled.');
      return;
    }

  this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('Email configuration error:', error);
      } else {
        console.log('Email service ready');
      }
    });
  }

  async sendEmail(to, subject, html, text, attachments = []) {
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
      text,
      attachments,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendExpenseReminder(user, expense) {
    const subject = `Reminder: ${expense.description} due soon`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Expense Reminder</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
          .expense-details { background-color: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #dc3545; }
          .button { display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Expense Reminder</h1>
          </div>
          
          <div class="content">
            <p>Hello ${user.username},</p>
            
            <p>This is a friendly reminder about your upcoming recurring expense:</p>
            
            <div class="expense-details">
              <h3>${expense.description}</h3>
              <div class="amount">${expense.currency_symbol}${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <p><strong>Due Date:</strong> ${expense.next_due_date}</p>
              <p><strong>Category:</strong> ${expense.category_name}</p>
              <p><strong>Frequency:</strong> ${expense.recurring_frequency}</p>
            </div>
            
            <p>Don't forget to make this payment to stay on top of your finances!</p>
            
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/expenses" class="button">
              View in Expense Tracker
            </a>
          </div>
          
          <div class="footer">
            <p>This is an automated reminder from your Expense Tracker app.</p>
            <p>If you no longer want to receive these reminders, you can disable them in your profile settings.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Expense Reminder
      
      Hello ${user.username},
      
      This is a reminder about your upcoming recurring expense:
      
      ${expense.description}
      Amount: ${expense.currency_symbol}${expense.amount}
      Due Date: ${expense.next_due_date}
      Category: ${expense.category_name}
      Frequency: ${expense.recurring_frequency}
      
      Don't forget to make this payment!
      
      Visit your Expense Tracker: ${process.env.APP_URL || 'http://localhost:3000'}/expenses
    `;

    return this.sendEmail(user.email, subject, html, text);
  }

  async sendWeeklySummary(user, weeklyStats) {
    const subject = `Weekly Expense Summary - $${weeklyStats.totalAmount}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Weekly Summary</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
          .stat-card { background-color: white; padding: 15px; border-radius: 8px; margin: 10px 0; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #3B82F6; }
          .category-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .button { display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Weekly Summary</h1>
          </div>
          
          <div class="content">
            <p>Hello ${user.username},</p>
            
            <p>Here's your spending summary for this week:</p>
            
            <div class="stat-card">
              <div class="stat-value">$${weeklyStats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div>Total Spent</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-value">${weeklyStats.totalExpenses}</div>
              <div>Total Expenses</div>
            </div>
            
            ${weeklyStats.categoryBreakdown.length > 0 ? `
              <h3>Spending by Category:</h3>
              <div style="background-color: white; padding: 15px; border-radius: 8px;">
                ${weeklyStats.categoryBreakdown.map(cat => `
                  <div class="category-item">
                    <span>${cat.category_name}</span>
                    <strong>$${cat.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard" class="button">
                View Full Dashboard
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p>Keep up the great work tracking your expenses!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Weekly Expense Summary
      
      Hello ${user.username},
      
      Here's your spending summary for this week:
      
      Total Spent: $${weeklyStats.totalAmount}
      Total Expenses: ${weeklyStats.totalExpenses}
      
      ${weeklyStats.categoryBreakdown.length > 0 ? 
        'Spending by Category:\n' + 
        weeklyStats.categoryBreakdown.map(cat => `${cat.category_name}: $${cat.total_amount}`).join('\n')
        : ''
      }
      
      Visit your dashboard: ${process.env.APP_URL || 'http://localhost:3000'}/dashboard
    `;

    return this.sendEmail(user.email, subject, html, text);
  }

  async sendRecurringForecast(user, startDate, endDate) {
    if (!this.transporter) {
      return;
    }

    return new Promise((resolve, reject) => {
      const query = `
        SELECT e.description, e.amount, e.next_due_date, c.name as category_name, cur.symbol as currency_symbol
        FROM expenses e
        JOIN categories c ON e.category_id = c.id
        JOIN currencies cur ON e.currency_id = cur.id
        WHERE e.user_id = ? AND e.is_recurring = 1 AND e.next_due_date >= ? AND e.next_due_date <= ?
        ORDER BY e.next_due_date ASC
      `;

      db.all(query, [user.id, startDate, endDate], async (err, expenses) => {
        if (err) {
          console.error('Error fetching recurring forecast:', err);
          return reject(err);
        }

        if (!expenses || expenses.length === 0) {
          return resolve();
        }

        const subject = 'Upcoming Recurring Expenses';

        const rows = expenses
          .map(exp => `<tr><td>${exp.description}</td><td>${exp.category_name}</td><td>${exp.currency_symbol}${exp.amount.toFixed(2)}</td><td>${exp.next_due_date}</td></tr>`)
          .join('');

        const html = `<!DOCTYPE html><html><body><p>Hola ${user.username},</p><p>Estos son tus gastos recurrentes próximos entre ${startDate} y ${endDate}:</p><table border="1" cellpadding="5" cellspacing="0"><tr><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Próxima fecha</th></tr>${rows}</table></body></html>`;

        const text = `Hola ${user.username},\n\nEstos son tus gastos recurrentes próximos entre ${startDate} y ${endDate}:\n\n${expenses.map(exp => `- ${exp.description} (${exp.category_name}): ${exp.currency_symbol}${exp.amount.toFixed(2)} el ${exp.next_due_date}`).join('\n')}`;

        try {
          await this.sendEmail(user.email, subject, html, text);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  getNextCycleRange(paymentCycle) {
    const now = new Date();
    let start, end;

    switch (paymentCycle) {
      case 'weekly': {
        const nextMonday = new Date(now);
        const day = nextMonday.getDay();
        const diff = (8 - day) % 7;
        nextMonday.setDate(nextMonday.getDate() + diff);
        start = nextMonday;
        end = new Date(nextMonday);
        end.setDate(end.getDate() + 6);
        break;
      }
      case 'biweekly': {
        const nextMonday = new Date(now);
        const day = nextMonday.getDay();
        const diff = (8 - day) % 7;
        nextMonday.setDate(nextMonday.getDate() + diff);
        start = nextMonday;
        end = new Date(nextMonday);
        end.setDate(end.getDate() + 13);
        break;
      }
      default: {
        start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        break;
      }
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  scheduleReminderChecks() {
    // Check for reminders every day at 9 AM
    cron.schedule('0 9 * * *', () => {
      this.checkAndSendReminders();
    });

    // Check upcoming recurring expenses for each payment cycle
    cron.schedule('0 9 * * *', () => {
      this.checkAndSendRecurringForecasts();
    });

    // Send weekly summaries every Sunday at 8 PM
    cron.schedule('0 20 * * 0', () => {
      this.sendWeeklySummaries();
    });

    // Send monthly reports on the first day of the month at 8 PM
    cron.schedule('0 20 1 * *', () => {
      this.sendMonthlyReports();
    });

    console.log('Email reminder scheduler initialized');
  }

  async checkAndSendReminders() {
    if (!this.transporter) {
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get recurring expenses due today or tomorrow
      const query = `
        SELECT e.*, u.username, u.email, c.name as category_name, cur.symbol as currency_symbol
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        JOIN categories c ON e.category_id = c.id
        JOIN currencies cur ON e.currency_id = cur.id
        WHERE e.is_recurring = 1 
        AND e.next_due_date IN (?, ?)
        AND NOT EXISTS (
          SELECT 1 FROM email_reminders er 
          WHERE er.expense_id = e.id 
          AND er.reminder_date = ? 
          AND er.is_sent = 1
        )
      `;

      db.all(query, [today, tomorrow, today], async (err, expenses) => {
        if (err) {
          console.error('Error fetching reminder expenses:', err);
          return;
        }

        for (const expense of expenses) {
          try {
            await this.sendExpenseReminder(
              { username: expense.username, email: expense.email },
              expense
            );

            // Mark reminder as sent
            db.run(
              'INSERT INTO email_reminders (user_id, expense_id, reminder_date, is_sent) VALUES (?, ?, ?, 1)',
              [expense.user_id, expense.id, today]
            );

            console.log(`Reminder sent for expense ${expense.id} to ${expense.email}`);
          } catch (error) {
            console.error(`Failed to send reminder for expense ${expense.id}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('Error in reminder check:', error);
    }
  }

  async checkAndSendRecurringForecasts() {
    if (!this.transporter) {
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      db.all('SELECT id, username, email, payment_cycle, reminder_days_before FROM users WHERE report_emails_enabled = 1', async (err, users) => {
        if (err) {
          console.error('Error fetching users for forecasts:', err);
          return;
        }

        for (const user of users) {
          const { start, end } = this.getNextCycleRange(user.payment_cycle);
          const reminderDate = new Date(start);
          reminderDate.setDate(reminderDate.getDate() - (user.reminder_days_before || 0));
          const reminderStr = reminderDate.toISOString().split('T')[0];

          if (reminderStr === today) {
            try {
              await this.sendRecurringForecast(user, start, end);
              console.log(`Recurring forecast sent to ${user.email}`);
            } catch (error) {
              console.error(`Failed to send forecast to ${user.email}:`, error);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error checking recurring forecasts:', error);
    }
  }

  async sendWeeklySummaries() {
    if (!this.transporter) {
      return;
    }

    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      // Get users who have enabled report emails
      db.all('SELECT * FROM users WHERE report_emails_enabled = 1', async (err, users) => {
        if (err) {
          console.error('Error fetching users:', err);
          return;
        }

        for (const user of users) {
          try {
            // Get weekly stats for this user
            const statsQuery = `
              SELECT 
                COUNT(e.id) as total_expenses,
                COALESCE(SUM(e.amount), 0) as total_amount
              FROM expenses e
              WHERE e.user_id = ? AND e.date >= ? AND e.date <= ?
            `;

            const categoryStatsQuery = `
              SELECT 
                c.name as category_name,
                SUM(e.amount) as total_amount
              FROM expenses e
              JOIN categories c ON e.category_id = c.id
              WHERE e.user_id = ? AND e.date >= ? AND e.date <= ?
              GROUP BY c.id
              ORDER BY total_amount DESC
              LIMIT 5
            `;

            db.get(statsQuery, [user.id, oneWeekAgo, today], (err, totalStats) => {
              if (err) {
                console.error('Error fetching weekly stats:', err);
                return;
              }

              db.all(categoryStatsQuery, [user.id, oneWeekAgo, today], async (err, categoryStats) => {
                if (err) {
                  console.error('Error fetching category stats:', err);
                  return;
                }

                // Only send summary if user had expenses this week
                if (totalStats.total_expenses > 0) {
                  const weeklyStats = {
                    totalAmount: totalStats.total_amount,
                    totalExpenses: totalStats.total_expenses,
                    categoryBreakdown: categoryStats
                  };

                  await this.sendWeeklySummary(user, weeklyStats);
                  console.log(`Weekly summary sent to ${user.email}`);
                }
              });
            });
          } catch (error) {
            console.error(`Failed to send weekly summary to ${user.email}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('Error in weekly summary:', error);
    }
  }

  async sendMonthlyReports() {
    if (!this.transporter) {
      return;
    }

    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0];
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .split('T')[0];

      db.all('SELECT * FROM users WHERE report_emails_enabled = 1', async (err, users) => {
        if (err) {
          console.error('Error fetching users:', err);
          return;
        }

        for (const user of users) {
          try {
            const result = await pdfService.generateExpenseReport(user.id, {
              startDate,
              endDate,
              format: 'monthly',
            });

            const subject = `Monthly Expense Report`;
            const html = `Hola ${user.username},<br/>Adjunto encontrarás tu reporte de gastos del último mes.`;
            const text = `Hola ${user.username}, adjunto encontrarás tu reporte de gastos del último mes.`;

            await this.sendEmail(
              user.email,
              subject,
              html,
              text,
              [{ filename: result.fileName, path: result.filePath }]
            );

            console.log(`Monthly report sent to ${user.email}`);
          } catch (error) {
            console.error(`Failed to send monthly report to ${user.email}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('Error in monthly report:', error);
    }
  }

  async updateRecurringExpenses() {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get recurring expenses that are due today
      const query = `
        SELECT * FROM expenses 
        WHERE is_recurring = 1 AND next_due_date = ?
      `;

      db.all(query, [today], (err, expenses) => {
        if (err) {
          console.error('Error fetching due expenses:', err);
          return;
        }

        for (const expense of expenses) {
          // Calculate next due date
          const currentDate = new Date(expense.next_due_date);
          let nextDueDate;

          switch (expense.recurring_frequency) {
            case 'daily':
              nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
              break;
            case 'weekly':
              nextDueDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
              break;
            case 'monthly':
              nextDueDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
              break;
            case 'yearly':
              nextDueDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
              break;
            default:
              continue;
          }

          // Update the next due date
          db.run(
            'UPDATE expenses SET next_due_date = ? WHERE id = ?',
            [nextDueDate.toISOString().split('T')[0], expense.id],
            (err) => {
              if (err) {
                console.error(`Error updating expense ${expense.id}:`, err);
              }
            }
          );
        }
      });
    } catch (error) {
      console.error('Error updating recurring expenses:', error);
    }
  }
}

module.exports = new EmailService();