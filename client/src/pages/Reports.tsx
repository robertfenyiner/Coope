import React, { useState, useEffect } from 'react';
import { FiDownload, FiFileText } from 'react-icons/fi';
import api from '../utils/api';

interface Category {
  id: number;
  name: string;
}

interface Summary {
  totalExpenses: number;
  totalAmount: number;
  period: string;
  generatedAt: string;
}

const Reports: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await api.get('/categories');
        setCategories(res.data);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };
    loadCategories();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setDownloadUrl('');
    setSummary(null);
    try {
      const payload: any = {
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(categoryId && { categoryId: parseInt(categoryId) }),
        ...(search && { search }),
      };
      const res = await api.post('/reports/generate', payload);
      setDownloadUrl(res.data.downloadUrl);
      setSummary(res.data.summary);
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '1000',
        ...(categoryId && { category: categoryId }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(search && { search }),
      });
      const res = await api.get(`/expenses?${params.toString()}`);
      const rows = res.data.expenses;
      const header = ['Date', 'Description', 'Category', 'Amount', 'Currency'];
      const csv = [
        header.join(','),
        ...rows.map((r: any) => [
          r.date,
          r.description,
          r.category_name,
          r.amount,
          r.currency_code,
        ].map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'expenses.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Reportes</h1>
      <form onSubmit={handleGenerate} className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input-field"
            >
              <option value="">Todas</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar descripción</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              placeholder="Ej: supermercado"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Generando...' : 'Generar reporte'}
        </button>
      </form>

      {downloadUrl && (
        <div className="space-y-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center"
          >
            <FiDownload className="mr-2" /> Descargar PDF
          </a>
          <button
            onClick={handleExportCSV}
            className="btn-secondary inline-flex items-center"
          >
            <FiFileText className="mr-2" /> Exportar CSV
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-6 card">
          <h2 className="text-lg font-semibold mb-2">Resumen</h2>
          <p>Total de gastos: {summary.totalExpenses}</p>
          <p>Monto total: {summary.totalAmount}</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
