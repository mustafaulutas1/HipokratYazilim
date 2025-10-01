import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, deleteDoc, doc, where, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { DIAGNOSIS_SYSTEMS } from '../../../constants';

interface Application {
  id?: string;
  name: string;
  description: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface SavedApplication extends Application {
  id: string;
}

interface DoctorProfile {
  clinicId: string;
  fullName: string;
}

interface ApplicationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorProfile: DoctorProfile | null;
  onApplicationsUpdate?: () => void;
}

const ApplicationManagementModal: React.FC<ApplicationManagementModalProps> = ({
  isOpen,
  onClose,
  doctorProfile,
  onApplicationsUpdate
}) => {
  const [savedApplications, setSavedApplications] = useState<SavedApplication[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingApplication, setEditingApplication] = useState<SavedApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Application>({
    name: '',
    description: '',
    clinicId: doctorProfile?.clinicId || '',
    createdBy: doctorProfile?.fullName || '',
    createdAt: new Date().toISOString()
  });

  const fetchApplications = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      setLoading(true);
      console.log('🔍 ApplicationManagement: Refetching applications for clinicId:', doctorProfile.clinicId);
      
      const applicationsRef = collection(db, 'medicalApplications');
      
      // Use only where clause without orderBy to avoid compound index requirement
      const q = query(
        applicationsRef,
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const querySnapshot = await getDocs(q);
      const applications: SavedApplication[] = [];
      
      querySnapshot.forEach((doc) => {
        applications.push({
          id: doc.id,
          ...doc.data()
        } as SavedApplication);
      });
      
      // Manual sort by creation date (newest first)
      applications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('✅ ApplicationManagement: Refetched applications:', applications.length);
      setSavedApplications(applications);
    } catch (error) {
      console.error('❌ ApplicationManagement: Error refetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!doctorProfile?.clinicId) return;
      
      try {
        setLoading(true);
        console.log('🔍 ApplicationManagement: Fetching applications for clinicId:', doctorProfile.clinicId);
        
        const applicationsRef = collection(db, 'medicalApplications');
        
        // Use only where clause without orderBy to avoid compound index requirement
        const q = query(
          applicationsRef,
          where('clinicId', '==', doctorProfile.clinicId)
        );
        
        const querySnapshot = await getDocs(q);
        const applications: SavedApplication[] = [];
        
        querySnapshot.forEach((doc) => {
          applications.push({
            id: doc.id,
            ...doc.data()
          } as SavedApplication);
        });
        
        // Manual sort by creation date (newest first)
        applications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        console.log('✅ ApplicationManagement: Fetched applications:', applications.length);
        setSavedApplications(applications);
      } catch (error) {
        console.error('❌ ApplicationManagement: Error fetching applications:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && doctorProfile?.clinicId) {
      fetchData();
    }
  }, [isOpen, doctorProfile?.clinicId]);

  const saveApplication = async () => {
    if (!formData.name.trim()) {
      alert('Lütfen uygulama adı girin.');
      return;
    }

    try {
      setLoading(true);
      
      if (editingApplication) {
        // Update existing application
        const applicationRef = doc(db, 'medicalApplications', editingApplication.id);
        await updateDoc(applicationRef, {
          name: formData.name,
          description: formData.description,
          updatedAt: new Date().toISOString()
        });
        alert('Uygulama başarıyla güncellendi!');
      } else {
        // Create new application
        const applicationsRef = collection(db, 'medicalApplications');
        await addDoc(applicationsRef, {
          ...formData,
          clinicId: doctorProfile?.clinicId || '',
          createdAt: new Date().toISOString()
        });
        alert('Uygulama başarıyla kaydedildi!');
      }

      setShowAddForm(false);
      setEditingApplication(null);
      resetForm();
      fetchApplications();
      onApplicationsUpdate?.();
      
    } catch (error) {
      console.error('Error saving application:', error);
      alert('Uygulama kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const editApplication = (application: SavedApplication) => {
    setEditingApplication(application);
    setFormData({
      name: application.name,
      description: application.description,
      clinicId: application.clinicId,
      createdBy: application.createdBy,
      createdAt: application.createdAt
    });
    setShowAddForm(true);
  };

  const deleteApplication = async (applicationId: string) => {
    if (window.confirm('Bu uygulamayı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'medicalApplications', applicationId));
        fetchApplications();
        onApplicationsUpdate?.();
        alert('Uygulama başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting application:', error);
        alert('Uygulama silinirken bir hata oluştu.');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      clinicId: doctorProfile?.clinicId || '',
      createdBy: doctorProfile?.fullName || '',
      createdAt: new Date().toISOString()
    });
    setEditingApplication(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-blue-900 border border-white/20 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              🏥 Uygulama Yönetimi
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
            >
              ✕
            </button>
          </div>
          <p className="text-white/70 mt-2">
            Tanı sistemleri arasında paylaşılabilir tıbbi uygulamaları yönetin
          </p>
        </div>

        <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {!showAddForm ? (
            <>
              {/* Add New Application Button */}
              <div className="mb-6">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  ➕ Yeni Uygulama Ekle
                </button>
              </div>

              {/* Applications List */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <span className="ml-3 text-white">Uygulamalar yükleniyor...</span>
                </div>
              ) : savedApplications.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏥</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Henüz uygulama eklenmemiş
                  </h3>
                  <p className="text-white/60">
                    İlk uygulamanızı eklemek için yukarıdaki butonu kullanın
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    📋 Kaydedilmiş Uygulamalar ({savedApplications.length})
                  </h3>
                  
                  {savedApplications.map((application) => (
                    <div key={application.id} className="bg-white/5 border border-white/20 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg font-semibold text-white">{application.name}</h4>
                          </div>
                          
                          {application.description && (
                            <p className="text-white/70 text-sm mb-3">{application.description}</p>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-white/50">
                            <span>👨‍⚕️ {application.createdBy}</span>
                            <span>📅 {new Date(application.createdAt).toLocaleDateString('tr-TR')}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editApplication(application)}
                            className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm"
                          >
                            ✏️ Düzenle
                          </button>
                          <button
                            onClick={() => deleteApplication(application.id)}
                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200 text-sm"
                          >
                            🗑️ Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Add/Edit Application Form */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">
                  {editingApplication ? '✏️ Uygulama Düzenle' : '➕ Yeni Uygulama Ekle'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded-xl text-gray-300 hover:text-gray-200 transition-all duration-200"
                >
                  ← Geri
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Application Name */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Uygulama Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: HACAMAT, MINOR OZON, AKUPUNKTUR"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Açıklama
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Bu uygulamanın özelliklerini ve nasıl kullanılacağını açıklayın..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={saveApplication}
                  disabled={!formData.name.trim() || loading}
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                      Kaydediliyor...
                    </>
                  ) : (
                    editingApplication ? '💾 Uygulamayı Güncelle' : '💾 Uygulamayı Kaydet'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationManagementModal;