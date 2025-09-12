import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { DISEASE_CATEGORIES } from '../../../constants';

interface CreateDiseaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiseaseAdded: () => void;
}

const CreateDiseaseModal: React.FC<CreateDiseaseModalProps> = ({ isOpen, onClose, onDiseaseAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    nameEn: '',
    category: '',
    icd10Code: '',
    description: '',
    symptoms: [''],
    riskFactors: ['']
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleArrayInputChange = (index: number, field: 'symptoms' | 'riskFactors', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };

  const addArrayItem = (field: 'symptoms' | 'riskFactors') => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };

  const removeArrayItem = (field: 'symptoms' | 'riskFactors', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Hastalık adı gereklidir';
    }

    if (!formData.nameEn.trim()) {
      newErrors.nameEn = 'İngilizce hastalık adı gereklidir';
    }

    if (!formData.category) {
      newErrors.category = 'Kategori seçimi gereklidir';
    }

    if (!formData.icd10Code.trim()) {
      newErrors.icd10Code = 'ICD-10 kodu gereklidir';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Hastalık açıklaması gereklidir';
    }

    if (formData.symptoms.filter(s => s.trim()).length === 0) {
      newErrors.symptoms = 'En az bir belirti girilmelidir';
    }

    if (formData.riskFactors.filter(r => r.trim()).length === 0) {
      newErrors.riskFactors = 'En az bir risk faktörü girilmelidir';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      const diseaseData = {
        ...formData,
        symptoms: formData.symptoms.filter(s => s.trim()),
        riskFactors: formData.riskFactors.filter(r => r.trim()),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'diseases'), diseaseData);
      
      onDiseaseAdded();
      handleClose();
    } catch (error) {
      console.error('Error creating disease:', error);
      setErrors({ submit: 'Hastalık oluşturulurken bir hata oluştu' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      nameEn: '',
      category: '',
      icd10Code: '',
      description: '',
      symptoms: [''],
      riskFactors: ['']
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Yeni Hastalık Ekle</h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <span className="text-gray-600 text-xl">✕</span>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Hastalık Adı *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: Egzama"
              />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                İngilizce Ad *
              </label>
              <input
                type="text"
                name="nameEn"
                value={formData.nameEn}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: Eczema"
              />
              {errors.nameEn && <p className="text-red-600 text-sm mt-1">{errors.nameEn}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Kategori *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Kategori Seçin</option>
                {DISEASE_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {errors.category && <p className="text-red-600 text-sm mt-1">{errors.category}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                ICD-10 Kodu *
              </label>
              <input
                type="text"
                name="icd10Code"
                value={formData.icd10Code}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: L30"
              />
              {errors.icd10Code && <p className="text-red-600 text-sm mt-1">{errors.icd10Code}</p>}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Açıklama *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Hastalık hakkında detaylı açıklama..."
            />
            {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
          </div>

          {/* Symptoms */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Belirtiler *
            </label>
            <div className="space-y-2">
              {formData.symptoms.map((symptom, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={symptom}
                    onChange={(e) => handleArrayInputChange(index, 'symptoms', e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Belirti ${index + 1}`}
                  />
                  {formData.symptoms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('symptoms', index)}
                      className="px-3 py-3 bg-red-100 hover:bg-red-200 border border-red-300 rounded-xl text-red-700 hover:text-red-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('symptoms')}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 hover:text-blue-800 transition-all duration-200"
              >
                + Belirti Ekle
              </button>
            </div>
            {errors.symptoms && <p className="text-red-600 text-sm mt-1">{errors.symptoms}</p>}
          </div>

          {/* Risk Factors */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Risk Faktörleri *
            </label>
            <div className="space-y-2">
              {formData.riskFactors.map((factor, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={factor}
                    onChange={(e) => handleArrayInputChange(index, 'riskFactors', e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Risk faktörü ${index + 1}`}
                  />
                  {formData.riskFactors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('riskFactors', index)}
                      className="px-3 py-3 bg-red-100 hover:bg-red-200 border border-red-300 rounded-xl text-red-700 hover:text-red-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('riskFactors')}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 hover:text-blue-800 transition-all duration-200"
              >
                + Risk Faktörü Ekle
              </button>
            </div>
            {errors.riskFactors && <p className="text-red-600 text-sm mt-1">{errors.riskFactors}</p>}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-600 text-sm">{errors.submit}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-800 transition-all duration-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 border border-green-600 rounded-xl text-white hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ekleniyor...' : 'Hastalık Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateDiseaseModal;
