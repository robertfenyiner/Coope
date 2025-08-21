import React, { useState, useEffect } from 'react';
import { FiFile, FiDownload } from 'react-icons/fi';
import api from '../utils/api';

interface AuthenticatedPDFProps {
  src: string;
  className?: string;
  title?: string;
}

const AuthenticatedPDF: React.FC<AuthenticatedPDFProps> = ({
  src,
  className = '',
  title = 'PDF Document'
}) => {
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Hacer la petición con autenticación
        const response = await api.get(src, {
          responseType: 'blob'
        });
        
        // Crear URL del blob para el PDF
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(blob);
        setPdfSrc(pdfUrl);
        
      } catch (err) {
        console.error('Error loading authenticated PDF:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (src) {
      loadPDF();
    }

    // Cleanup: liberar URL del blob cuando el componente se desmonte
    return () => {
      if (pdfSrc) {
        URL.revokeObjectURL(pdfSrc);
      }
    };
  }, [src]);

  // Cleanup cuando cambie pdfSrc
  useEffect(() => {
    return () => {
      if (pdfSrc) {
        URL.revokeObjectURL(pdfSrc);
      }
    };
  }, [pdfSrc]);

  if (loading) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-600 flex items-center justify-center`}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Cargando PDF...</p>
        </div>
      </div>
    );
  }

  if (error || !pdfSrc) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-600 flex items-center justify-center`}>
        <div className="text-center">
          <FiFile className="w-16 h-16 text-gray-500 dark:text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Error al cargar PDF</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={pdfSrc}
      className={className}
      title={title}
      onError={() => setError(true)}
    />
  );
};

export default AuthenticatedPDF;