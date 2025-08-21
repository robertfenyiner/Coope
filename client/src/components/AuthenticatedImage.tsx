import React, { useState, useEffect } from 'react';
import { FiImage, FiAlertCircle } from 'react-icons/fi';
import api from '../utils/api';

interface AuthenticatedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon?: React.ComponentType<{ className?: string }>;
}

const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon: FallbackIcon = FiImage
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Hacer la petición con autenticación
        const response = await api.get(src, {
          responseType: 'blob'
        });
        
        // Crear URL del blob
        const blob = new Blob([response.data]);
        const imageUrl = URL.createObjectURL(blob);
        setImageSrc(imageUrl);
        
      } catch (err) {
        console.error('Error loading authenticated image:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (src) {
      loadImage();
    }

    // Cleanup: liberar URL del blob cuando el componente se desmonte
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src]);

  // Cleanup cuando cambie imageSrc
  useEffect(() => {
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  if (loading) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-600 animate-pulse flex items-center justify-center`}>
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-600 flex items-center justify-center`}>
        <FallbackIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
};

export default AuthenticatedImage;