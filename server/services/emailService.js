// Importar librerías necesarias para el servicio de email
const nodemailer = require('nodemailer');  // Librería para envío de emails
const cron = require('node-cron');         // Programador de tareas automáticas (cron jobs)
const db = require('../database');         // Conexión a la base de datos SQLite

/**
 * Servicio de Email para Gastos Robert
 * 
 * Este servicio maneja todas las funcionalidades relacionadas con el envío de emails:
 * - Configuración automática de SMTP
 * - Envío de recordatorios de gastos recurrentes
 * - Resúmenes semanales de gastos
 * - Emails de prueba para verificar configuración
 * - Programación automática de envíos usando cron jobs
 * - Plantillas HTML responsivas para emails
 */
class EmailService {
  constructor() {
    // Inicializar el transporter de nodemailer como null
    this.transporter = null;
    
    // Configurar la conexión SMTP usando variables de entorno
    this.initializeTransporter();
    
    // Programar las verificaciones automáticas de recordatorios
    this.scheduleReminderChecks();
  }

  initializeTransporter() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️  Configuración de email no encontrada. Los recordatorios por email estarán deshabilitados.');
      console.warn('💡 Para habilitar emails, configura EMAIL_HOST, EMAIL_USER y EMAIL_PASS en el archivo .env');
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

    // Verificar que la configuración de conexión sea válida
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Error en la configuración de email:', error.message);
        console.error('💡 Verifica que EMAIL_HOST, EMAIL_USER y EMAIL_PASS sean correctos');
      } else {
        console.log('✅ Servicio de email configurado correctamente y listo para usar');
      }
    });
  }

  async sendEmail(to, subject, html, text) {
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
      text,
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
    const daysInAdvance = expense.reminder_days_advance || 1;
    const subject = `Recordatorio: ${expense.description} vence ${daysInAdvance === 1 ? 'mañana' : `en ${daysInAdvance} días`}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recordatorio de Gasto</title>
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
            <h1>💰 Recordatorio de Gasto</h1>
          </div>
          
          <div class="content">
            <p>Hola ${user.username},</p>
            
            <p>Este es un recordatorio amistoso sobre tu próximo gasto recurrente:</p>
            
            <div class="expense-details">
              <h3>${expense.description}</h3>
              <div class="amount">${expense.currency_symbol}${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <p><strong>Fecha de vencimiento:</strong> ${expense.next_due_date}</p>
              <p><strong>Categoría:</strong> ${expense.category_name}</p>
              <p><strong>Frecuencia:</strong> ${expense.recurring_frequency}</p>
            </div>
            
            <p>¡No olvides realizar este pago para mantener tus finanzas al día!</p>
            
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/expenses" class="button">
              Ver en Gastos Robert
            </a>
          </div>
          
          <div class="footer">
            <p>Este es un recordatorio automático de tu aplicación Gastos Robert.</p>
            <p>Si ya no deseas recibir estos recordatorios, puedes deshabilitarlos en la configuración de tu perfil.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Recordatorio de Gasto
      
      Hola ${user.username},
      
      Este es un recordatorio sobre tu próximo gasto recurrente:
      
      ${expense.description}
      Monto: ${expense.currency_symbol}${expense.amount}
      Fecha de vencimiento: ${expense.next_due_date}
      Categoría: ${expense.category_name}
      Frecuencia: ${expense.recurring_frequency}
      
      ¡No olvides realizar este pago!
      
      Visita Gastos Robert: ${process.env.APP_URL || 'http://localhost:3000'}/expenses
    `;

    return this.sendEmail(user.email, subject, html, text);
  }

  async sendTestEmail(user) {
    const subject = `Prueba de correo - Gastos Robert`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prueba de Correo</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
          .success-message { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Prueba de Correo</h1>
          </div>
          
          <div class="content">
            <p>Hola ${user.username},</p>
            
            <div class="success-message">
              <strong>¡Excelente!</strong> El servicio de correo electrónico de Gastos Robert está funcionando correctamente.
            </div>
            
            <p>Esta es una prueba para verificar que:</p>
            <ul>
              <li>✅ La configuración del servidor de correo es correcta</li>
              <li>✅ Los correos pueden ser enviados exitosamente</li>
              <li>✅ Los recordatorios de gastos recurrentes funcionarán correctamente</li>
            </ul>
            
            <p>Tu aplicación de gestión de gastos está lista para enviarte recordatorios importantes.</p>
          </div>
          
          <div class="footer">
            <p>Esta es una prueba de configuración de Gastos Robert.</p>
            <p>Fecha de prueba: ${new Date().toLocaleDateString('es-ES')}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Prueba de Correo - Gastos Robert
      
      Hola ${user.username},
      
      ¡Excelente! El servicio de correo electrónico está funcionando correctamente.
      
      Esta prueba verifica que:
      ✅ La configuración del servidor de correo es correcta
      ✅ Los correos pueden ser enviados exitosamente
      ✅ Los recordatorios de gastos recurrentes funcionarán correctamente
      
      Tu aplicación está lista para enviarte recordatorios importantes.
      
      Fecha de prueba: ${new Date().toLocaleDateString('es-ES')}
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

  scheduleReminderChecks() {
    // Check for reminders every day at 9 AM
    cron.schedule('0 9 * * *', () => {
      this.checkAndSendReminders();
    });

    // Send weekly summaries every Sunday at 8 PM
    cron.schedule('0 20 * * 0', () => {
      this.sendWeeklySummaries();
    });

    console.log('Email reminder scheduler initialized');
  }

  async checkAndSendReminders() {
    if (!this.transporter) {
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get recurring expenses that should be reminded based on their reminder_days_advance
      const query = `
        SELECT e.*, u.username, u.email, c.name as category_name, cur.symbol as currency_symbol,
               date(e.next_due_date, '-' || COALESCE(e.reminder_days_advance, 1) || ' day') as reminder_date
        FROM expenses e
        JOIN users u ON e.user_id = u.id
        JOIN categories c ON e.category_id = c.id
        JOIN currencies cur ON e.currency_id = cur.id
        WHERE e.is_recurring = 1 
        AND date(e.next_due_date, '-' || COALESCE(e.reminder_days_advance, 1) || ' day') = ?
        AND NOT EXISTS (
          SELECT 1 FROM email_reminders er 
          WHERE er.expense_id = e.id 
          AND er.reminder_date = ? 
          AND er.is_sent = 1
        )
      `;

      db.all(query, [today, today], async (err, expenses) => {
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

  async sendWeeklySummaries() {
    if (!this.transporter) {
      return;
    }

    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      // Get all users
      db.all('SELECT * FROM users', async (err, users) => {
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