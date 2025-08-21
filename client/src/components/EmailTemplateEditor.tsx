import React, { useState, useEffect } from 'react';
import { FiSave, FiEye, FiPlus, FiTrash2, FiMail, FiEdit } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import api from '../utils/api';

interface EmailTemplate {
  id: number;
  template_name: string;
  subject: string;
  html_content: string;
  text_content: string;
  created_at: string;
  updated_at: string;
}

interface PreviewData {
  template: EmailTemplate;
  sampleData: Record<string, string>;
}

const EmailTemplateEditor: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    template_name: '',
    subject: '',
    html_content: '',
    text_content: ''
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/email-templates');
      setTemplates(response.data.templates);
      if (response.data.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(response.data.templates[0]);
        setFormData(response.data.templates[0]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      alert('Error al cargar las plantillas');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    if (isEditing || isCreating) {
      if (!window.confirm('¿Deseas descartar los cambios no guardados?')) {
        return;
      }
    }
    setSelectedTemplate(template);
    setFormData(template);
    setIsEditing(false);
    setIsCreating(false);
    setShowPreview(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      template_name: '',
      subject: '',
      html_content: '',
      text_content: ''
    });
    setShowPreview(false);
  };

  const handleCancel = () => {
    if (selectedTemplate) {
      setFormData(selectedTemplate);
    } else {
      setFormData({
        template_name: '',
        subject: '',
        html_content: '',
        text_content: ''
      });
    }
    setIsEditing(false);
    setIsCreating(false);
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!formData.template_name || !formData.subject || !formData.html_content || !formData.text_content) {
      alert('Todos los campos son obligatorios');
      return;
    }

    try {
      setSaving(true);
      
      if (isCreating) {
        const response = await api.post('/admin/email-templates', formData);
        alert('Plantilla creada correctamente');
        await loadTemplates();
        // Find and select the newly created template
        const newTemplate = templates.find(t => t.template_name === formData.template_name);
        if (newTemplate) {
          setSelectedTemplate(newTemplate);
        }
      } else if (selectedTemplate) {
        await api.put(`/admin/email-templates/${selectedTemplate.template_name}`, {
          subject: formData.subject,
          html_content: formData.html_content,
          text_content: formData.text_content
        });
        alert('Plantilla actualizada correctamente');
        await loadTemplates();
        // Update selected template
        const updatedTemplate = templates.find(t => t.template_name === selectedTemplate.template_name);
        if (updatedTemplate) {
          setSelectedTemplate(updatedTemplate);
          setFormData(updatedTemplate);
        }
      }
      
      setIsEditing(false);
      setIsCreating(false);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al guardar la plantilla');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateName: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la plantilla "${templateName}"?`)) {
      return;
    }

    try {
      await api.delete(`/admin/email-templates/${templateName}`);
      alert('Plantilla eliminada correctamente');
      await loadTemplates();
      
      // If deleted template was selected, select the first one
      if (selectedTemplate?.template_name === templateName) {
        if (templates.length > 1) {
          const firstTemplate = templates.find(t => t.template_name !== templateName);
          if (firstTemplate) {
            setSelectedTemplate(firstTemplate);
            setFormData(firstTemplate);
          }
        } else {
          setSelectedTemplate(null);
          setFormData({
            template_name: '',
            subject: '',
            html_content: '',
            text_content: ''
          });
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al eliminar la plantilla');
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await api.post(`/admin/email-templates/${selectedTemplate.template_name}/preview`, {
        sampleData: {
          user_name: 'Usuario de Prueba',
          expense_description: 'Compra de ejemplo',
          expense_amount: '$50.000 COP',
          due_date: new Date().toLocaleDateString('es-ES'),
          days_advance: '2'
        }
      });
      setPreview(response.data);
      setShowPreview(true);
    } catch (error) {
      console.error('Error previewing template:', error);
      alert('Error al previsualizar la plantilla');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Editor de Plantillas de Email</h3>
        <button
          onClick={handleCreate}
          className="btn-primary flex items-center"
          disabled={isEditing || isCreating}
        >
          <FiPlus className="w-4 h-4 mr-2" />
          Nueva Plantilla
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h4 className="font-medium text-gray-900">Plantillas</h4>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                    selectedTemplate?.id === template.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">{template.template_name}</h5>
                      <p className="text-sm text-gray-600 truncate">{template.subject}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Actualizado: {new Date(template.updated_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    {!['expense_reminder', 'test_email'].includes(template.template_name) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(template.template_name);
                        }}
                        className="text-red-600 hover:text-red-900 ml-2"
                        title="Eliminar plantilla"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  No hay plantillas disponibles
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Template Editor */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h4 className="font-medium text-gray-900">
                {isCreating ? 'Nueva Plantilla' : isEditing ? 'Editando Plantilla' : 'Vista de Plantilla'}
              </h4>
              <div className="flex space-x-2">
                {selectedTemplate && !isEditing && !isCreating && (
                  <>
                    <button
                      onClick={handlePreview}
                      className="text-blue-600 hover:text-blue-900 flex items-center"
                    >
                      <FiEye className="w-4 h-4 mr-1" />
                      Previsualizar
                    </button>
                    <button
                      onClick={handleEdit}
                      className="text-green-600 hover:text-green-900 flex items-center"
                    >
                      <FiEdit className="w-4 h-4 mr-1" />
                      Editar
                    </button>
                  </>
                )}
                {(isEditing || isCreating) && (
                  <>
                    <button
                      onClick={handleCancel}
                      className="text-gray-600 hover:text-gray-900 px-3 py-1 border rounded"
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn-primary flex items-center"
                    >
                      {saving ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <FiSave className="w-4 h-4 mr-1" />
                      )}
                      Guardar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {(selectedTemplate || isCreating) ? (
                <>
                  {/* Template Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la Plantilla
                    </label>
                    <input
                      type="text"
                      value={formData.template_name}
                      onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                      disabled={!isCreating}
                      className="input-field"
                      placeholder="Ej: welcome_email"
                    />
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asunto del Email
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      disabled={!isEditing && !isCreating}
                      className="input-field"
                      placeholder="Asunto del email..."
                    />
                  </div>

                  {/* HTML Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contenido HTML
                    </label>
                    <textarea
                      value={formData.html_content}
                      onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                      disabled={!isEditing && !isCreating}
                      rows={8}
                      className="input-field font-mono text-sm"
                      placeholder="Contenido HTML del email..."
                    />
                  </div>

                  {/* Text Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contenido de Texto Plano
                    </label>
                    <textarea
                      value={formData.text_content}
                      onChange={(e) => setFormData({ ...formData, text_content: e.target.value })}
                      disabled={!isEditing && !isCreating}
                      rows={6}
                      className="input-field"
                      placeholder="Versión en texto plano del email..."
                    />
                  </div>

                  {/* Variables Help */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h5 className="font-medium text-blue-900 mb-2">Variables Disponibles</h5>
                    <div className="text-sm text-blue-800 grid grid-cols-2 gap-2">
                      <span>• {'{user_name}'} - Nombre del usuario</span>
                      <span>• {'{expense_description}'} - Descripción del gasto</span>
                      <span>• {'{expense_amount}'} - Monto del gasto</span>
                      <span>• {'{due_date}'} - Fecha de vencimiento</span>
                      <span>• {'{days_advance}'} - Días de anticipación</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Selecciona una plantilla para ver su contenido o crea una nueva
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h4 className="font-medium text-gray-900 flex items-center">
                <FiMail className="w-5 h-5 mr-2" />
                Previsualización: {preview.template.template_name}
              </h4>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asunto:</label>
                  <div className="p-2 bg-gray-50 rounded border font-medium">
                    {preview.template.subject}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenido HTML:</label>
                  <div 
                    className="p-4 bg-white border rounded min-h-[200px]"
                    dangerouslySetInnerHTML={{ __html: preview.template.html_content }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenido de Texto:</label>
                  <div className="p-4 bg-gray-50 border rounded whitespace-pre-wrap font-mono text-sm">
                    {preview.template.text_content}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailTemplateEditor;