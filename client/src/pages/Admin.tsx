import React, { useState, useEffect, useRef } from 'react';
import { FiUsers, FiSettings, FiMail, FiDownload, FiTrash2, FiDatabase, FiPlus, FiEdit, FiShield, FiUpload, FiFolder, FiFile, FiImage, FiUser } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmailTemplateEditor from '../components/EmailTemplateEditor';
import AuthenticatedImage from '../components/AuthenticatedImage';
import api from '../utils/api';
import { getFileUrl, getProfilePictureUrl } from '../utils/config';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  expense_count: number;
  total_spent_cop: number;
  created_at: string;
}

interface SystemStats {
  totalUsers: number;
  totalExpenses: number;
  totalAmountCop: number;
  totalCategories: number;
  adminUsers: number;
}

interface Backup {
  fileName: string;
  size: number;
  created: string;
  downloadUrl: string;
}

interface FileAttachment {
  id: number;
  originalName: string;
  fileName: string;
  fileType: string;
  size: number;
  mimeType: string;
  createdAt: string;
  downloadUrl: string;
  isImage: boolean;
  user: {
    id: number;
    username: string;
    email: string;
  };
  expense?: {
    id: number;
    description: string;
    amount: number;
  };
}

interface FileStats {
  totalStats: {
    total_files: number;
    total_size: number;
  };
  byType: Array<{
    file_type: string;
    file_count: number;
    total_size: number;
    avg_size: number;
  }>;
}

const Admin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    password: '',
    isAdmin: false
  });
  const [userFormErrors, setUserFormErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File management state
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const [fileFilter, setFileFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [filePage, setFilePage] = useState(1);
  const [fileTotalPages, setFileTotalPages] = useState(1);

  useEffect(() => {
    if (user?.is_admin) {
      loadDashboardData();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'backups') {
      loadBackups();
    } else if (activeTab === 'files') {
      loadFiles();
      loadFileStats();
    }
  }, [activeTab, currentPage, userSearch, filePage, fileFilter, userFilter]);

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(userSearch && { search: userSearch })
      });
      
      const response = await api.get(`/admin/users?${params}`);
      setUsers(response.data.users);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/backup/list');
      setBackups(response.data.backups);
    } catch (error) {
      console.error('Error loading backups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setUserFormData({
      username: '',
      email: '',
      password: '',
      isAdmin: false
    });
    setUserFormErrors({});
    setShowUserModal(true);
  };

  const handleEditUser = (userData: User) => {
    setEditingUser(userData);
    setUserFormData({
      username: userData.username,
      email: userData.email,
      password: '',
      isAdmin: userData.is_admin
    });
    setUserFormErrors({});
    setShowUserModal(true);
  };

  const validateUserForm = () => {
    const errors: Record<string, string> = {};

    if (!userFormData.username.trim()) {
      errors.username = 'El nombre de usuario es obligatorio';
    } else if (userFormData.username.length < 3) {
      errors.username = 'El nombre de usuario debe tener al menos 3 caracteres';
    }

    if (!userFormData.email.trim()) {
      errors.email = 'El email es obligatorio';
    } else if (!/\S+@\S+\.\S+/.test(userFormData.email)) {
      errors.email = 'El email no es válido';
    }

    if (!editingUser && !userFormData.password) {
      errors.password = 'La contraseña es obligatoria';
    } else if (userFormData.password && userFormData.password.length < 6) {
      errors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    setUserFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateUserForm()) {
      return;
    }

    try {
      const submitData = {
        username: userFormData.username.trim(),
        email: userFormData.email.trim(),
        isAdmin: userFormData.isAdmin,
        ...(userFormData.password && { password: userFormData.password })
      };

      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, submitData);
      } else {
        await api.post('/admin/users', submitData);
      }

      setShowUserModal(false);
      loadUsers();
      loadDashboardData(); // Refresh stats
    } catch (error: any) {
      setUserFormErrors({
        submit: error.response?.data?.message || 'Error al guardar el usuario'
      });
    }
  };

  const toggleUserAdmin = async (userId: number, currentAdminStatus: boolean) => {
    if (!window.confirm(`¿Estás seguro de que deseas ${currentAdminStatus ? 'quitar' : 'otorgar'} permisos de administrador?`)) {
      return;
    }

    try {
      await api.patch(`/admin/users/${userId}/admin`, {
        isAdmin: !currentAdminStatus
      });
      loadUsers();
      loadDashboardData();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al actualizar permisos');
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
      loadDashboardData(); // Refresh stats
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al eliminar el usuario');
    }
  };

  const createBackup = async () => {
    try {
      setLoading(true);
      const response = await api.post('/backup/create');
      alert(`Backup creado exitosamente: ${response.data.fileName}`);
      loadBackups();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al crear el backup');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = (backup: Backup) => {
    if (window.confirm(`¿Estás seguro de que deseas restaurar el backup "${backup.fileName}"? Esto sobrescribirá todos los datos actuales excepto el usuario administrador.`)) {
      restoreFromBackup(backup.fileName);
    }
  };

  const restoreFromBackup = async (fileName: string) => {
    try {
      setLoading(true);
      const response = await api.post('/backup/restore', { 
        fileName, 
        clearExistingData: true 
      });
      alert(`Backup restaurado exitosamente. Datos importados: ${JSON.stringify(response.data.results, null, 2)}`);
      // Reload current data
      if (activeTab === 'users') {
        loadUsers();
      } else if (activeTab === 'dashboard') {
        loadDashboardData();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al restaurar el backup');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert('Por favor selecciona un archivo JSON válido');
      return;
    }

    try {
      setLoading(true);
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);
      
      // Validate backup structure
      if (!backupData.metadata || !backupData.metadata.version) {
        alert('Formato de backup inválido');
        return;
      }

      if (window.confirm(`¿Deseas restaurar el backup "${file.name}"? Esto sobrescribirá todos los datos actuales excepto el usuario administrador.`)) {
        // For file upload restore, we need to save the file first
        // Since we can't directly upload files in this implementation,
        // we'll use the restore API with the parsed data
        const response = await api.post('/backup/restore', { 
          backupData, 
          clearExistingData: true 
        });
        alert(`Backup restaurado exitosamente desde archivo. Datos importados: ${JSON.stringify(response.data.results, null, 2)}`);
        
        // Reload current data
        if (activeTab === 'users') {
          loadUsers();
        } else if (activeTab === 'dashboard') {
          loadDashboardData();
        }
      }
    } catch (error) {
      console.error('Error processing backup file:', error);
      alert('Error al procesar el archivo de backup. Verifica que sea un archivo JSON válido.');
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadBackup = async (backup: Backup) => {
    try {
      const response = await api.get(backup.downloadUrl, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading backup:', error);
      alert('Error al descargar el backup');
    }
  };

  const deleteBackup = async (fileName: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el backup "${fileName}"?`)) {
      return;
    }

    try {
      await api.delete(`/backup/${fileName}`);
      loadBackups();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al eliminar el backup');
    }
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: filePage.toString(),
        limit: '20',
        ...(fileFilter && { fileType: fileFilter }),
        ...(userFilter && { userId: userFilter })
      });
      
      const response = await api.get(`/files/admin/all?${params}`);
      setFiles(response.data.files);
      setFileTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFileStats = async () => {
    try {
      const response = await api.get('/files/admin/stats');
      setFileStats(response.data);
    } catch (error) {
      console.error('Error loading file stats:', error);
    }
  };

  const downloadFile = async (file: FileAttachment) => {
    try {
      // Para descarga, siempre usar el endpoint estándar que maneja autenticación
      const downloadUrl = file.downloadUrl;
      
      console.log('[ADMIN] Downloading file:', {
        fileType: file.fileType,
        fileName: file.fileName,
        downloadUrl: downloadUrl,
        fileId: file.id
      });
      
      const response = await api.get(downloadUrl, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error al descargar el archivo: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este archivo? Esta acción no se puede deshacer.')) {
      return;
    }
    
    try {
      await api.delete(`/files/${fileId}`);
      loadFiles();
      loadFileStats();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al eliminar el archivo');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!user?.is_admin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h1>
          <p className="text-gray-600">No tienes permisos de administrador para acceder a esta sección.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <p className="text-gray-600">Gestiona usuarios y configuraciones del sistema</p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'dashboard'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FiSettings className="w-4 h-4 inline mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FiUsers className="w-4 h-4 inline mr-2" />
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FiMail className="w-4 h-4 inline mr-2" />
            Plantillas Email
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'backups'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FiDatabase className="w-4 h-4 inline mr-2" />
            Backups
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'files'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FiFolder className="w-4 h-4 inline mr-2" />
            Archivos
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* System Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                  <FiUsers className="w-6 h-6" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-semibold text-gray-900">{stats?.totalUsers || 0}</p>
                  <p className="text-gray-600">Usuarios</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <FiSettings className="w-6 h-6" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-semibold text-gray-900">{stats?.totalExpenses || 0}</p>
                  <p className="text-gray-600">Gastos</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                  <FiDatabase className="w-6 h-6" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-semibold text-gray-900">{stats?.totalCategories || 0}</p>
                  <p className="text-gray-600">Categorías</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                  <FiMail className="w-6 h-6" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-semibold text-gray-900">{stats?.adminUsers || 0}</p>
                  <p className="text-gray-600">Admins</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
                  <FiDownload className="w-6 h-6" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-semibold text-gray-900">
                    ${stats?.totalAmountCop?.toLocaleString('es-CO') || 0}
                  </p>
                  <p className="text-gray-600">Total COP</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search and Actions */}
          <div className="flex justify-between items-center">
            <input
              type="text"
              placeholder="Buscar usuarios..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="input-field max-w-md"
            />
            <button
              onClick={handleCreateUser}
              className="btn-primary flex items-center"
            >
              <FiPlus className="w-4 h-4 mr-2" />
              Crear Usuario
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gastos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total COP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : users.map((userData) => (
                  <tr key={userData.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{userData.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {userData.expense_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${userData.total_spent_cop?.toLocaleString('es-CO') || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {userData.is_admin ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Usuario
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEditUser(userData)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar usuario"
                        >
                          <FiEdit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleUserAdmin(userData.id, userData.is_admin)}
                          className={userData.is_admin ? "text-orange-600 hover:text-orange-900" : "text-green-600 hover:text-green-900"}
                          title={userData.is_admin ? "Quitar permisos de admin" : "Hacer admin"}
                        >
                          <FiShield className="w-4 h-4" />
                        </button>
                        {!userData.is_admin && (
                          <button
                            onClick={() => deleteUser(userData.id, userData.username)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar usuario"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Página {currentPage} de {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <EmailTemplateEditor />
      )}

      {activeTab === 'backups' && (
        <div className="space-y-4">
          {/* Backup Actions */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Gestión de Backups</h3>
            <div className="flex space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="btn-secondary flex items-center"
                title="Restaurar desde archivo"
              >
                <FiUpload className="w-4 h-4 mr-2" />
                Restaurar
              </button>
              <button
                onClick={createBackup}
                disabled={loading}
                className="btn-primary flex items-center"
              >
                {loading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <FiDatabase className="w-4 h-4 mr-2" />
                )}
                Crear Backup
              </button>
            </div>
          </div>

          {/* Backups List */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archivo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tamaño
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Creado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center">
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : backups.map((backup) => (
                  <tr key={backup.fileName}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {backup.fileName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(backup.size / 1024).toFixed(2)} KB
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(backup.created).toLocaleString('es-ES')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => downloadBackup(backup)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Descargar backup"
                        >
                          <FiDownload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRestoreBackup(backup)}
                          className="text-green-600 hover:text-green-900"
                          title="Restaurar backup"
                        >
                          <FiUpload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteBackup(backup.fileName)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar backup"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && backups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      No hay backups disponibles. Crea uno para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Files Management Tab */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          {/* File Stats */}
          {fileStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                    <FiFile className="w-6 h-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{fileStats.totalStats.total_files}</p>
                    <p className="text-gray-600 dark:text-gray-400">Total archivos</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                    <FiDatabase className="w-6 h-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{formatFileSize(fileStats.totalStats.total_size)}</p>
                    <p className="text-gray-600 dark:text-gray-400">Espacio usado</p>
                  </div>
                </div>
              </div>
              
              {fileStats.byType.map((type) => (
                <div key={type.file_type} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center">
                    <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                      {type.file_type === 'profile' ? <FiUser className="w-6 h-6" /> : <FiFile className="w-6 h-6" />}
                    </div>
                    <div className="ml-4">
                      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{type.file_count}</p>
                      <p className="text-gray-600 dark:text-gray-400">{type.file_type === 'profile' ? 'Fotos perfil' : 'Archivos gastos'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filtrar por tipo
                </label>
                <select
                  value={fileFilter}
                  onChange={(e) => {
                    setFileFilter(e.target.value);
                    setFilePage(1);
                  }}
                  className="input-field"
                >
                  <option value="">Todos los tipos</option>
                  <option value="profile">Fotos de perfil</option>
                  <option value="expense">Archivos de gastos</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filtrar por usuario (ID)
                </label>
                <input
                  type="number"
                  value={userFilter}
                  onChange={(e) => {
                    setUserFilter(e.target.value);
                    setFilePage(1);
                  }}
                  placeholder="ID del usuario"
                  className="input-field"
                />
              </div>
            </div>
          </div>
          
          {/* Files List */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Archivos del sistema</h3>
            </div>
            
            {loading ? (
              <div className="text-center py-12">
                <LoadingSpinner />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <FiFile className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No se encontraron archivos</h3>
                <p className="mt-2 text-gray-500 dark:text-gray-400">No hay archivos que coincidan con los filtros seleccionados.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Archivo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Tamaño
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {files.map((file) => (
                        <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 w-10 h-10">
                                {file.isImage ? (
                                  file.fileType === 'profile' ? (
                                    <img
                                      src={getProfilePictureUrl(file.fileName)}
                                      alt={file.originalName}
                                      className="w-10 h-10 object-cover rounded"
                                    />
                                  ) : (
                                    <AuthenticatedImage
                                      src={file.downloadUrl}
                                      alt={file.originalName}
                                      className="w-10 h-10 object-cover rounded"
                                      fallbackIcon={FiImage}
                                    />
                                  )
                                ) : (
                                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                                    <FiFile className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {file.originalName}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {file.fileName}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              file.fileType === 'profile' 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' 
                                : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            }`}>
                              {file.fileType === 'profile' ? 'Perfil' : 'Gasto'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-gray-100">{file.user.username}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{file.user.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {formatFileSize(file.size)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {new Date(file.createdAt).toLocaleDateString('es-ES')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => downloadFile(file)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Descargar archivo"
                              >
                                <FiDownload className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteFile(file.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                title="Eliminar archivo"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {fileTotalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        Página {filePage} de {fileTotalPages}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setFilePage(prev => Math.max(1, prev - 1))}
                          disabled={filePage === 1}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Anterior
                        </button>
                        <button
                          onClick={() => setFilePage(prev => Math.min(fileTotalPages, prev + 1))}
                          disabled={filePage === fileTotalPages}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">
                {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
              </h3>

              {userFormErrors.submit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {userFormErrors.submit}
                </div>
              )}

              <form onSubmit={handleUserSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de usuario *
                  </label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
                    className={`input-field ${userFormErrors.username ? 'border-red-300' : ''}`}
                    placeholder="Nombre de usuario"
                  />
                  {userFormErrors.username && (
                    <p className="mt-1 text-sm text-red-600">{userFormErrors.username}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                    className={`input-field ${userFormErrors.email ? 'border-red-300' : ''}`}
                    placeholder="email@ejemplo.com"
                  />
                  {userFormErrors.email && (
                    <p className="mt-1 text-sm text-red-600">{userFormErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña {editingUser ? '(dejar vacío para no cambiar)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
                    className={`input-field ${userFormErrors.password ? 'border-red-300' : ''}`}
                    placeholder="Contraseña"
                  />
                  {userFormErrors.password && (
                    <p className="mt-1 text-sm text-red-600">{userFormErrors.password}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={userFormData.isAdmin}
                      onChange={(e) => setUserFormData(prev => ({ ...prev, isAdmin: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Permisos de administrador</span>
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserModal(false);
                      setEditingUser(null);
                      setUserFormErrors({});
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    {editingUser ? 'Actualizar' : 'Crear'} Usuario
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

export default Admin;