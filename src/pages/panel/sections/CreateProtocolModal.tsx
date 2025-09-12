import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { AGE_GROUPS, TREATMENT_COURSES, APPLICATION_METHODS } from '../../../constants';

interface Disease {
  id: string;
  name: string;
  category: string;
}

interface CreateProtocolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProtocolAdded: () => void;
  selectedDiseaseId?: string;
  selectedAgeGroupId?: string;
}

const CreateProtocolModal: React.FC<CreateProtocolModalProps> = ({ 
  isOpen, 
  onClose, 
  onProtocolAdded,
  selectedDiseaseId,
  selectedAgeGroupId
}) => {
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [formData, setFormData] = useState({
    diseaseId: selectedDiseaseId || '',
    diseaseName: '',
    ageGroupId: selectedAgeGroupId || '',
    ageGroupName: '',
    treatmentCourseId: '',
    treatmentCourseName: '',
    applicationMethods: [] as string[],
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
    precautions: '',
    expectedResults: '',
    followUpSchedule: [''],
    isCombinedProtocol: false,
    secondaryConditions: [] as string[],
    protocolName: '',
    description: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Available secondary conditions
  const secondaryConditions = ['Stres', 'Anksiyete', 'Depresyon', 'Uyku Problemi', 'Yorgunluk'];

  // Fetch diseases from Firebase
  useEffect(() => {
    const fetchDiseases = async () => {
      try {
        const diseasesRef = collection(db, 'diseases');
        const querySnapshot = await getDocs(diseasesRef);
        
        const diseasesData: Disease[] = [];
        querySnapshot.forEach((doc) => {
          diseasesData.push({
            id: doc.id,
            ...doc.data()
          } as Disease);
        });
        
        setDiseases(diseasesData);
      } catch (error) {
        console.error('Error fetching diseases:', error);
      }
    };

    if (isOpen) {
      fetchDiseases();
    }
  }, [isOpen]);

  // Update disease name when disease is selected
  useEffect(() => {
    if (formData.diseaseId) {
      const selectedDisease = diseases.find(d => d.id === formData.diseaseId);
      if (selectedDisease) {
        setFormData(prev => ({
          ...prev,
          diseaseName: selectedDisease.name
        }));
      }
    }
  }, [formData.diseaseId, diseases]);

  // Update age group name when age group is selected
  useEffect(() => {
    if (formData.ageGroupId) {
      const selectedAgeGroup = AGE_GROUPS.find(a => a.id === formData.ageGroupId);
      if (selectedAgeGroup) {
        setFormData(prev => ({
          ...prev,
          ageGroupName: selectedAgeGroup.name
        }));
      }
    }
  }, [formData.ageGroupId]);

  // Update treatment course name when treatment course is selected
  useEffect(() => {
    if (formData.treatmentCourseId) {
      const selectedCourse = TREATMENT_COURSES.find(t => t.id === formData.treatmentCourseId);
      if (selectedCourse) {
        setFormData(prev => ({
          ...prev,
          treatmentCourseName: selectedCourse.name
        }));
      }
    }
  }, [formData.treatmentCourseId]);

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

  const handleArrayInputChange = (index: number, field: 'followUpSchedule' | 'secondaryConditions', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };

  const addArrayItem = (field: 'followUpSchedule' | 'secondaryConditions') => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };

  const removeArrayItem = (field: 'followUpSchedule' | 'secondaryConditions', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleApplicationMethodToggle = (methodId: string) => {
    setFormData(prev => ({
      ...prev,
      applicationMethods: prev.applicationMethods.includes(methodId)
        ? prev.applicationMethods.filter(id => id !== methodId)
        : [...prev.applicationMethods, methodId]
    }));
  };

  const handleSecondaryConditionToggle = (condition: string) => {
    setFormData(prev => ({
      ...prev,
      secondaryConditions: prev.secondaryConditions.includes(condition)
        ? prev.secondaryConditions.filter(c => c !== condition)
        : [...prev.secondaryConditions, condition]
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.diseaseId) {
      newErrors.diseaseId = 'Hastalık seçimi gereklidir';
    }

    if (!formData.ageGroupId) {
      newErrors.ageGroupId = 'Yaş grubu seçimi gereklidir';
    }

    if (!formData.treatmentCourseId) {
      newErrors.treatmentCourseId = 'Tedavi kürü seçimi gereklidir';
    }

    if (formData.applicationMethods.length === 0) {
      newErrors.applicationMethods = 'En az bir uygulama yöntemi seçilmelidir';
    }

    if (!formData.dosage.trim()) {
      newErrors.dosage = 'Doz bilgisi gereklidir';
    }

    if (!formData.frequency.trim()) {
      newErrors.frequency = 'Sıklık bilgisi gereklidir';
    }

    if (!formData.duration.trim()) {
      newErrors.duration = 'Süre bilgisi gereklidir';
    }

    if (!formData.instructions.trim()) {
      newErrors.instructions = 'Talimatlar gereklidir';
    }

    if (!formData.precautions.trim()) {
      newErrors.precautions = 'Dikkat edilecekler gereklidir';
    }

    if (!formData.expectedResults.trim()) {
      newErrors.expectedResults = 'Beklenen sonuçlar gereklidir';
    }

    if (formData.followUpSchedule.filter(f => f.trim()).length === 0) {
      newErrors.followUpSchedule = 'En az bir takip programı girilmelidir';
    }

    if (formData.isCombinedProtocol) {
      if (!formData.protocolName.trim()) {
        newErrors.protocolName = 'Protokol adı gereklidir';
      }
      if (!formData.description.trim()) {
        newErrors.description = 'Protokol açıklaması gereklidir';
      }
      if (formData.secondaryConditions.length === 0) {
        newErrors.secondaryConditions = 'En az bir ek koşul seçilmelidir';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      const protocolData = {
        diseaseId: formData.diseaseId,
        diseaseName: formData.diseaseName,
        ageGroupId: formData.ageGroupId,
        ageGroupName: formData.ageGroupName,
        treatmentCourseId: formData.treatmentCourseId,
        treatmentCourseName: formData.treatmentCourseName,
        applicationMethods: formData.applicationMethods,
        dosage: formData.dosage,
        frequency: formData.frequency,
        duration: formData.duration,
        instructions: formData.instructions,
        precautions: formData.precautions,
        expectedResults: formData.expectedResults,
        followUpSchedule: formData.followUpSchedule.filter(f => f.trim()),
        isActive: true,
        createdBy: 'current-user', // TODO: Get from auth context
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (formData.isCombinedProtocol) {
        // Create combined protocol
        const combinedProtocolData = {
          ...protocolData,
          name: formData.protocolName,
          description: formData.description,
          primaryDiseaseId: formData.diseaseId,
          primaryDiseaseName: formData.diseaseName,
          secondaryConditions: formData.secondaryConditions
        };

        await addDoc(collection(db, 'combinedProtocols'), combinedProtocolData);
      } else {
        // Create disease protocol
        await addDoc(collection(db, 'diseaseProtocols'), protocolData);
      }
      
      onProtocolAdded();
      handleClose();
    } catch (error) {
      console.error('Error creating protocol:', error);
      setErrors({ submit: 'Protokol oluşturulurken bir hata oluştu' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      diseaseId: selectedDiseaseId || '',
      diseaseName: '',
      ageGroupId: selectedAgeGroupId || '',
      ageGroupName: '',
      treatmentCourseId: '',
      treatmentCourseName: '',
      applicationMethods: [],
      dosage: '',
      frequency: '',
      duration: '',
      instructions: '',
      precautions: '',
      expectedResults: '',
      followUpSchedule: [''],
      isCombinedProtocol: false,
      secondaryConditions: [],
      protocolName: '',
      description: ''
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Yeni Protokol Ekle</h2>
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
          {/* Protocol Type Selection */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isCombinedProtocol}
                onChange={(e) => setFormData(prev => ({ ...prev, isCombinedProtocol: e.target.checked }))}
                className="w-4 h-4 text-green-600 bg-white border-gray-300 focus:ring-green-500"
              />
              <span className="text-gray-900 font-medium">Kombine Protokol (Birden fazla koşul için)</span>
            </label>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Hastalık *
              </label>
              <select
                name="diseaseId"
                value={formData.diseaseId}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Hastalık Seçin</option>
                {diseases.map(disease => (
                  <option key={disease.id} value={disease.id}>{disease.name}</option>
                ))}
              </select>
              {errors.diseaseId && <p className="text-red-600 text-sm mt-1">{errors.diseaseId}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Yaş Grubu *
              </label>
              <select
                name="ageGroupId"
                value={formData.ageGroupId}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Yaş Grubu Seçin</option>
                {AGE_GROUPS.map(ageGroup => (
                  <option key={ageGroup.id} value={ageGroup.id}>{ageGroup.name}</option>
                ))}
              </select>
              {errors.ageGroupId && <p className="text-red-600 text-sm mt-1">{errors.ageGroupId}</p>}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Tedavi Kürü *
            </label>
            <select
              name="treatmentCourseId"
              value={formData.treatmentCourseId}
              onChange={handleInputChange}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tedavi Kürü Seçin</option>
              {TREATMENT_COURSES.map(course => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            {errors.treatmentCourseId && <p className="text-red-600 text-sm mt-1">{errors.treatmentCourseId}</p>}
          </div>

          {/* Combined Protocol Fields */}
          {formData.isCombinedProtocol && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Protokol Adı *
                  </label>
                  <input
                    type="text"
                    name="protocolName"
                    value={formData.protocolName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Örn: Egzama + Stres Protokolü"
                  />
                  {errors.protocolName && <p className="text-red-600 text-sm mt-1">{errors.protocolName}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Açıklama *
                  </label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Protokol açıklaması"
                  />
                  {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Ek Koşullar *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {secondaryConditions.map((condition) => (
                    <label key={condition} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.secondaryConditions.includes(condition)}
                        onChange={() => handleSecondaryConditionToggle(condition)}
                        className="w-4 h-4 text-green-600 bg-white border-gray-300 focus:ring-green-500"
                      />
                      <span className="text-gray-800 text-sm">{condition}</span>
                    </label>
                  ))}
                </div>
                {errors.secondaryConditions && <p className="text-red-600 text-sm mt-1">{errors.secondaryConditions}</p>}
              </div>
            </>
          )}

          {/* Application Methods */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Uygulama Yöntemleri *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {APPLICATION_METHODS.map((method) => (
                <label key={method.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.applicationMethods.includes(method.id)}
                    onChange={() => handleApplicationMethodToggle(method.id)}
                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-gray-800 text-sm">{method.name}</span>
                </label>
              ))}
            </div>
            {errors.applicationMethods && <p className="text-red-600 text-sm mt-1">{errors.applicationMethods}</p>}
          </div>

          {/* Treatment Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Doz *
              </label>
              <input
                type="text"
                name="dosage"
                value={formData.dosage}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: 200ml"
              />
              {errors.dosage && <p className="text-red-600 text-sm mt-1">{errors.dosage}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Sıklık *
              </label>
              <input
                type="text"
                name="frequency"
                value={formData.frequency}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: Haftada 2"
              />
              {errors.frequency && <p className="text-red-600 text-sm mt-1">{errors.frequency}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Süre *
              </label>
              <input
                type="text"
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Örn: 6 hafta"
              />
              {errors.duration && <p className="text-red-600 text-sm mt-1">{errors.duration}</p>}
            </div>
          </div>

          {/* Instructions and Precautions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Talimatlar *
              </label>
              <textarea
                name="instructions"
                value={formData.instructions}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Tedavi talimatları..."
              />
              {errors.instructions && <p className="text-red-600 text-sm mt-1">{errors.instructions}</p>}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Dikkat Edilecekler *
              </label>
              <textarea
                name="precautions"
                value={formData.precautions}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Dikkat edilecek noktalar..."
              />
              {errors.precautions && <p className="text-red-600 text-sm mt-1">{errors.precautions}</p>}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Beklenen Sonuçlar *
            </label>
            <textarea
              name="expectedResults"
              value={formData.expectedResults}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Tedavi sonucunda beklenen iyileşmeler..."
            />
            {errors.expectedResults && <p className="text-red-600 text-sm mt-1">{errors.expectedResults}</p>}
          </div>

          {/* Follow-up Schedule */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Takip Programı *
            </label>
            <div className="space-y-2">
              {formData.followUpSchedule.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleArrayInputChange(index, 'followUpSchedule', e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Takip ${index + 1} (Örn: 2. hafta)`}
                  />
                  {formData.followUpSchedule.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeArrayItem('followUpSchedule', index)}
                      className="px-3 py-3 bg-red-100 hover:bg-red-200 border border-red-300 rounded-xl text-red-700 hover:text-red-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem('followUpSchedule')}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 hover:text-blue-800 transition-all duration-200"
              >
                + Takip Ekle
              </button>
            </div>
            {errors.followUpSchedule && <p className="text-red-600 text-sm mt-1">{errors.followUpSchedule}</p>}
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
              {loading ? 'Ekleniyor...' : 'Protokol Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProtocolModal;
