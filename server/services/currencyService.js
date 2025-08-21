const axios = require('axios');
const cron = require('node-cron');
const db = require('../database');

class CurrencyService {
  constructor() {
    this.scheduleExchangeRateUpdates();
  }

  scheduleExchangeRateUpdates() {
    // Update exchange rates every day at 6 AM
    cron.schedule('0 6 * * *', () => {
      this.updateExchangeRates();
    });

    // Initial update on startup (after 10 seconds delay)
    setTimeout(() => {
      this.updateExchangeRates();
    }, 10000);

    console.log('Currency service scheduler initialized');
  }

  async updateExchangeRates() {
    if (!process.env.EXCHANGE_API_KEY) {
      console.log('Exchange rate API key not configured, skipping update');
      return;
    }

    try {
      console.log('Updating exchange rates...');
      
      // Using exchangerate-api.com as primary source
      const response = await axios.get(
        `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_API_KEY}/latest/USD`,
        { timeout: 10000 }
      );

      const rates = response.data.conversion_rates;
      let updatedCount = 0;

      // Update rates in database
      for (const [currencyCode, rate] of Object.entries(rates)) {
        try {
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE currencies SET exchange_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?',
              [rate, currencyCode],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  if (this.changes > 0) {
                    updatedCount++;
                  }
                  resolve();
                }
              }
            );
          });
        } catch (error) {
          console.error(`Error updating rate for ${currencyCode}:`, error);
        }
      }

      console.log(`Exchange rates updated successfully. Updated ${updatedCount} currencies.`);
      
    } catch (error) {
      console.error('Error updating exchange rates:', error.message);
      
      // Fallback to fixer.io if primary API fails
      if (process.env.FIXER_API_KEY) {
        await this.updateExchangeRatesWithFixer();
      }
    }
  }

  async updateExchangeRatesWithFixer() {
    try {
      console.log('Trying fallback exchange rate service...');
      
      const response = await axios.get(
        `http://data.fixer.io/api/latest?access_key=${process.env.FIXER_API_KEY}&base=USD`,
        { timeout: 10000 }
      );

      if (!response.data.success) {
        throw new Error('Fixer.io API returned error');
      }

      const rates = response.data.rates;
      let updatedCount = 0;

      // Update rates in database
      for (const [currencyCode, rate] of Object.entries(rates)) {
        try {
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE currencies SET exchange_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?',
              [rate, currencyCode],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  if (this.changes > 0) {
                    updatedCount++;
                  }
                  resolve();
                }
              }
            );
          });
        } catch (error) {
          console.error(`Error updating rate for ${currencyCode}:`, error);
        }
      }

      console.log(`Fallback exchange rates updated successfully. Updated ${updatedCount} currencies.`);
      
    } catch (error) {
      console.error('Fallback exchange rate update also failed:', error.message);
    }
  }

  async convertCurrency(amount, fromCurrency, toCurrency) {
    return new Promise((resolve, reject) => {
      if (fromCurrency === toCurrency) {
        resolve({
          originalAmount: amount,
          convertedAmount: amount,
          fromCurrency,
          toCurrency,
          exchangeRate: 1
        });
        return;
      }

      // Get exchange rates for both currencies
      db.all(
        'SELECT code, exchange_rate FROM currencies WHERE code IN (?, ?)',
        [fromCurrency, toCurrency],
        (err, currencies) => {
          if (err) {
            reject(new Error('Database error'));
            return;
          }

          if (currencies.length !== 2) {
            reject(new Error('One or both currencies not found'));
            return;
          }

          const fromRate = currencies.find(c => c.code === fromCurrency)?.exchange_rate || 1;
          const toRate = currencies.find(c => c.code === toCurrency)?.exchange_rate || 1;

          // Convert to USD first, then to target currency
          const usdAmount = amount / fromRate;
          const convertedAmount = usdAmount * toRate;
          const exchangeRate = toRate / fromRate;

          resolve({
            originalAmount: parseFloat(amount),
            convertedAmount: Math.round(convertedAmount * 100) / 100,
            fromCurrency,
            toCurrency,
            exchangeRate: Math.round(exchangeRate * 10000) / 10000
          });
        }
      );
    });
  }

  async addCurrency(code, name, symbol) {
    return new Promise((resolve, reject) => {
      // Check if currency already exists
      db.get('SELECT id FROM currencies WHERE code = ?', [code], (err, existingCurrency) => {
        if (err) {
          reject(new Error('Database error'));
          return;
        }

        if (existingCurrency) {
          reject(new Error('Currency already exists'));
          return;
        }

        // Insert new currency
        db.run(
          'INSERT INTO currencies (code, name, symbol) VALUES (?, ?, ?)',
          [code, name, symbol],
          function(err) {
            if (err) {
              reject(new Error('Error adding currency'));
              return;
            }

            // Get the created currency
            db.get('SELECT * FROM currencies WHERE id = ?', [this.lastID], (err, currency) => {
              if (err) {
                reject(new Error('Error retrieving created currency'));
                return;
              }

              resolve(currency);
            });
          }
        );
      });
    });
  }

  async getAllCurrencies() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM currencies ORDER BY code ASC', (err, currencies) => {
        if (err) {
          reject(new Error('Database error'));
          return;
        }

        resolve(currencies);
      });
    });
  }

  async getCurrencyUsageStats(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          cur.code,
          cur.name,
          cur.symbol,
          COUNT(e.id) as expense_count,
          SUM(e.amount) as total_amount
        FROM currencies cur
        LEFT JOIN expenses e ON cur.id = e.currency_id AND e.user_id = ?
        GROUP BY cur.id
        HAVING expense_count > 0
        ORDER BY total_amount DESC
      `;

      db.all(query, [userId], (err, stats) => {
        if (err) {
          reject(new Error('Database error'));
          return;
        }

        resolve(stats);
      });
    });
  }

  async getExchangeRateHistory(currencyCode, days = 30) {
    // This would ideally fetch historical data from an API
    // For now, we'll return the current rate
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT exchange_rate, updated_at FROM currencies WHERE code = ?',
        [currencyCode],
        (err, currency) => {
          if (err) {
            reject(new Error('Database error'));
            return;
          }

          if (!currency) {
            reject(new Error('Currency not found'));
            return;
          }

          // Return simplified history (in production, you'd store historical data)
          const history = [{
            date: currency.updated_at,
            rate: currency.exchange_rate
          }];

          resolve(history);
        }
      );
    });
  }

  // Get popular currencies based on usage
  async getPopularCurrencies(limit = 10) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          cur.*,
          COUNT(e.id) as usage_count
        FROM currencies cur
        LEFT JOIN expenses e ON cur.id = e.currency_id
        GROUP BY cur.id
        ORDER BY usage_count DESC, cur.code ASC
        LIMIT ?
      `;

      db.all(query, [limit], (err, currencies) => {
        if (err) {
          reject(new Error('Database error'));
          return;
        }

        resolve(currencies);
      });
    });
  }
}

module.exports = new CurrencyService();