import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiTag } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';

interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  expense_count: number;
  created_at: string;
}

const Categories: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    color: '#3B82F6',
    icon: 'shopping-cart'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Predefined colors
  const colorOptions = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
    '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E'
  ];

  // Predefined icons (simplified for this example)
  const iconOptions = [
    'shopping-cart', 'home', 'car', 'utensils', 'heart', 'book',
    'music', 'film', 'coffee', 'gift', 'briefcase', 'plane'
  ];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Error al cargar las categorías:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre de la categoría es obligatorio';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'El nombre de la categoría debe tener al menos 2 caracteres';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'El nombre de la categoría debe tener menos de 100 caracteres';
    }

    // Check for duplicate names (excluding current category when editing)
    const isDuplicate = categories.some(
      cat => cat.name.toLowerCase() === formData.name.trim().toLowerCase() &&
      (!editingCategory || cat.id !== editingCategory.id)
    );

    if (isDuplicate) {
      newErrors.name = 'Ya existe una categoría con este nombre';
    }

    if (!formData.color || !/^#[0-9A-F]{6}$/i.test(formData.color)) {
      newErrors.color = 'Selecciona un color válido';
    }

    if (!formData.icon) {
      newErrors.icon = 'Selecciona un ícono';
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
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon
      };

      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, submitData);
      } else {
        await api.post('/categories', submitData);
      }

      setShowModal(false);
      setEditingCategory(null);
      resetForm();
      loadCategories();
    } catch (error: any) {
      console.error('Error al guardar la categoría:', error);
      setErrors({ submit: error.response?.data?.message || 'Error al guardar la categoría' });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      color: category.color,
      icon: category.icon
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string, expenseCount: number) => {
    if (expenseCount > 0) {
      alert(`No se puede eliminar "${name}" porque tiene ${expenseCount} gasto(s) asociado(s). Reasigna o elimina esos gastos primero.`);
      return;
    }

    if (!window.confirm(`¿Seguro que deseas eliminar la categoría "${name}"?`)) {
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      loadCategories();
    } catch (error: any) {
      console.error('Error al eliminar la categoría:', error);
      alert(error.response?.data?.message || 'Error al eliminar la categoría');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3B82F6',
      icon: 'shopping-cart'
    });
    setErrors({});
  };

  const sanitizeColor = (color: string) => {
    return /^#[0-9A-F]{6}$/i.test(color) ? color : '#6B7280';
  };

  const getIconComponent = (iconName: string) => {
    // For simplicity, return a tag icon for all. In a real app, you'd map to actual icons
    return <FiTag className="w-5 h-5" />;
  };

  if (loading) {
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
          <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
          <p className="text-gray-600">Organiza tus gastos con categorías personalizadas</p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null);
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary mt-4 sm:mt-0"
        >
          <FiPlus className="w-5 h-5 mr-2" />
          Agregar categoría
        </button>
      </div>

      {/* Categories Grid */}
      <div className="bg-white shadow-sm rounded-lg border">
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <FiTag className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No se encontraron categorías</h3>
            <p className="mt-2 text-gray-500">Comienza creando tu primera categoría de gastos.</p>
            <button
              onClick={() => {
                setEditingCategory(null);
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary mt-4"
            >
              <FiPlus className="w-5 h-5 mr-2" />
              Agregar categoría
            </button>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: sanitizeColor(category.color) }}
                      >
                        {getIconComponent(category.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-gray-900 truncate">
                          {category.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {category.expense_count} gasto{category.expense_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="text-blue-600 hover:text-blue-900 p-1"
                        title="Editar categoría"
                      >
                        <FiEdit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category.id, category.name, category.expense_count)}
                        className="text-red-600 hover:text-red-900 p-1"
                        title="Eliminar categoría"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">
                {editingCategory ? 'Editar categoría' : 'Agregar nueva categoría'}
              </h3>

              {errors.submit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {errors.submit}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la categoría *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={`input-field ${errors.name ? 'border-red-300' : ''}`}
                    placeholder="Ingresa el nombre de la categoría"
                    maxLength={100}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color *
                  </label>
                  <div className="grid grid-cols-8 gap-2 mb-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color ? 'border-gray-800' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full h-10 rounded-md border border-gray-300"
                  />
                  {errors.color && (
                    <p className="mt-1 text-sm text-red-600">{errors.color}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ícono *
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {iconOptions.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, icon }))}
                        className={`p-3 rounded-md border-2 flex items-center justify-center ${
                          formData.icon === icon
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                        title={icon}
                      >
                        {getIconComponent(icon)}
                      </button>
                    ))}
                  </div>
                  {errors.icon && (
                    <p className="mt-1 text-sm text-red-600">{errors.icon}</p>
                  )}
                </div>

                {/* Preview */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vista previa
                  </label>
                  <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: sanitizeColor(formData.color) }}
                    >
                      {getIconComponent(formData.icon)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {formData.name || 'Nombre de la categoría'}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingCategory(null);
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
                    {editingCategory ? 'Actualizar' : 'Crear'} categoría
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

export default Categories;