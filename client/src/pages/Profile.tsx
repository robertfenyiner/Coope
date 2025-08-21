import React, { useState, useRef } from 'react';
import { FiUser, FiMail, FiKey, FiSave, FiEye, FiEyeOff, FiSend, FiCamera, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';
import { getProfilePictureUrl } from '../utils/config';

const Profile: React.FC = () => {
  const { user, updateUser, profilePictureVersion } = useAuth();
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    username: user?.username || '',
    email: user?.email || ''
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const profilePictureRef = useRef<HTMLInputElement>(null);

  // Load profile picture on component mount and when user changes
  React.useEffect(() => {
    console.log('[PROFILE] useEffect triggered - user:', user?.profile_picture);
    
    if (user?.profile_picture) {
      const newUrl = getProfilePictureUrl(user.profile_picture, profilePictureVersion);
      console.log('[PROFILE] Setting new profile picture URL:', newUrl);
      setProfilePicture(newUrl);
    } else {
      console.log('[PROFILE] No profile picture, setting to null');
      setProfilePicture(null);
    }
  }, [user?.profile_picture]); // Solo dependemos del filename, no de la versión

  const handleProfilePictureSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors({ profilePicture: 'Solo se permiten archivos de imagen' });
      return;
    }
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors({ profilePicture: 'La imagen debe ser menor a 5MB' });
      return;
    }
    
    uploadProfilePicture(file);
  };
  
  const uploadProfilePicture = async (file: File) => {
    setUploadingPicture(true);
    setErrors({ ...errors, profilePicture: '' });
    
    try {
      console.log('[FRONTEND] Subiendo archivo:', file.name, file.size);
      
      const formData = new FormData();
      formData.append('profilePicture', file);
      
      const response = await api.post('/files/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log('[FRONTEND] Respuesta del servidor:', response.data);
      
      // Update the user context with the new profile picture filename
      const fileName = response.data.profilePicture.fileName;
      console.log('[FRONTEND] Actualizando usuario con filename:', fileName);
      
      // Inmediatamente actualizar la URL local con timestamp para forzar recarga
      const immediateUrl = getProfilePictureUrl(fileName, Date.now());
      setProfilePicture(immediateUrl);
      
      await updateUser({ profile_picture: fileName });
      console.log('[FRONTEND] Usuario actualizado');
      
      setSuccessMessage('Foto de perfil actualizada exitosamente');
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error: any) {
      setErrors({ profilePicture: error.response?.data?.message || 'Error al subir la foto de perfil' });
    } finally {
      setUploadingPicture(false);
    }
  };
  
  const deleteProfilePicture = async () => {
    if (!window.confirm('¿Seguro que deseas eliminar tu foto de perfil?')) {
      return;
    }
    
    if (!user?.profile_picture) {
      return;
    }
    
    try {
      setUploadingPicture(true);
      
      // Find the file by the profile_picture filename and delete it
      const response = await api.get('/files/admin/all?fileType=profile&userId=' + user.id);
      const profileFile = response.data.files.find((file: any) => file.fileName === user.profile_picture);
      
      if (profileFile) {
        await api.delete(`/files/${profileFile.id}`);
      }
      
      setProfilePicture(null);
      
      // Update the user context to remove the profile picture
      await updateUser({ profile_picture: null });
      
      setSuccessMessage('Foto de perfil eliminada exitosamente');
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error: any) {
      setErrors({ profilePicture: error.response?.data?.message || 'Error al eliminar la foto de perfil' });
    } finally {
      setUploadingPicture(false);
    }
  };

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
        email: profileForm.email.trim().toLowerCase()
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

  const handleTestEmail = async () => {
    try {
      setEmailLoading(true);
      setSuccessMessage('');
      setErrors({});

      // Validate test email if provided
      if (testEmail && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(testEmail)) {
        setErrors({
          testEmail: 'Por favor ingresa un correo electrónico válido'
        });
        return;
      }

      const requestBody = testEmail ? { testEmail } : {};
      const response = await api.post('/auth/test-email', requestBody);
      
      const recipient = response.data.recipient || testEmail || user?.email;
      setSuccessMessage(`Correo de prueba enviado correctamente a ${recipient}. Revisa la bandeja de entrada.`);
      
      // Clear test email field after successful send
      if (testEmail) {
        setTestEmail('');
      }
    } catch (error: any) {
      console.error('Error al enviar el correo de prueba:', error);
      setErrors({
        email: error.response?.data?.message || 'Error al enviar el correo de prueba'
      });
    } finally {
      setEmailLoading(false);
    }
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración de perfil</h1>
        <p className="text-gray-600 dark:text-gray-400">Gestiona tu información y seguridad</p>
      </div>

      {/* Profile Picture Section */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Foto de perfil
        </h2>
        
        <div className="flex items-center space-x-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Foto de perfil"
                  className="w-full h-full object-cover"
                  onError={() => setProfilePicture(null)}
                />
              ) : (
                <FiUser className="w-12 h-12 text-gray-400" />
              )}
            </div>
            {uploadingPicture && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                <LoadingSpinner size="sm" />
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex space-x-3">
              <input
                ref={profilePictureRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePictureSelect}
                className="hidden"
              />
              <button
                onClick={() => profilePictureRef.current?.click()}
                disabled={uploadingPicture}
                className="flex items-center px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                <FiCamera className="w-4 h-4 mr-2" />
                {profilePicture ? 'Cambiar foto' : 'Subir foto'}
              </button>
              
              {profilePicture && (
                <button
                  onClick={deleteProfilePicture}
                  disabled={uploadingPicture}
                  className="flex items-center px-3 py-2 text-sm border border-red-300 dark:border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 disabled:opacity-50"
                >
                  <FiTrash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </button>
              )}
            </div>
            
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Se permiten archivos JPG, PNG, GIF hasta 5MB
            </p>
            
            {errors.profilePicture && (
              <p className="mt-1 text-sm text-red-600">{errors.profilePicture}</p>
            )}
          </div>
        </div>
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

      {/* Email Configuration */}
      <div className="bg-white shadow-sm rounded-lg border">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <FiMail className="w-5 h-5 mr-2" />
            Configuración de correo electrónico
          </h2>
          
          {errors.email && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
              {errors.email}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Prueba la configuración de correo electrónico para verificar que los recordatorios de gastos recurrentes funcionen correctamente.
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Enviar prueba a (opcional)
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => {
                      setTestEmail(e.target.value);
                      if (errors.testEmail) {
                        setErrors({ ...errors, testEmail: '' });
                      }
                    }}
                    className={`input-field ${errors.testEmail ? 'border-red-300' : ''}`}
                    placeholder={`Dejar vacío para enviar a ${user?.email || 'tu email'}`}
                  />
                  {errors.testEmail && (
                    <p className="mt-1 text-sm text-red-600">{errors.testEmail}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Si no especificas un email, se enviará a tu email de perfil actual
                  </p>
                </div>
                
                <button
                  onClick={handleTestEmail}
                  disabled={emailLoading}
                  className="btn-primary flex items-center justify-center"
                >
                  {emailLoading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Enviando...</span>
                    </>
                  ) : (
                    <>
                      <FiSend className="w-4 h-4 mr-2" />
                      Enviar correo de prueba
                    </>
                  )}
                </button>
              </div>
            </div>
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