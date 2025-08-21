import React, { useState, useEffect, useRef } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiCalendar, FiDollarSign, FiTag, FiPaperclip, FiDownload, FiX, FiEye, FiMaximize2, FiExternalLink, FiImage, FiFile } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import AmountDisplay from '../components/AmountDisplay';
import AuthenticatedImage from '../components/AuthenticatedImage';
import AuthenticatedPDF from '../components/AuthenticatedPDF';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { getExpenseFileUrl } from '../utils/config';

interface Expense {
  id: number;
  amount: number;
  amount_cop?: number;
  exchange_rate?: number;
  description: string;
  date: string;
  is_recurring: boolean;
  recurring_frequency?: string;
  next_due_date?: string;
  reminder_days_advance?: number;
  category_name: string;
  category_color: string;
  currency_code: string;
  currency_symbol: string;
  created_at: string;
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
    recurring_frequency: 'monthly',
    reminderDaysAdvance: 1
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expenseFiles, setExpenseFiles] = useState<any[]>([]);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [viewingExpenseId, setViewingExpenseId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const submitData = {
        amount: parseFloat(formData.amount),
        description: formData.description,
        date: formData.date,
        categoryId: parseInt(formData.categoryId),
        currencyId: parseInt(formData.currencyId),
        isRecurring: formData.is_recurring,
        recurringFrequency: formData.recurring_frequency,
        reminderDaysAdvance: formData.reminderDaysAdvance
      };

      console.log('Enviando datos del gasto:', submitData); // Para depuración

      let expenseId;
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, submitData);
        expenseId = editingExpense.id;
      } else {
        const response = await api.post('/expenses', submitData);
        expenseId = response.data.expense?.id;
      }

      // Upload files if any are selected
      if (selectedFiles.length > 0 && expenseId) {
        await uploadExpenseFiles(expenseId);
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
    
    // Find the correct category and currency IDs from the current expense
    const categoryId = categories.find(c => c.name === expense.category_name)?.id?.toString() || '';
    const currencyId = currencies.find(c => c.code === expense.currency_code)?.id?.toString() || '';
    
    setFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      date: expense.date,
      categoryId: categoryId,
      currencyId: currencyId,
      is_recurring: expense.is_recurring,
      recurring_frequency: expense.recurring_frequency || 'monthly',
      reminderDaysAdvance: expense.reminder_days_advance || 1
    });
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
      recurring_frequency: 'monthly',
      reminderDaysAdvance: 1
    });
    setErrors({});
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sanitizeColor = (color: string) => {
    return /^#[0-9A-F]{6}$/i.test(color) ? color : '#6B7280';
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 5) {
      setErrors({ files: 'Máximo 5 archivos permitidos' });
      return;
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    const invalidFiles = files.filter(file => file.size > maxSize);
    if (invalidFiles.length > 0) {
      setErrors({ files: 'Algunos archivos exceden el tamaño máximo de 10MB' });
      return;
    }
    
    setSelectedFiles(files);
    setErrors({ ...errors, files: '' });
  };

  const removeSelectedFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
  };

  const uploadExpenseFiles = async (expenseId: number) => {
    if (selectedFiles.length === 0) return;
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('attachments', file);
    });
    
    try {
      await api.post(`/files/expense/${expenseId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      console.log('Archivos subidos exitosamente');
    } catch (error) {
      console.error('Error uploading files:', error);
    }
  };

  const loadExpenseFiles = async (expenseId: number) => {
    try {
      const response = await api.get(`/files/expense/${expenseId}`);
      setExpenseFiles(response.data.files);
    } catch (error) {
      console.error('Error loading expense files:', error);
    }
  };

  const viewExpenseFiles = (expenseId: number) => {
    setViewingExpenseId(expenseId);
    loadExpenseFiles(expenseId);
    setShowFilesModal(true);
  };

  const downloadFile = async (fileId: number, fileName: string) => {
    try {
      const response = await api.get(`/files/download/${fileId}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const openPreview = async (file: any) => {
    setPreviewFile(file);
    setShowPreviewModal(true);
  };

  const deleteExpenseFile = async (fileId: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este archivo?')) {
      return;
    }
    
    try {
      await api.delete(`/files/${fileId}`);
      if (viewingExpenseId) {
        loadExpenseFiles(viewingExpenseId);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gastos</h1>
          <p className="text-gray-600 dark:text-gray-400">Gestiona tus gastos y controla tu presupuesto</p>
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
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
        {expenses.length === 0 ? (
          <div className="text-center py-12">
            <FiDollarSign className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No se encontraron gastos</h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Comienza agregando tu primer gasto.</p>
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
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Descripción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {expense.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <AmountDisplay
                          amount={expense.amount}
                          currencySymbol={expense.currency_symbol}
                          currencyCode={expense.currency_code}
                          amountCOP={expense.amount_cop}
                          exchangeRate={expense.exchange_rate}
                          className="text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: sanitizeColor(expense.category_color) }}
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {expense.category_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => viewExpenseFiles(expense.id)}
                          className="text-green-600 hover:text-green-900 mr-4"
                          title="Ver archivos"
                        >
                          <FiPaperclip className="w-4 h-4" />
                        </button>
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

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {expenses.map((expense) => (
                <div key={expense.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {expense.description}
                      </h3>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: sanitizeColor(expense.category_color) }}
                        />
                        <span>{expense.category_name}</span>
                        <span className="mx-2">•</span>
                        <span>{formatDate(expense.date)}</span>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-2">
                      <button
                        onClick={() => viewExpenseFiles(expense.id)}
                        className="text-green-600 hover:text-green-900 p-1"
                        title="Ver archivos"
                      >
                        <FiPaperclip className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(expense)}
                        className="text-blue-600 hover:text-blue-900 p-1"
                        title="Editar gasto"
                      >
                        <FiEdit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="text-red-600 hover:text-red-900 p-1"
                        title="Eliminar gasto"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <AmountDisplay
                        amount={expense.amount}
                        currencySymbol={expense.currency_symbol}
                        currencyCode={expense.currency_code}
                        amountCOP={expense.amount_cop}
                        exchangeRate={expense.exchange_rate}
                        className="text-base font-semibold"
                      />
                    </div>
                    <div>
                      {expense.is_recurring ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Recurrente
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Único
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
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
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                {editingExpense ? 'Editar gasto' : 'Agregar nuevo gasto'}
              </h3>

              {errors.submit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {errors.submit}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_recurring}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_recurring: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Gasto recurrente</span>
                  </label>
                </div>

                {formData.is_recurring && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Días de anticipación para recordatorio
                      </label>
                      <select
                        value={formData.reminderDaysAdvance}
                        onChange={(e) => setFormData(prev => ({ ...prev, reminderDaysAdvance: parseInt(e.target.value) }))}
                        className="input-field"
                      >
                        <option value={1}>1 día antes</option>
                        <option value={2}>2 días antes</option>
                        <option value={3}>3 días antes</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Se enviará un recordatorio por correo electrónico con la anticipación seleccionada
                      </p>
                    </div>
                  </>
                )}

                {/* File attachments section */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Archivos adjuntos (opcional)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    <FiPaperclip className="w-4 h-4 mr-2" />
                    Seleccionar archivos
                  </button>
                  
                  {selectedFiles.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedFiles.length} archivo(s) seleccionado(s)
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <span className="truncate flex-1">{file.name}</span>
                            <span className="text-gray-500 dark:text-gray-400 mx-2">
                              {(file.size / 1024).toFixed(1)}KB
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSelectedFile(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {errors.files && (
                    <p className="mt-1 text-sm text-red-600">{errors.files}</p>
                  )}
                  
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Se permiten imágenes, PDF, documentos de Office y archivos de texto. Máximo 5 archivos de 10MB cada uno.
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingExpense(null);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
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

      {/* Files Modal */}
      {showFilesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Archivos adjuntos
                </h3>
                <button
                  onClick={() => setShowFilesModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {expenseFiles.length === 0 ? (
                <div className="text-center py-8">
                  <FiPaperclip className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No hay archivos</h3>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">Este gasto no tiene archivos adjuntos.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenseFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center flex-1">
                        <div className="flex-shrink-0">
                          {file.isImage ? (
                            <AuthenticatedImage
                              src={`/files/download/${file.id}`}
                              alt={file.originalName}
                              className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80"
                              fallbackIcon={FiPaperclip}
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                              <FiPaperclip className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {file.originalName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(file.size / 1024).toFixed(1)} KB • {new Date(file.createdAt).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-3">
                        {(file.isImage || file.mimeType === 'application/pdf') && (
                          <button
                            onClick={() => openPreview(file)}
                            className="text-purple-600 hover:text-purple-900 p-1"
                            title="Previsualizar"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => downloadFile(file.id, file.originalName)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Descargar"
                        >
                          <FiDownload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteExpenseFile(file.id)}
                          className="text-red-600 hover:text-red-900 p-1"
                          title="Eliminar"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowFilesModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización */}
      {showPreviewModal && previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full h-full max-h-screen overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {previewFile.originalName}
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => downloadFile(previewFile.id, previewFile.originalName)}
                  className="text-blue-600 hover:text-blue-900 p-2"
                  title="Descargar"
                >
                  <FiDownload className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2"
                  title="Cerrar"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden h-full" style={{ height: 'calc(100% - 72px)' }}>
              {previewFile.isImage ? (
                <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                  <AuthenticatedImage
                    src={`/files/download/${previewFile.id}`}
                    alt={previewFile.originalName}
                    className="max-w-full max-h-full object-contain"
                    fallbackIcon={FiImage}
                  />
                </div>
              ) : previewFile.mimeType === 'application/pdf' ? (
                <div className="h-full">
                  <AuthenticatedPDF
                    src={`/files/download/${previewFile.id}`}
                    className="w-full h-full border-0"
                    title={previewFile.originalName}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <FiFile className="mx-auto h-24 w-24 text-gray-400" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                      Vista previa no disponible
                    </h3>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      Este tipo de archivo no se puede previsualizar. Puedes descargarlo para abrirlo.
                    </p>
                    <button
                      onClick={() => downloadFile(previewFile.id, previewFile.originalName)}
                      className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <FiDownload className="w-4 h-4 mr-2" />
                      Descargar archivo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;