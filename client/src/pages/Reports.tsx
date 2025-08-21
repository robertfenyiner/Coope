import React, { useState, useEffect } from 'react';
import { FiDownload, FiFilter, FiCalendar, FiFileText } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';

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

interface ReportFilters {
  startDate: string;
  endDate: string;
  categoryId: string;
  currencyId: string;
  description: string;
  minAmount: string;
  maxAmount: string;
  isRecurring: string;
}

const Reports: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: '',
    endDate: '',
    categoryId: '',
    currencyId: '',
    description: '',
    minAmount: '',
    maxAmount: '',
    isRecurring: ''
  });

  const [reportTemplates] = useState([
    {
      name: 'Esta semana',
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    },
    {
      name: 'Este mes',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    },
    {
      name: 'Mes pasado',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0],
      endDate: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
    },
    {
      name: 'Este año',
      startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [categoriesResponse, currenciesResponse] = await Promise.all([
        api.get('/categories'),
        api.get('/currencies')
      ]);
      
      setCategories(categoriesResponse.data);
      setCurrencies(currenciesResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (template: { startDate: string; endDate: string }) => {
    setFilters(prev => ({
      ...prev,
      startDate: template.startDate,
      endDate: template.endDate
    }));
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      categoryId: '',
      currencyId: '',
      description: '',
      minAmount: '',
      maxAmount: '',
      isRecurring: ''
    });
  };

  const generateExcelReport = async () => {
    try {
      setGenerating(true);
      
      // Prepare filters - only send non-empty values
      const reportFilters: any = {};
      
      if (filters.startDate) reportFilters.startDate = filters.startDate;
      if (filters.endDate) reportFilters.endDate = filters.endDate;
      if (filters.categoryId) reportFilters.categoryId = parseInt(filters.categoryId);
      if (filters.currencyId) reportFilters.currencyId = parseInt(filters.currencyId);
      if (filters.description) reportFilters.description = filters.description;
      if (filters.minAmount) reportFilters.minAmount = parseFloat(filters.minAmount);
      if (filters.maxAmount) reportFilters.maxAmount = parseFloat(filters.maxAmount);
      if (filters.isRecurring !== '') reportFilters.isRecurring = filters.isRecurring === 'true';

      const response = await api.post('/reports/generate-excel', reportFilters);
      
      // Download the file using fetch to include auth headers
      const downloadUrl = response.data.downloadUrl;
      const token = localStorage.getItem('token');
      
      const downloadResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!downloadResponse.ok) {
        throw new Error('Error al descargar el archivo');
      }
      
      // Create blob and download
      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Reporte_Gastos_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(`Reporte Excel generado exitosamente con ${response.data.recordCount} registros`);
      
    } catch (error: any) {
      console.error('Error generating Excel report:', error);
      alert(error.response?.data?.message || 'Error al generar el reporte Excel');
    } finally {
      setGenerating(false);
    }
  };

  const generatePDFReport = async () => {
    try {
      setGenerating(true);
      
      const reportOptions = {
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        categoryId: filters.categoryId ? parseInt(filters.categoryId) : undefined,
        format: 'monthly',
        includeSummary: true,
        includeCharts: true
      };

      const response = await api.post('/reports/generate', reportOptions);
      
      // Download the file using fetch to include auth headers
      const downloadUrl = response.data.downloadUrl;
      const token = localStorage.getItem('token');
      
      const downloadResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!downloadResponse.ok) {
        throw new Error('Error al descargar el archivo');
      }
      
      // Create blob and download
      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Reporte_PDF_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('Reporte PDF generado exitosamente');
      
    } catch (error: any) {
      console.error('Error generating PDF report:', error);
      alert(error.response?.data?.message || 'Error al generar el reporte PDF');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes de Gastos</h1>
        <p className="text-gray-600">Genera reportes detallados de tus gastos con filtros personalizados</p>
      </div>

      {/* Quick Templates */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Plantillas Rápidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {reportTemplates.map((template, index) => (
            <button
              key={index}
              onClick={() => applyTemplate(template)}
              className="p-3 text-left border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center">
                <FiCalendar className="w-4 h-4 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-gray-900">{template.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(template.startDate).toLocaleDateString('es-ES')} - {new Date(template.endDate).toLocaleDateString('es-ES')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <FiFilter className="w-5 h-5 mr-2" />
            Filtros de Reporte
          </h3>
          <button
            onClick={clearFilters}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de inicio
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de fin
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="input-field"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
              className="input-field"
            >
              <option value="">Todas las categorías</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <select
              value={filters.currencyId}
              onChange={(e) => setFilters({ ...filters, currencyId: e.target.value })}
              className="input-field"
            >
              <option value="">Todas las monedas</option>
              {currencies.map(currency => (
                <option key={currency.id} value={currency.id}>
                  {currency.code} - {currency.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto mínimo
            </label>
            <input
              type="number"
              value={filters.minAmount}
              onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
              placeholder="0"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto máximo
            </label>
            <input
              type="number"
              value={filters.maxAmount}
              onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
              placeholder="Sin límite"
              className="input-field"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción contiene
            </label>
            <input
              type="text"
              value={filters.description}
              onChange={(e) => setFilters({ ...filters, description: e.target.value })}
              placeholder="Buscar en descripción..."
              className="input-field"
            />
          </div>

          {/* Recurring */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gastos recurrentes
            </label>
            <select
              value={filters.isRecurring}
              onChange={(e) => setFilters({ ...filters, isRecurring: e.target.value })}
              className="input-field"
            >
              <option value="">Todos</option>
              <option value="true">Solo recurrentes</option>
              <option value="false">Solo no recurrentes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Generate Reports */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Generar Reportes</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Excel Report */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <FiFileText className="w-5 h-5 text-green-600" />
              </div>
              <div className="ml-3">
                <h4 className="font-medium text-gray-900">Reporte Excel</h4>
                <p className="text-sm text-gray-600">Datos detallados con resumen por moneda</p>
              </div>
            </div>
            
            <ul className="text-sm text-gray-600 mb-4 space-y-1">
              <li>• Todos los gastos con filtros aplicados</li>
              <li>• Conversiones a COP y tasas de cambio</li>
              <li>• Hoja de resumen por moneda</li>
              <li>• Formato Excel (.xlsx)</li>
            </ul>
            
            <button
              onClick={generateExcelReport}
              disabled={generating}
              className="btn-primary w-full flex items-center justify-center"
            >
              {generating ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <FiDownload className="w-4 h-4 mr-2" />
                  Generar Excel
                </>
              )}
            </button>
          </div>

          {/* PDF Report */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <FiFileText className="w-5 h-5 text-red-600" />
              </div>
              <div className="ml-3">
                <h4 className="font-medium text-gray-900">Reporte PDF</h4>
                <p className="text-sm text-gray-600">Reporte visual con gráficos y resumen</p>
              </div>
            </div>
            
            <ul className="text-sm text-gray-600 mb-4 space-y-1">
              <li>• Resumen ejecutivo con estadísticas</li>
              <li>• Gráficos y visualizaciones</li>
              <li>• Análisis por categorías</li>
              <li>• Formato PDF para imprimir</li>
            </ul>
            
            <button
              onClick={generatePDFReport}
              disabled={generating}
              className="btn-secondary w-full flex items-center justify-center"
            >
              {generating ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <FiDownload className="w-4 h-4 mr-2" />
                  Generar PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* Note */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Los reportes se generan con los filtros aplicados. 
            Si no seleccionas fechas, se incluirán todos los gastos. 
            Los archivos se descargarán automáticamente una vez generados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reports;