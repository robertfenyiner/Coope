import React, { useState } from 'react';
import { FiUser, FiMail, FiKey, FiSave, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    reportEmailsEnabled: user?.reportEmailsEnabled ?? false,
    paymentCycle: user?.paymentCycle || 'monthly',
    reminderDaysBefore: user?.reminderDaysBefore ?? 3
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');

  const validateProfileForm = () => {
    const newErrors: Record<string, string> = {};

    if (!profileForm.username.trim()) {
      newErrors.username = 'El nombre de usuario es obligatorio';
    } else if (profileForm.username.trim().length < 3) {
      newErrors.username = 'El nombre de usuario debe tener al menos 3 caracteres';
    } else if (profileForm.username.trim().length > 30) {
      newErrors.username = 'El nombre de usuario debe tener menos de 30 caracteres';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(profileForm.username.trim())) {
      newErrors.username = 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos';
    }

    if (!profileForm.email.trim()) {
      newErrors.email = 'El correo electrónico es obligatorio';
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(profileForm.email.trim())) {
      newErrors.email = 'Por favor ingresa un correo electrónico válido';
    } else if (profileForm.email.length > 254) {
      newErrors.email = 'El correo electrónico es demasiado largo';
    }

    if (!['weekly', 'biweekly', 'monthly'].includes(profileForm.paymentCycle)) {
      newErrors.paymentCycle = 'Selecciona un ciclo de pago válido';
    }

    if (profileForm.reminderDaysBefore < 0) {
      newErrors.reminderDaysBefore = 'Debe ser un número positivo';
    }

    return newErrors;
  };

  const validatePasswordForm = () => {
    const newErrors: Record<string, string> = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = 'La contraseña actual es obligatoria';
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = 'La nueva contraseña es obligatoria';
    } else if (passwordForm.newPassword.length < 8) {
      newErrors.newPassword = 'La nueva contraseña debe tener al menos 8 caracteres';
    } else if (passwordForm.newPassword.length > 128) {
      newErrors.newPassword = 'La nueva contraseña es demasiado larga';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(passwordForm.newPassword)) {
      newErrors.newPassword = 'La contraseña debe contener al menos una letra mayúscula, una letra minúscula, un número y un carácter especial';
    }

    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Por favor confirma tu nueva contraseña';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    if (passwordForm.currentPassword && passwordForm.newPassword &&
        passwordForm.currentPassword === passwordForm.newPassword) {
      newErrors.newPassword = 'La nueva contraseña debe ser diferente a la actual';
    }

    return newErrors;
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const profileErrors = validateProfileForm();
    setErrors(profileErrors);

    if (Object.keys(profileErrors).length > 0) {
      return;
    }

    try {
      setLoading(true);
      setSuccessMessage('');

      const response = await api.put('/auth/profile', {
        username: profileForm.username.trim(),
        email: profileForm.email.trim().toLowerCase(),
        reportEmailsEnabled: profileForm.reportEmailsEnabled,
        paymentCycle: profileForm.paymentCycle,
        reminderDaysBefore: profileForm.reminderDaysBefore
      });

      setSuccessMessage('Perfil actualizado correctamente');
      
      // Update local user data (this would typically be handled by the auth context)
      // You might want to add an updateUser method to your AuthContext
      
    } catch (error: any) {
      console.error('Error al actualizar el perfil:', error);
      setErrors({
        profile: error.response?.data?.message || 'Error al actualizar el perfil'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const passwordErrors = validatePasswordForm();
    setErrors(passwordErrors);

    if (Object.keys(passwordErrors).length > 0) {
      return;
    }

    try {
      setLoading(true);
      setSuccessMessage('');

      await api.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });

      setSuccessMessage('Contraseña cambiada correctamente');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
    } catch (error: any) {
      console.error('Error al cambiar la contraseña:', error);
      setErrors({
        password: error.response?.data?.message || 'Error al cambiar la contraseña'
      });
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setErrors({});
    setSuccessMessage('');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
  <h1 className="text-2xl font-bold text-gray-900">Configuración de perfil</h1>
  <p className="text-gray-600">Gestiona tu información y seguridad</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <div className="bg-white shadow-sm rounded-lg border">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <FiUser className="w-5 h-5 mr-2" />
              Información de perfil
            </h2>

            {errors.profile && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                {errors.profile}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usuario *
                </label>
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => {
                    setProfileForm(prev => ({ ...prev, username: e.target.value }));
                    clearMessages();
                  }}
                  className={`input-field ${errors.username ? 'border-red-300' : ''}`}
                  placeholder="Ingresa tu usuario"
                  maxLength={30}
                />
                {errors.username && (
                  <p className="mt-1 text-sm text-red-600">{errors.username}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => {
                    setProfileForm(prev => ({ ...prev, email: e.target.value }));
                    clearMessages();
                  }}
                  className={`input-field ${errors.email ? 'border-red-300' : ''}`}
                  placeholder="Ingresa tu correo electrónico"
                  maxLength={254}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={profileForm.reportEmailsEnabled}
                  onChange={(e) => {
                    setProfileForm(prev => ({ ...prev, reportEmailsEnabled: e.target.checked }));
                    clearMessages();
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Recibir reportes por correo
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ciclo de pago
                </label>
                <select
                  value={profileForm.paymentCycle}
                  onChange={(e) => {
                    setProfileForm(prev => ({ ...prev, paymentCycle: e.target.value }));
                    clearMessages();
                  }}
                  className="input-field"
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
                {errors.paymentCycle && (
                  <p className="mt-1 text-sm text-red-600">{errors.paymentCycle}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recordatorio (días antes)
                </label>
                <input
                  type="number"
                  min={0}
                  value={profileForm.reminderDaysBefore}
                  onChange={(e) => {
                    setProfileForm(prev => ({ ...prev, reminderDaysBefore: parseInt(e.target.value, 10) || 0 }));
                    clearMessages();
                  }}
                  className={`input-field ${errors.reminderDaysBefore ? 'border-red-300' : ''}`}
                />
                {errors.reminderDaysBefore && (
                  <p className="mt-1 text-sm text-red-600">{errors.reminderDaysBefore}</p>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Actualizando...</span>
                  </>
                ) : (
                  <>
                    <FiSave className="w-4 h-4 mr-2" />
                    Actualizar perfil
                  </>
                )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Password Change */}
        <div className="bg-white shadow-sm rounded-lg border">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <FiKey className="w-5 h-5 mr-2" />
              Cambiar contraseña
            </h2>

            {errors.password && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                {errors.password}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña actual *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => {
                      setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }));
                      clearMessages();
                    }}
                    className={`input-field pr-10 ${errors.currentPassword ? 'border-red-300' : ''}`}
                    placeholder="Ingresa la contraseña actual"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <FiEyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <FiEye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.currentPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.currentPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nueva contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => {
                      setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }));
                      clearMessages();
                    }}
                    className={`input-field pr-10 ${errors.newPassword ? 'border-red-300' : ''}`}
                    placeholder="Ingresa la nueva contraseña"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <FiEyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <FiEye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.newPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.newPassword}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar nueva contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => {
                      setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                      clearMessages();
                    }}
                    className={`input-field pr-10 ${errors.confirmPassword ? 'border-red-300' : ''}`}
                    placeholder="Confirma la nueva contraseña"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <FiEyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <FiEye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Cambiando...</span>
                  </>
                ) : (
                  <>
                    <FiKey className="w-4 h-4 mr-2" />
                    Cambiar contraseña
                  </>
                )}
                </button>
              </div>

              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
                <p className="font-medium mb-1">Requisitos de la contraseña:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Al menos 8 caracteres</li>
                  <li>Contiene letras mayúsculas y minúsculas</li>
                  <li>Contiene al menos un número</li>
                  <li>Contiene al menos un carácter especial</li>
                </ul>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className="bg-white shadow-sm rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Información de la cuenta</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Cuenta creada</label>
              <p className="mt-1 text-sm text-gray-900">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Última actualización</label>
              <p className="mt-1 text-sm text-gray-900">
                {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;