import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiTrendingUp, FiDollarSign, FiCalendar } from 'react-icons/fi';
import { Expense, ExpenseStats } from '../types';
import api from '../utils/api';
import { formatCurrency, formatDateShort } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard: React.FC = () => {
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [expensesResponse, statsResponse] = await Promise.all([
        api.get('/expenses?limit=5'),
        api.get('/expenses/stats/summary')
      ]);

      setRecentExpenses(expensesResponse.data.expenses);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const totalAmount = stats?.totalStats.total_amount || 0;
  const totalExpenses = stats?.totalStats.total_expenses || 0;
  const avgAmount = stats?.totalStats.avg_amount || 0;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <FiDollarSign className="w-6 h-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Gastado</p>
              <p className="text-2xl font-bold text-gray-900">
                ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <FiTrendingUp className="w-6 h-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total de Gastos</p>
              <p className="text-2xl font-bold text-gray-900">{totalExpenses}</p>
            </div>
          </div>
        </div>

        <div className="card sm:col-span-2 lg:col-span-1">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <FiCalendar className="w-6 h-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Promedio</p>
              <p className="text-2xl font-bold text-gray-900">
                ${avgAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Acciones rápidas</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to="/expenses?action=add"
            className="flex flex-col items-center p-4 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors duration-200"
          >
            <FiPlus className="w-6 h-6 text-primary-600 mb-2" />
            <span className="text-sm font-medium text-primary-700">Agregar gasto</span>
          </Link>
          <Link
            to="/expenses"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <FiDollarSign className="w-6 h-6 text-gray-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Ver todos</span>
          </Link>
          <Link
            to="/categories"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <FiTrendingUp className="w-6 h-6 text-gray-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Categorías</span>
          </Link>
          <Link
            to="/profile"
            className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <FiCalendar className="w-6 h-6 text-gray-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Configuración</span>
          </Link>
        </div>
      </div>

      {/* Recent Expenses */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Gastos recientes</h3>
          <Link
            to="/expenses"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Ver todos
          </Link>
        </div>

        {recentExpenses.length === 0 ? (
          <div className="text-center py-8">
            <FiDollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Aún no hay gastos</p>
            <Link
              to="/expenses?action=add"
              className="btn-primary"
            >
              Agrega tu primer gasto
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: expense.category_color }}
                  >
                    {expense.category_name.charAt(0)}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">
                      {expense.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {expense.category_name} • {formatDateShort(expense.date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(expense.amount, expense.currency_symbol)}
                  </p>
                  <p className="text-xs text-gray-500">{expense.currency_code}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spending by Category */}
      {stats && stats.categoryStats.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Gasto por categoría</h3>
          </div>
          <div className="space-y-3">
            {stats.categoryStats.slice(0, 5).map((category, index) => {
              const percentage = totalAmount > 0 ? (category.total_amount / totalAmount) * 100 : 0;
              return (
                <div key={index} className="flex items-center">
                  <div
                    className="w-4 h-4 rounded-full mr-3"
                    style={{ backgroundColor: category.category_color }}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {category.category_name}
                      </span>
                      <span className="text-sm text-gray-600">
                        ${category.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          backgroundColor: category.category_color,
                          width: `${percentage}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;