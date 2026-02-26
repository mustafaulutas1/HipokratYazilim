import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

interface Doctor {
  id: string;
  name: string;
  email: string;
  specialization?: string;
  department?: string;
  clinicId?: string;
  role?: string;
}

interface MedicalApplication {
  id: string;
  name: string;
  description: string;
  price: number;
  clinicId: string;
}

interface AdditionalTreatmentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  doctorProfile?: any;
}

const AdditionalTreatmentRequestModal: React.FC<AdditionalTreatmentRequestModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  doctorProfile
}) => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [applications, setApplications] = useState<MedicalApplication[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [treatmentReason, setTreatmentReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
      fetchApplications();
    }
  }, [isOpen]);

  const fetchApplications = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      setLoadingApplications(true);
      console.log('🔍 AdditionalTreatmentRequestModal: Fetching applications for clinicId:', doctorProfile.clinicId);
      
      const applicationsRef = collection(db, 'medicalApplications');
      const querySnapshot = await getDocs(applicationsRef);
      const fetchedApplications: MedicalApplication[] = [];
      const clinicApplicationNames = new Set<string>();
      
      // First pass: collect clinic-specific applications
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === doctorProfile.clinicId) {
          fetchedApplications.push({
            id: doc.id,
            name: data.name,
            description: data.description || '',
            price: data.price || 0,
            clinicId: data.clinicId
          });
          clinicApplicationNames.add(data.name);
        }
      });
      
      // Second pass: add standard applications that don't have clinic-specific versions
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === 'STANDARD' && !clinicApplicationNames.has(data.name)) {
          fetchedApplications.push({
            id: doc.id,
            name: data.name,
            description: data.description || '',
            price: data.price || 0,
            clinicId: data.clinicId
          });
        }
      });
      
      // Sort by name
      fetchedApplications.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      
      console.log('💊 AdditionalTreatmentRequestModal: Found applications:', fetchedApplications.length);
      setApplications(fetchedApplications);
    } catch (error) {
      console.error('❌ Error fetching applications:', error);
      setApplications([]);
    } finally {
      setLoadingApplications(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      
      if (!doctorProfile?.clinicId) {
        console.error('❌ AdditionalTreatmentRequestModal: No clinicId found in doctorProfile');
        setDoctors([]);
        setLoading(false);
        return;
      }
      
      console.log('🔍 AdditionalTreatmentRequestModal: Fetching doctors for clinicId:', doctorProfile.clinicId);
      
      // Fetch doctors from the same clinic only
      const doctorsQuery = query(
        collection(db, 'doctors'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const doctorsSnapshot = await getDocs(doctorsQuery);
      const doctorsData = doctorsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.fullName || data.name || `Doktor ${doc.id.slice(0, 8)}`,
          email: data.email || '',
          specialization: data.specialization || '',
          department: data.department || '',
          clinicId: data.clinicId || '',
          role: data.role || 'doctor'
        };
      });
      
      // Also fetch clinic users with doctor role
      const clinicUsersQuery = query(
        collection(db, 'clinicUsers'),
        where('clinicId', '==', doctorProfile.clinicId),
        where('role', '==', 'doctor')
      );
      const clinicUsersSnapshot = await getDocs(clinicUsersQuery);
      const clinicUserDoctors = clinicUsersSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          name: data.fullName || `Doktor ${doc.id.slice(0, 8)}`,
          email: data.email || '',
          specialization: data.specialization || data.department || 'Genel',
          department: data.department || '',
          clinicId: data.clinicId || '',
          role: data.role || 'doctor'
        };
      });
      
      // Combine both sources
      const allDoctors = [...doctorsData, ...clinicUserDoctors];
      
      console.log('👥 AdditionalTreatmentRequestModal: Found doctors:', allDoctors.length);
      
      if (allDoctors.length === 0) {
        console.log('⚠️ No doctors found in clinic');
        setDoctors([]);
      } else {
        setDoctors(allDoctors);
      }
      
    } catch (error) {
      console.error('❌ Error fetching doctors:', error);
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!selectedDoctorId || !selectedApplicationId || !user || !doctorProfile) return;
    
    try {
      setSending(true);
      
      const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
      const selectedApplication = applications.find(a => a.id === selectedApplicationId);
      
      const requestData = {
        // Request info
        type: 'additional_treatment',
        status: 'pending', // pending, approved, rejected
        
        // From (Tedavi Uzmanı)
        fromUserId: user.uid,
        fromUserName: doctorProfile.fullName || doctorProfile.name || user.email,
        fromUserRole: doctorProfile.role || 'treatment_specialist',
        
        // To (Doctor)
        toDoctorId: selectedDoctorId,
        toDoctorName: selectedDoctor?.name || 'Doktor',
        
        // Patient info
        patientId: patientId,
        patientName: patientName,
        
        // Request details - now with application info
        applicationId: selectedApplicationId,
        applicationName: selectedApplication?.name || '',
        applicationPrice: selectedApplication?.price || 0,
        applicationDescription: selectedApplication?.description || '',
        treatmentDescription: selectedApplication?.name || '',
        treatmentReason: treatmentReason.trim() || null,
        
        // Clinic & timestamps
        clinicId: doctorProfile.clinicId,
        createdAt: new Date().toISOString(),
        timestamp: new Date(),
        
        // Response fields (to be filled by doctor)
        responseNote: null,
        respondedAt: null,
        respondedBy: null,
        respondedByName: null
      };
      
      await addDoc(collection(db, 'additionalTreatmentRequests'), requestData);
      
      console.log('✅ Additional treatment request sent successfully');
      
      // Reset form
      setSelectedApplicationId('');
      setTreatmentReason('');
      setSelectedDoctorId('');
      
      alert('Ek tedavi talebi başarıyla gönderildi!');
      onClose();
      
    } catch (error) {
      console.error('❌ Error sending additional treatment request:', error);
      alert('Talep gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSelectedApplicationId('');
    setTreatmentReason('');
    setSelectedDoctorId('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💊</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Ek Tedavi Talebi</h2>
              <p className="text-gray-600">Doktordan ek tedavi onayı isteyin</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Patient Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <p className="text-gray-600 text-sm">Hasta</p>
                <p className="text-gray-900 font-semibold text-lg">{patientName}</p>
              </div>
            </div>
          </div>

          {/* Doctor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Doktor Seçin *
            </label>
            {loading ? (
              <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                <span className="text-gray-600">Doktorlar yükleniyor...</span>
              </div>
            ) : doctors.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                <span className="font-medium">⚠️ Uyarı:</span> Klinikte kayıtlı doktor bulunamadı.
              </div>
            ) : (
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              >
                <option value="">Doktor seçin...</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    Dr. {doctor.name} {doctor.specialization && `(${doctor.specialization})`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Application Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Talep Edilen Ek Tedavi *
            </label>
            {loadingApplications ? (
              <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                <span className="text-gray-600">Uygulamalar yükleniyor...</span>
              </div>
            ) : applications.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                <span className="font-medium">⚠️ Uyarı:</span> Uygulama Yönetimi'nden önce uygulama eklemeniz gerekiyor.
              </div>
            ) : (
              <>
                <select
                  value={selectedApplicationId}
                  onChange={(e) => setSelectedApplicationId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="">Uygulama seçin...</option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
                {selectedApplicationId && (
                  <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-purple-800 text-sm">
                      <span className="font-medium">Seçilen Uygulama:</span>{' '}
                      {applications.find(a => a.id === selectedApplicationId)?.name}
                    </p>
                    {applications.find(a => a.id === selectedApplicationId)?.description && (
                      <p className="text-purple-600 text-xs mt-1">
                        {applications.find(a => a.id === selectedApplicationId)?.description}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Treatment Reason (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Talep Nedeni (Opsiyonel)
            </label>
            <textarea
              value={treatmentReason}
              onChange={(e) => setTreatmentReason(e.target.value)}
              placeholder="Bu ek tedaviyi neden talep ettiğinizi açıklayın..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 resize-none"
            />
          </div>

          {/* Protocol Description & Price */}

          {/* Info Box */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">ℹ️</span>
              <div className="text-sm text-purple-800">
                <p className="font-medium mb-1">Talep Akışı:</p>
                <ol className="list-decimal list-inside space-y-1 text-purple-700">
                  <li>Talebiniz seçilen doktora iletilecektir</li>
                  <li>Doktor talebi inceleyip onaylayabilir veya reddedebilir</li>
                  <li>Onay durumunda ek tedaviyi uygulayabilirsiniz</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
          >
            İptal
          </button>
          <button
            onClick={handleSendRequest}
            disabled={sending || !selectedDoctorId || !selectedApplicationId}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Gönderiliyor...
              </>
            ) : (
              <>
                <span>📤</span>
                Talep Gönder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdditionalTreatmentRequestModal;
