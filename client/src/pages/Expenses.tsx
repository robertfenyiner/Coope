import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiCalendar, FiDollarSign, FiTag } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';

interface Expense {
  id: number;
  amount: number;
  amount_cop?: number;
  exchange_rate_cop?: number;
  description: string;
  date: string;
  is_recurring: boolean;
  recurring_frequency?: string;
  next_due_date?: string;
  category_id: number;
  category_name: string;
  category_color: string;
  currency_id: number;
  currency_code: string;
  currency_symbol: string;
  created_at: string;
  attachment_path?: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
}

const Expenses: React.FC = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    categoryId: '',
    currencyId: '',
    is_recurring: false,
    recurring_frequency: 'monthly'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copEquivalent, setCopEquivalent] = useState('');
  const [exchangeRateCop, setExchangeRateCop] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileBaseUrl = (api.defaults.baseURL || '').replace('/api', '');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [currentPage, filterCategory, sortBy, sortOrder]);

  const loadInitialData = async () => {
    try {
      const [categoriesRes, currenciesRes] = await Promise.all([
        api.get('/categories'),
        api.get('/currencies')
      ]);
      
      setCategories(categoriesRes.data);
      setCurrencies(currenciesRes.data);
      
      // Set default currency to first one
      if (currenciesRes.data.length > 0 && !formData.currencyId) {
        setFormData(prev => ({ ...prev, currencyId: currenciesRes.data[0].id.toString() }));
      }
    } catch (error) {
      console.error('Error al cargar los datos iniciales:', error);
    }
  };

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        sortBy,
        sortOrder,
        ...(filterCategory && { category: filterCategory })
      });

      const response = await api.get(`/expenses?${params}`);
      setExpenses(response.data.expenses);
      setTotalPages(Math.ceil(response.data.total / 10));
    } catch (error) {
      console.error('Error al cargar los gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const convertToCOP = async () => {
      if (!formData.amount || !formData.currencyId) {
        setCopEquivalent('');
        setExchangeRateCop(null);
        return;
      }

      const currency = currencies.find(c => c.id.toString() === formData.currencyId);
      if (!currency) return;

      try {
        const res = await api.post('/currencies/convert', {
          amount: parseFloat(formData.amount),
          fromCurrency: currency.code,
          toCurrency: 'COP'
        });
        setCopEquivalent(res.data.convertedAmount.toFixed(2));
        setExchangeRateCop(res.data.exchangeRate);
      } catch (err) {
        console.error('Error al convertir moneda:', err);
      }
    };

    convertToCOP();
  }, [formData.amount, formData.currencyId, currencies]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'El monto debe ser mayor a 0';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'La descripción es obligatoria';
    } else if (formData.description.trim().length > 500) {
      newErrors.description = 'La descripción debe tener menos de 500 caracteres';
    }

    if (!formData.date) {
      newErrors.date = 'La fecha es obligatoria';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'La categoría es obligatoria';
    }

    if (!formData.currencyId) {
      newErrors.currencyId = 'La moneda es obligatoria';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const data = new FormData();
      data.append('amount', formData.amount);
      data.append('description', formData.description);
      data.append('date', formData.date);
      data.append('categoryId', formData.categoryId);
      data.append('currencyId', formData.currencyId);
      data.append('isRecurring', String(formData.is_recurring));
      data.append('recurringFrequency', formData.recurring_frequency);
      if (attachment) {
        data.append('attachment', attachment);
      }

      const config = { headers: { 'Content-Type': 'multipart/form-data' } };

      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, data, config);
      } else {
        await api.post('/expenses', data, config);
      }

      setShowModal(false);
      setEditingExpense(null);
      resetForm();
      loadExpenses();
    } catch (error: any) {
      console.error('Error al guardar el gasto:', error);
      setErrors({ submit: error.response?.data?.message || 'Error al guardar el gasto' });
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      date: expense.date,
      categoryId: expense.category_id?.toString() || '',
      currencyId: expense.currency_id?.toString() || '',
      is_recurring: expense.is_recurring,
      recurring_frequency: expense.recurring_frequency || 'monthly'
    });
    setCopEquivalent(expense.amount_cop ? expense.amount_cop.toString() : '');
    setExchangeRateCop(expense.exchange_rate_cop || null);
    setAttachment(null);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este gasto?')) {
      return;
    }

    try {
      await api.delete(`/expenses/${id}`);
      loadExpenses();
    } catch (error) {
      console.error('Error al eliminar el gasto:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      categoryId: '',
      currencyId: currencies.length > 0 ? currencies[0].id.toString() : '',
      is_recurring: false,
      recurring_frequency: 'monthly'
    });
    setErrors({});
    setCopEquivalent('');
    setExchangeRateCop(null);
    setAttachment(null);
  };

  const sanitizeColor = (color: string) => {
    return /^#[0-9A-F]{6}$/i.test(color) ? color : '#6B7280';
  };

  if (loading && expenses.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-600">Gestiona tus gastos y controla tu presupuesto</p>
        </div>
        <button
          onClick={() => {
            setEditingExpense(null);
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary mt-4 sm:mt-0"
        >
          <FiPlus className="w-5 h-5 mr-2" />
          Agregar gasto
        </button>
      </div>

      {/* Filters and Sort */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtrar por categoría
            </label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field"
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field"
            >
              <option value="date">Fecha</option>
              <option value="amount">Monto</option>
              <option value="description">Descripción</option>
              <option value="category">Categoría</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Orden
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="input-field"
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expenses List */}
      <div className="bg-white shadow-sm rounded-lg border">
        {expenses.length === 0 ? (
          <div className="text-center py-12">
            <FiDollarSign className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No se encontraron gastos</h3>
            <p className="mt-2 text-gray-500">Comienza agregando tu primer gasto.</p>
            <button
              onClick={() => {
                setEditingExpense(null);
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary mt-4"
            >
              <FiPlus className="w-5 h-5 mr-2" />
              Agregar gasto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Equivalente COP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Adjunto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {expense.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(expense.amount, expense.currency_code)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {expense.amount_cop ? formatCurrency(expense.amount_cop, 'COP') : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: sanitizeColor(expense.category_color) }}
                        />
                        <span className="text-sm text-gray-900">
                          {expense.category_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                    {expense.is_recurring ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Recurrente
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Único
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {expense.attachment_path ? (
                      <a
                        href={`${fileBaseUrl}/static/${expense.attachment_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        Ver
                      </a>
                    ) : (
                      '-' 
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(expense)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                        title="Editar gasto"
                      >
                        <FiEdit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Eliminar gasto"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">
                {editingExpense ? 'Editar gasto' : 'Agregar nuevo gasto'}
              </h3>

              {errors.submit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {errors.submit}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className={`input-field ${errors.description ? 'border-red-300' : ''}`}
                    placeholder="Ingresa la descripción del gasto"
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className={`input-field ${errors.amount ? 'border-red-300' : ''}`}
                    placeholder="0.00"
                  />
                  {errors.amount && (
                    <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className={`input-field ${errors.date ? 'border-red-300' : ''}`}
                  />
                  {errors.date && (
                    <p className="mt-1 text-sm text-red-600">{errors.date}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría *
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                    className={`input-field ${errors.categoryId ? 'border-red-300' : ''}`}
                  >
                    <option value="">Selecciona una categoría</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {errors.categoryId && (
                    <p className="mt-1 text-sm text-red-600">{errors.categoryId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Moneda *
                  </label>
                  <select
                    value={formData.currencyId}
                    onChange={(e) => setFormData(prev => ({ ...prev, currencyId: e.target.value }))}
                    className={`input-field ${errors.currencyId ? 'border-red-300' : ''}`}
                  >
                    <option value="">Selecciona una moneda</option>
                    {currencies.map((currency) => (
                      <option key={currency.id} value={currency.id}>
                        {currency.code} - {currency.name}
                      </option>
                    ))}
                  </select>
                  {errors.currencyId && (
                    <p className="mt-1 text-sm text-red-600">{errors.currencyId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equivalente en COP
                  </label>
                  <input
                    type="text"
                    value={copEquivalent ? formatCurrency(parseFloat(copEquivalent), 'COP') : ''}
                    readOnly
                    className="input-field bg-gray-50"
                  />
                  {exchangeRateCop && (
                    <p className="mt-1 text-xs text-gray-500">Tasa: {exchangeRateCop}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adjunto
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                    className="input-field"
                  />
                  {editingExpense && editingExpense.attachment_path && (
                    <a
                      href={`${fileBaseUrl}/static/${editingExpense.attachment_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline mt-1 inline-block"
                    >
                      Ver archivo actual
                    </a>
                  )}
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_recurring}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_recurring: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Gasto recurrente</span>
                  </label>
                </div>

                {formData.is_recurring && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Frecuencia
                    </label>
                    <select
                      value={formData.recurring_frequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, recurring_frequency: e.target.value }))}
                      className="input-field"
                    >
                      <option value="daily">Diaria</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingExpense(null);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    {editingExpense ? 'Actualizar' : 'Agregar'} gasto
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;