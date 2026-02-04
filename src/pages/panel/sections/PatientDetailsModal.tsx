import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../../firebase/config';
import { toast } from 'react-toastify';
import AnamrezViewModal from './AnamrezViewModal';

interface PatientHistoryRecord {
  id: string;
  patientId: string;
  patientName: string;
  clinicId: string;
  historyDate: string;
  hasAnamnesis: boolean;
  hasTreatment: boolean;
  hasMedications: boolean;
  anamnesis?: {
    chiefComplaint?: string;
    complaintDetails?: string;
  };
  treatment?: {
    treatmentType?: string;
    outcome?: string;
  };
  medications?: {
    medicationList?: Array<{ name: string }>;
  };
  createdAt: string;
}

interface TreatmentOptions {
  protocol?: string;
  notes?: string;
  protocolId?: string;
  protocolName?: string;
  isCustomized?: boolean;
  originalProtocolId?: string;
  selectedProtocol?: any;
  customizedProtocol?: any;
  selectedMainApplications?: string[];
}

interface AdditionalQuestions {
  education: string;
  profession: string;
  exerciseFrequency: string;
  dailySleepHours: string;
  monthlyVegetableConsumption: string;
  monthlyRedMeatConsumption: string;
  monthlyChickenConsumption: string;
  dailyWaterConsumption: string;
  smokingFrequency: string;
  alcoholFrequency: string;
  maritalStatus: string;
  activeSexualLife: string;
  gebelikGecmisi: string;
  sonAdetTarihi: string;
}

interface Patient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyPhone: string;
  fatherName: string;
  birthPlace: string;
  registeredProvince: string;
  registrationDate?: string;
  country?: string;
  residenceCity?: string;
  visitReason: string;
  createdAt: string;
  updatedAt: string;
  treatmentOptions?: TreatmentOptions;
  treatmentStartedAt?: string;
  treatmentCompletedAt?: string;
  status?: string;
  dischargedAt?: string;
  dischargeSurvey?: {
    ratings: {
      overall_satisfaction?: number;
      staff_friendliness?: number;
      treatment_effectiveness?: number;
      cleanliness?: number;
      recommendation?: number;
    };
    additionalFeedback?: string;
    averageRating?: number;
    completedAt?: string;
  };
  optionalScans?: {
    hasMediaGallery?: boolean;
    [key: string]: any;
  };
  additionalQuestions?: AdditionalQuestions;
}

interface MediaFile {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video';
  uploadedAt: string;
  uploadedBy?: string;
}

interface PatientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  initialTab?: string;
}

const PatientDetailsModal: React.FC<PatientDetailsModalProps> = ({ isOpen, onClose, patient, initialTab = 'personal' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [historyRecords, setHistoryRecords] = useState<PatientHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<PatientHistoryRecord | null>(null);
  const [isHistoryViewModalOpen, setIsHistoryViewModalOpen] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  
  // Lifestyle questions state
  const [lifestyleData, setLifestyleData] = useState<AdditionalQuestions>({
    education: '',
    profession: '',
    exerciseFrequency: '',
    dailySleepHours: '',
    monthlyVegetableConsumption: '',
    monthlyRedMeatConsumption: '',
    monthlyChickenConsumption: '',
    dailyWaterConsumption: '',
    smokingFrequency: '',
    alcoholFrequency: '',
    maritalStatus: '',
    activeSexualLife: '',
    gebelikGecmisi: '',
    sonAdetTarihi: ''
  });
  const [savingLifestyle, setSavingLifestyle] = useState(false);

  // Load lifestyle data from patient when modal opens
  useEffect(() => {
    if (patient && isOpen) {
      setLifestyleData({
        education: patient.additionalQuestions?.education || '',
        profession: patient.additionalQuestions?.profession || '',
        exerciseFrequency: patient.additionalQuestions?.exerciseFrequency || '',
        dailySleepHours: patient.additionalQuestions?.dailySleepHours || '',
        monthlyVegetableConsumption: patient.additionalQuestions?.monthlyVegetableConsumption || '',
        monthlyRedMeatConsumption: patient.additionalQuestions?.monthlyRedMeatConsumption || '',
        monthlyChickenConsumption: patient.additionalQuestions?.monthlyChickenConsumption || '',
        dailyWaterConsumption: patient.additionalQuestions?.dailyWaterConsumption || '',
        smokingFrequency: patient.additionalQuestions?.smokingFrequency || '',
        alcoholFrequency: patient.additionalQuestions?.alcoholFrequency || '',
        maritalStatus: patient.additionalQuestions?.maritalStatus || '',
        activeSexualLife: patient.additionalQuestions?.activeSexualLife || '',
        gebelikGecmisi: patient.additionalQuestions?.gebelikGecmisi || '',
        sonAdetTarihi: patient.additionalQuestions?.sonAdetTarihi || ''
      });
    }
  }, [patient, isOpen]);

  // Handle lifestyle field change
  const handleLifestyleChange = (field: keyof AdditionalQuestions, value: string) => {
    setLifestyleData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Save lifestyle data to patient record
  const handleSaveLifestyle = async () => {
    if (!patient?.id) return;
    
    setSavingLifestyle(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        additionalQuestions: lifestyleData,
        updatedAt: new Date().toISOString()
      });
      toast.success('Yaşam tarzı bilgileri başarıyla kaydedildi');
    } catch (error) {
      console.error('Yaşam tarzı bilgileri kaydedilemedi:', error);
      toast.error('Yaşam tarzı bilgileri kaydedilemedi');
    } finally {
      setSavingLifestyle(false);
    }
  };

  // Fetch patient history records from both collections
  useEffect(() => {
    const fetchHistoryRecords = async () => {
      if (!patient?.id || !isOpen) return;

      setLoadingHistory(true);
      try {
        // Fetch from patientHistoryRecords collection (past history entries)
        const historyQuery = query(
          collection(db, 'patientHistoryRecords'),
          where('patientId', '==', patient.id)
        );
        const historySnapshot = await getDocs(historyQuery);

        const pastHistoryRecords = historySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          source: 'pastHistory'
        })) as (PatientHistoryRecord & { source: string })[];

        // Also fetch from anamrezRecords collection (appointment-based anamnez records)
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        const anamrezSnapshot = await getDocs(anamrezQuery);

        const anamrezRecords = anamrezSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            patientId: data.patientId,
            patientName: data.patientName || patient.fullName,
            clinicId: data.clinicId,
            historyDate: data.appointmentDate || data.createdAt || new Date().toISOString(),
            hasAnamnesis: true,
            hasTreatment: !!data.treatmentHistory,
            hasMedications: !!data.medications,
            anamnesis: {
              chiefComplaint: data.chiefComplaint,
              complaintDetails: data.historyOfPresentIllness || data.presentIllnessHistory
            },
            treatment: data.treatmentHistory ? {
              treatmentType: 'Tedavi',
              outcome: ''
            } : undefined,
            medications: data.medications,
            createdAt: data.createdAt,
            source: 'anamrez',
            // Keep original data for viewing
            ...data
          } as PatientHistoryRecord & { source: string };
        });

        // Combine and sort all records by date (newest first)
        // First, deduplicate by checking appointmentId or by unique identifiers
        const allRecords = [...pastHistoryRecords, ...anamrezRecords];
        
        // Filter out pending records - only show completed ones
        // Also deduplicate by appointmentId, preferring completed records
        const recordsByAppointmentId = new Map<string, any>();
        const recordsWithoutAppointmentId: any[] = [];
        
        // First pass: group by appointmentId and prefer completed records
        allRecords.forEach((record: any) => {
          if (record.appointmentId) {
            const existing = recordsByAppointmentId.get(record.appointmentId);
            if (!existing) {
              recordsByAppointmentId.set(record.appointmentId, record);
            } else {
              // Prefer completed over pending
              if (record.status === 'completed' && existing.status !== 'completed') {
                recordsByAppointmentId.set(record.appointmentId, record);
              }
            }
          } else {
            recordsWithoutAppointmentId.push(record);
          }
        });
        
        // Combine records with appointmentId and those without
        const deduplicatedByAppointment = Array.from(recordsByAppointmentId.values());
        
        // For records without appointmentId, deduplicate by date
        const seenDates = new Map<string, any>();
        const deduplicatedWithoutAppointment = recordsWithoutAppointmentId.filter((record: any) => {
          const dateKey = `${record.patientId}-${record.historyDate?.split('T')[0] || record.createdAt?.split('T')[0]}`;
          const existing = seenDates.get(dateKey);
          if (!existing) {
            seenDates.set(dateKey, record);
            return true;
          }
          // Prefer completed over pending, and anamrez over pastHistory
          if (record.status === 'completed' && existing.status !== 'completed') {
            seenDates.set(dateKey, record);
            return true;
          }
          if (record.source === 'anamrez' && existing.source === 'pastHistory') {
            seenDates.set(dateKey, record);
            return true;
          }
          return false;
        });
        
        // Final filter: only show completed records, not pending
        const finalRecords = [...deduplicatedByAppointment, ...deduplicatedWithoutAppointment]
          .filter((record: any) => record.status !== 'pending');
        
        finalRecords.sort((a, b) => {
          const dateA = new Date(a.historyDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.historyDate || b.createdAt || 0).getTime();
          return dateB - dateA;
        });

        setHistoryRecords(finalRecords);
      } catch (error) {
        console.error('Error fetching history records:', error);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistoryRecords();
  }, [patient?.id, isOpen]);

  // Reset tab and fetch media when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchMediaFiles();
    }
  }, [isOpen, initialTab]);

  // Fetch media files from patient record
  const fetchMediaFiles = async () => {
    if (!patient?.id) return;
    
    setLoadingMedia(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      const patientDoc = await getDoc(patientRef);
      
      if (patientDoc.exists()) {
        const data = patientDoc.data();
        setMediaFiles(data.mediaFiles || []);
      }
    } catch (error) {
      console.error('Error fetching media files:', error);
    } finally {
      setLoadingMedia(false);
    }
  };

  // Handle file upload
  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !patient?.id) return;

    setUploadingMedia(true);
    const newMediaFiles: MediaFile[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        if (!isVideo && !isImage) {
          toast.error(`${file.name} desteklenmeyen dosya formatı`);
          continue;
        }

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const fileName = `patients/${patient.id}/media/${timestamp}_${file.name}`;
        const storageRef = ref(storage, fileName);
        
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        const mediaFile: MediaFile = {
          id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
          url: downloadUrl,
          name: file.name,
          type: isVideo ? 'video' : 'image',
          uploadedAt: new Date().toISOString(),
        };

        newMediaFiles.push(mediaFile);
      }

      // Update patient record with new media files
      if (newMediaFiles.length > 0) {
        const patientRef = doc(db, 'patients', patient.id);
        await updateDoc(patientRef, {
          mediaFiles: arrayUnion(...newMediaFiles)
        });

        setMediaFiles(prev => [...prev, ...newMediaFiles]);
        toast.success(`${newMediaFiles.length} dosya başarıyla yüklendi`);
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Dosya yüklenirken bir hata oluştu');
    } finally {
      setUploadingMedia(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle delete media
  const handleDeleteMedia = async (mediaToDelete: MediaFile) => {
    if (!patient?.id) return;

    const confirmDelete = window.confirm(`"${mediaToDelete.name}" dosyasını silmek istediğinizden emin misiniz?`);
    if (!confirmDelete) return;

    try {
      // Delete from Firebase Storage
      try {
        const storageRef = ref(storage, mediaToDelete.url);
        await deleteObject(storageRef);
      } catch (storageError) {
        // File might already be deleted or URL format different
        console.warn('Could not delete from storage:', storageError);
      }

      // Update patient record - remove the media file
      const updatedMediaFiles = mediaFiles.filter(m => m.id !== mediaToDelete.id);
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        mediaFiles: updatedMediaFiles
      });

      setMediaFiles(updatedMediaFiles);
      toast.success('Dosya başarıyla silindi');
    } catch (error) {
      console.error('Error deleting media:', error);
      toast.error('Dosya silinirken bir hata oluştu');
    }
  };

  if (!isOpen || !patient) return null;

  // Calculate age from birth date
  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const tabs = [
    { id: 'personal', label: 'Kişisel Bilgi', icon: '👤' },
    { id: 'contact', label: 'İletişim', icon: '📞' },
    { id: 'medical', label: 'Tıbbi Bilgi', icon: '🏥' },
    { id: 'treatment', label: 'Tedavi Bilgileri', icon: '💊' },
    { id: 'lifestyle', label: 'Yaşam Tarzı', icon: '🏃' },
    { id: 'history', label: 'Geçmiş Kayıtları', icon: '📜' },
    // Only show media tab if hasMediaGallery is enabled in anamnez
    ...(patient.optionalScans?.hasMediaGallery ? [{ id: 'media', label: 'Fotoğraflar ve Videolar', icon: '📷' }] : []),
    // Only show survey tab if patient has discharge survey
    ...(patient.dischargeSurvey ? [{ id: 'survey', label: 'Memnuniyet Anketi', icon: '📊' }] : []),
    { id: 'address', label: 'Adres', icon: '📍' },
    { id: 'notes', label: 'Notlar', icon: '📝' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white text-2xl font-bold">
                  {patient.fullName.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-800">{patient.fullName}</h2>
                <p className="text-gray-600">Hasta No: {patient.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-2xl font-bold p-2 hover:bg-gray-100 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200">
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Cinsiyet:</span>
                <span className="font-semibold text-gray-800">{patient.gender}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Yaş:</span>
                <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">TC No:</span>
                <span className="font-semibold text-gray-800">{patient.tcNo}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Doğum Tarihi:</span>
                <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Ülke:</span>
                <span className="font-semibold text-gray-800">
                  {patient.country || 'Türkiye'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">İkamet İli:</span>
                <span className="font-semibold text-gray-800">
                  {patient.residenceCity || '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Durum:</span>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  Kayıtlı
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

                 {/* Content */}
         <div className="flex-1 overflow-y-auto min-h-0">
           <div className="p-6">
            {/* Personal Information Tab */}
            {activeTab === 'personal' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👤 Temel Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ad Soyad:</span>
                        <span className="font-semibold text-gray-800">{patient.fullName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">TC Kimlik No:</span>
                        <span className="font-semibold text-gray-800">{patient.tcNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👨‍👩‍👧‍👦 Aile Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Baba Adı:</span>
                        <span className="font-semibold text-gray-800">{patient.fatherName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Yeri:</span>
                        <span className="font-semibold text-gray-800">{patient.birthPlace}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıtlı İl:</span>
                        <span className="font-semibold text-gray-800">{patient.registeredProvince}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 İkamet Bilgileri
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ülke:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.country || 'Türkiye'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">İkamet İli:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.residenceCity || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Son Güncelleme:</span>
                      <span className="font-semibold text-gray-800">{formatDate(patient.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Information Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📞 İletişim Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Telefon</label>
                      <p className="font-semibold text-gray-800">{patient.phone}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Email</label>
                      <p className="font-semibold text-gray-800">{patient.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Acil Telefon</label>
                      <p className="font-semibold text-gray-800">
                        {patient.emergencyPhone || 'Belirtilmemiş'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Medical Information Tab */}
            {activeTab === 'medical' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      🏥 Tıbbi Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      📋 Ziyaret Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                        <p className="font-semibold text-gray-800">
                          {patient.visitReason || 'Belirtilmemiş'}
                        </p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıt Tarihi:</span>
                        <span className="font-semibold text-gray-800">
                          {formatDate(patient.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Treatment Information Tab */}
            {activeTab === 'treatment' && (
              <div className="space-y-6">
                {patient.treatmentOptions ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        💊 Tedavi Protokolü
                      </h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-gray-600">Protokol Adı</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.protocolName || 'Belirtilmemiş'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">Protokol Tipi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.isCustomized ? (
                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                                  🎨 Özelleştirilmiş
                                </span>
                              ) : (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  📋 Standart
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {patient.treatmentStartedAt && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Başlangıç Tarihi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {formatDate(patient.treatmentStartedAt)}
                            </p>
                          </div>
                        )}

                        {patient.status && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Durumu</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.status === 'treatment_decided' && (
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                  📋 Tedavi Belirlendi
                                </span>
                              )}
                              {patient.status === 'in_treatment' && (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  🏥 Tedavide
                                </span>
                              )}
                              {patient.status === 'treatment_completed' && (
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                  ✅ Tamamlandı
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected Protocol Details */}
                    {patient.treatmentOptions.selectedProtocol && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📊 Protokol Detayları
                        </h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm text-gray-600">Tanı Sistemi</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.diagnosisSystem || 'Belirtilmemiş'}
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-gray-600">Yaş Grubu</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.ageGroup || 'Belirtilmemiş'}
                              </p>
                            </div>
                          </div>

                          {patient.treatmentOptions.selectedProtocol.frequency && (
                            <div>
                              <label className="text-sm text-gray-600">Tedavi Sıklığı</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.frequency}
                              </p>
                            </div>
                          )}

                          {patient.treatmentOptions.selectedProtocol.control && (
                            <div>
                              <label className="text-sm text-gray-600">Kontrol</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.control}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Treatment Sequence */}
                    {patient.treatmentOptions.selectedProtocol?.treatmentSequence && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          🔄 Tedavi Sırası
                        </h3>
                        <div className="space-y-3">
                          {patient.treatmentOptions.selectedProtocol.treatmentSequence.map((item: any, index: number) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {item.order}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                    {item.phase}
                                  </span>
                                </div>
                                <p className="font-semibold text-gray-800">{item.treatment}</p>
                                {item.dosage && (
                                  <p className="text-sm text-gray-600 mt-1">Doz: {item.dosage}</p>
                                )}
                                {item.description && (
                                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Main Applications */}
                    {patient.treatmentOptions.selectedMainApplications && patient.treatmentOptions.selectedMainApplications.length > 0 && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          ✅ Seçilen Ana Uygulamalar
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {patient.treatmentOptions.selectedMainApplications.map((app, index) => (
                            <span 
                              key={index}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Treatment Notes */}
                    {patient.treatmentOptions.notes && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📝 Tedavi Notları
                        </h3>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {patient.treatmentOptions.notes}
                        </p>
                      </div>
                    )}

                    {/* Discharge Survey Results */}
                    {patient.dischargeSurvey && (
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                          📋 Memnuniyet Anketi Sonuçları
                        </h3>
                        
                        {/* Average Rating */}
                        <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-xl border border-purple-100">
                          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-white text-2xl font-bold">
                              {patient.dischargeSurvey.averageRating?.toFixed(1) || '-'}
                            </span>
                          </div>
                          <div>
                            <p className="text-purple-800 font-semibold text-lg">Ortalama Puan</p>
                            <p className="text-purple-600 text-sm">5 üzerinden değerlendirme</p>
                          </div>
                          <div className="ml-auto flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span 
                                key={star} 
                                className={`text-2xl ${(patient.dischargeSurvey?.averageRating || 0) >= star ? 'text-yellow-400' : 'text-gray-300'}`}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Individual Ratings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {[
                            { id: 'overall_satisfaction', label: 'Genel Memnuniyet', icon: '😊' },
                            { id: 'staff_friendliness', label: 'Personel İlgisi', icon: '👨‍⚕️' },
                            { id: 'treatment_effectiveness', label: 'Tedavi Etkisi', icon: '💊' },
                            { id: 'cleanliness', label: 'Hijyen ve Temizlik', icon: '✨' },
                            { id: 'recommendation', label: 'Tavsiye Puanı', icon: '🌟' }
                          ].map((item) => {
                            const rating = patient.dischargeSurvey?.ratings?.[item.id as keyof typeof patient.dischargeSurvey.ratings] || 0;
                            const ratingLabels = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'];
                            const ratingColors = ['', 'bg-red-100 text-red-700', 'bg-orange-100 text-orange-700', 'bg-yellow-100 text-yellow-700', 'bg-green-100 text-green-700', 'bg-emerald-100 text-emerald-700'];
                            
                            return (
                              <div key={item.id} className="bg-white rounded-lg p-4 border border-purple-100">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-gray-700 font-medium flex items-center gap-2">
                                    <span>{item.icon}</span>
                                    {item.label}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ratingColors[rating]}`}>
                                    {ratingLabels[rating]}
                                  </span>
                                </div>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <div 
                                      key={star}
                                      className={`h-2 flex-1 rounded-full ${rating >= star ? 'bg-purple-500' : 'bg-gray-200'}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Additional Feedback */}
                        {patient.dischargeSurvey.additionalFeedback && (
                          <div className="bg-white rounded-lg p-4 border border-purple-100">
                            <p className="text-gray-700 font-medium mb-2 flex items-center gap-2">
                              💬 Ek Görüşler
                            </p>
                            <p className="text-gray-600 italic">
                              "{patient.dischargeSurvey.additionalFeedback}"
                            </p>
                          </div>
                        )}

                        {/* Survey Date */}
                        {patient.dischargeSurvey.completedAt && (
                          <div className="mt-4 text-sm text-purple-600 text-right">
                            Anket tarihi: {new Date(patient.dischargeSurvey.completedAt).toLocaleDateString('tr-TR', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">💊</div>
                    <h3 className="text-gray-900 text-xl font-semibold mb-2">Henüz Tedavi Başlatılmamış</h3>
                    <p className="text-gray-600">
                      Bu hasta için henüz bir tedavi protokolü belirlenmemiş.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Lifestyle Tab */}
            {activeTab === 'lifestyle' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-orange-700 flex items-center gap-2">
                      🏃 Yaşam Tarzı Bilgileri
                    </h3>
                    <button
                      onClick={handleSaveLifestyle}
                      disabled={savingLifestyle}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all duration-200 shadow-md flex items-center gap-2"
                    >
                      {savingLifestyle ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Kaydediliyor...
                        </>
                      ) : (
                        <>
                          💾 Kaydet
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        1. Eğitim Durumu
                      </label>
                      <select
                        value={lifestyleData.education}
                        onChange={(e) => handleLifestyleChange('education', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="İlkokul">İlkokul</option>
                        <option value="Ortaokul">Ortaokul</option>
                        <option value="Lise">Lise</option>
                        <option value="Ön Lisans">Ön Lisans</option>
                        <option value="Lisans">Lisans</option>
                        <option value="Yüksek Lisans">Yüksek Lisans</option>
                        <option value="Doktora">Doktora</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        2. Mesleği
                      </label>
                      <input
                        type="text"
                        value={lifestyleData.profession}
                        onChange={(e) => handleLifestyleChange('profession', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Mesleğinizi yazınız"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        3. Spor Yapma Sıklığı
                      </label>
                      <select
                        value={lifestyleData.exerciseFrequency}
                        onChange={(e) => handleLifestyleChange('exerciseFrequency', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Hiç">Hiç</option>
                        <option value="Haftada 1-2 kez">Haftada 1-2 kez</option>
                        <option value="Haftada 3-4 kez">Haftada 3-4 kez</option>
                        <option value="Haftada 5-6 kez">Haftada 5-6 kez</option>
                        <option value="Her gün">Her gün</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        4. Günlük Uyku Saati
                      </label>
                      <select
                        value={lifestyleData.dailySleepHours}
                        onChange={(e) => handleLifestyleChange('dailySleepHours', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="4 saatten az">4 saatten az</option>
                        <option value="4-5 saat">4-5 saat</option>
                        <option value="6-7 saat">6-7 saat</option>
                        <option value="8-9 saat">8-9 saat</option>
                        <option value="10 saatten fazla">10 saatten fazla</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        5. Aylık Sebze Tüketimi
                      </label>
                      <select
                        value={lifestyleData.monthlyVegetableConsumption}
                        onChange={(e) => handleLifestyleChange('monthlyVegetableConsumption', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Çok az (0-5 kez)">Çok az (0-5 kez)</option>
                        <option value="Az (6-15 kez)">Az (6-15 kez)</option>
                        <option value="Orta (16-25 kez)">Orta (16-25 kez)</option>
                        <option value="Çok (26+ kez)">Çok (26+ kez)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        6. Aylık Kırmızı Et Tüketimi
                      </label>
                      <select
                        value={lifestyleData.monthlyRedMeatConsumption}
                        onChange={(e) => handleLifestyleChange('monthlyRedMeatConsumption', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Hiç">Hiç</option>
                        <option value="Çok az (1-3 kez)">Çok az (1-3 kez)</option>
                        <option value="Az (4-8 kez)">Az (4-8 kez)</option>
                        <option value="Orta (9-15 kez)">Orta (9-15 kez)</option>
                        <option value="Çok (16+ kez)">Çok (16+ kez)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        7. Aylık Tavuk Eti Tüketimi
                      </label>
                      <select
                        value={lifestyleData.monthlyChickenConsumption}
                        onChange={(e) => handleLifestyleChange('monthlyChickenConsumption', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Hiç">Hiç</option>
                        <option value="Çok az (1-3 kez)">Çok az (1-3 kez)</option>
                        <option value="Az (4-8 kez)">Az (4-8 kez)</option>
                        <option value="Orta (9-15 kez)">Orta (9-15 kez)</option>
                        <option value="Çok (16+ kez)">Çok (16+ kez)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        8. Günlük Su Tüketimi
                      </label>
                      <select
                        value={lifestyleData.dailyWaterConsumption}
                        onChange={(e) => handleLifestyleChange('dailyWaterConsumption', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="1 litreden az">1 litreden az</option>
                        <option value="1-2 litre">1-2 litre</option>
                        <option value="2-3 litre">2-3 litre</option>
                        <option value="3 litreden fazla">3 litreden fazla</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        9. Sigara İçme Sıklığı
                      </label>
                      <select
                        value={lifestyleData.smokingFrequency}
                        onChange={(e) => handleLifestyleChange('smokingFrequency', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Hiç">Hiç</option>
                        <option value="Bıraktım">Bıraktım</option>
                        <option value="Günde 1-5 adet">Günde 1-5 adet</option>
                        <option value="Günde 6-15 adet">Günde 6-15 adet</option>
                        <option value="Günde 16-25 adet">Günde 16-25 adet</option>
                        <option value="Günde 25+ adet">Günde 25+ adet</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        10. Alkol Kullanma Sıklığı
                      </label>
                      <select
                        value={lifestyleData.alcoholFrequency}
                        onChange={(e) => handleLifestyleChange('alcoholFrequency', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Hiç">Hiç</option>
                        <option value="Ayda 1-2 kez">Ayda 1-2 kez</option>
                        <option value="Haftada 1-2 kez">Haftada 1-2 kez</option>
                        <option value="Haftada 3-5 kez">Haftada 3-5 kez</option>
                        <option value="Her gün">Her gün</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        11. Evlilik Durumu
                      </label>
                      <select
                        value={lifestyleData.maritalStatus}
                        onChange={(e) => handleLifestyleChange('maritalStatus', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Bekar">Bekar</option>
                        <option value="Evli">Evli</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-2">
                        12. Aktif Cinsel Hayat
                      </label>
                      <select
                        value={lifestyleData.activeSexualLife}
                        onChange={(e) => handleLifestyleChange('activeSexualLife', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Seçiniz</option>
                        <option value="Evet">Evet</option>
                        <option value="Hayır">Hayır</option>
                      </select>
                    </div>

                    {/* Female-specific questions */}
                    {patient.gender === 'female' && (
                      <>
                        <div>
                          <label className="block text-gray-700 text-sm font-medium mb-2">
                            13. Gebelik Geçmişi
                          </label>
                          <select
                            value={lifestyleData.gebelikGecmisi}
                            onChange={(e) => handleLifestyleChange('gebelikGecmisi', e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          >
                            <option value="">Seçiniz</option>
                            <option value="Hiç gebe kalmadım">Hiç gebe kalmadım</option>
                            <option value="1 gebelik">1 gebelik</option>
                            <option value="2 gebelik">2 gebelik</option>
                            <option value="3 gebelik">3 gebelik</option>
                            <option value="4+ gebelik">4+ gebelik</option>
                            <option value="Düşük/Kürtaj geçmişi var">Düşük/Kürtaj geçmişi var</option>
                            <option value="Şu an hamileyim">Şu an hamileyim</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-gray-700 text-sm font-medium mb-2">
                            14. Son Adet Tarihi
                          </label>
                          <input
                            type="date"
                            value={lifestyleData.sonAdetTarihi}
                            onChange={(e) => handleLifestyleChange('sonAdetTarihi', e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History Records Tab */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      📜 Geçmiş Kayıtları
                    </h3>
                    <span className="text-sm text-gray-500">
                      {historyRecords.length} kayıt bulundu
                    </span>
                  </div>

                  {loadingHistory ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                      <p className="text-gray-500 mt-2">Yükleniyor...</p>
                    </div>
                  ) : historyRecords.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📜</div>
                      <h3 className="text-gray-900 text-xl font-semibold mb-2">Henüz Geçmiş Kaydı Yok</h3>
                      <p className="text-gray-600">
                        Bu hasta için henüz geçmiş tedavi/anamnez kaydı girilmemiş.
                      </p>
                      <p className="text-gray-500 text-sm mt-2">
                        Hasta listesindeki 📜 butonunu kullanarak geçmiş kayıt ekleyebilirsiniz.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Timeline */}
                      <div className="relative">
                        {historyRecords.map((record, index) => (
                          <div key={record.id} className="relative pl-8 pb-6">
                            {/* Timeline line */}
                            {index !== historyRecords.length - 1 && (
                              <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gray-200"></div>
                            )}

                            {/* Timeline dot */}
                            <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ${(record as any).source === 'anamrez' ? 'bg-blue-500' : 'bg-purple-500'}`}>
                              <span className="text-white text-xs">{(record as any).source === 'anamrez' ? '📅' : '📜'}</span>
                            </div>

                            {/* Record card */}
                            <div className={`rounded-xl p-4 border ${(record as any).source === 'anamrez' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-800">
                                    {new Date(record.historyDate).toLocaleDateString('tr-TR', {
                                      day: '2-digit',
                                      month: 'long',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  {/* Source indicator */}
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${(record as any).source === 'anamrez' ? 'bg-blue-200 text-blue-700' : 'bg-purple-200 text-purple-700'}`}>
                                    {(record as any).source === 'anamrez' ? 'Randevu' : 'Geçmiş Kayıt'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {record.hasAnamnesis && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                      📋 Anamnez
                                    </span>
                                  )}
                                  {record.hasTreatment && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      💊 Tedavi
                                    </span>
                                  )}
                                  {record.hasMedications && (
                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                      💉 İlaç
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Summary */}
                              <div className="space-y-2 text-sm">
                                {record.anamnesis?.complaintDetails && (
                                  <div>
                                    <span className="text-gray-600">Şikayet: </span>
                                    <span className="text-gray-800">
                                      {record.anamnesis.complaintDetails.length > 100
                                        ? record.anamnesis.complaintDetails.substring(0, 100) + '...'
                                        : record.anamnesis.complaintDetails}
                                    </span>
                                  </div>
                                )}
                                {record.treatment?.treatmentType && (
                                  <div>
                                    <span className="text-gray-600">Tedavi Türü: </span>
                                    <span className="text-gray-800">{record.treatment.treatmentType}</span>
                                    {record.treatment.outcome && (
                                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                        record.treatment.outcome === 'successful' ? 'bg-green-100 text-green-700' :
                                        record.treatment.outcome === 'partially_successful' ? 'bg-yellow-100 text-yellow-700' :
                                        record.treatment.outcome === 'unsuccessful' ? 'bg-red-100 text-red-700' :
                                        record.treatment.outcome === 'ongoing' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {record.treatment.outcome === 'successful' ? 'Başarılı' :
                                         record.treatment.outcome === 'partially_successful' ? 'Kısmen Başarılı' :
                                         record.treatment.outcome === 'unsuccessful' ? 'Başarısız' :
                                         record.treatment.outcome === 'ongoing' ? 'Devam Ediyor' :
                                         'Bilinmiyor'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {record.medications?.medicationList && record.medications.medicationList.length > 0 && (
                                  <div>
                                    <span className="text-gray-600">İlaçlar: </span>
                                    <span className="text-gray-800">
                                      {record.medications.medicationList.map(m => m.name).join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-xs text-gray-500">
                                  Eklendi: {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                                </span>
                                <button
                                  className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                                  onClick={() => {
                                    setSelectedHistoryRecord(record as any);
                                    setIsHistoryViewModalOpen(true);
                                  }}
                                >
                                  👁️ Görüntüle
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Media Tab - Photos and Videos */}
            {activeTab === 'media' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      📷 Fotoğraf & Video Galerisi
                    </h3>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleMediaUpload}
                        disabled={uploadingMedia}
                      />
                      <span className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                        uploadingMedia 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-purple-500 hover:bg-purple-600 text-white cursor-pointer'
                      }`}>
                        {uploadingMedia ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Yükleniyor...
                          </>
                        ) : (
                          <>
                            📤 Dosya Yükle
                          </>
                        )}
                      </span>
                    </label>
                  </div>

                  <p className="text-sm text-gray-500 mb-4">
                    Hasta ile ilgili fotoğraf ve videoları buradan yükleyebilirsiniz. Desteklenen formatlar: JPG, PNG, GIF, MP4, MOV
                  </p>

                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      <span className="ml-3 text-gray-600">Dosyalar yükleniyor...</span>
                    </div>
                  ) : mediaFiles.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                      <div className="text-4xl mb-3">📁</div>
                      <p className="text-gray-600 font-medium">Henüz dosya yüklenmemiş</p>
                      <p className="text-sm text-gray-500 mt-1">Fotoğraf veya video yüklemek için yukarıdaki butonu kullanın</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {mediaFiles.map((media) => (
                        <div
                          key={media.id}
                          className="relative group rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer hover:shadow-lg transition-all duration-200"
                          onClick={() => setSelectedMedia(media)}
                        >
                          {media.type === 'image' ? (
                            <img
                              src={media.url}
                              alt={media.name}
                              className="w-full h-40 object-cover"
                            />
                          ) : (
                            <div className="w-full h-40 bg-gray-900 flex items-center justify-center relative">
                              <video
                                src={media.url}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                  <span className="text-2xl">▶️</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-white text-xs truncate">{media.name}</p>
                            <p className="text-white/70 text-xs">
                              {new Date(media.uploadedAt).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              media.type === 'image' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                            }`}>
                              {media.type === 'image' ? '📷 Foto' : '🎬 Video'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMedia(media);
                              }}
                              className="w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center hover:scale-110"
                              title="Sil"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Media Preview Modal */}
            {selectedMedia && (
              <div 
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]"
                onClick={() => setSelectedMedia(null)}
              >
                <div className="max-w-4xl max-h-[90vh] p-4">
                  <button
                    onClick={() => setSelectedMedia(null)}
                    className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
                  >
                    ✕
                  </button>
                  {selectedMedia.type === 'image' ? (
                    <img
                      src={selectedMedia.url}
                      alt={selectedMedia.name}
                      className="max-w-full max-h-[85vh] object-contain rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <video
                      src={selectedMedia.url}
                      controls
                      autoPlay
                      className="max-w-full max-h-[85vh] rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <p className="text-white text-center mt-3">{selectedMedia.name}</p>
                </div>
              </div>
            )}

            {/* Address Information Tab */}
            {activeTab === 'address' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 Adres Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Tam Adres</label>
                      <p className="font-semibold text-gray-800 mt-1">{patient.address}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">Kayıtlı İl</label>
                        <p className="font-semibold text-gray-800">{patient.registeredProvince}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Doğum Yeri</label>
                        <p className="font-semibold text-gray-800">{patient.birthPlace}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Survey Tab */}
            {activeTab === 'survey' && patient.dischargeSurvey && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-sm">
                  <h3 className="text-xl font-bold text-purple-800 mb-6 flex items-center gap-2">
                    📊 Memnuniyet Anketi Sonuçları
                  </h3>
                  
                  {/* Average Rating Card */}
                  <div className="flex items-center gap-6 mb-8 p-6 bg-white rounded-2xl border border-purple-100 shadow-sm">
                    <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-4xl font-bold">
                        {patient.dischargeSurvey.averageRating?.toFixed(1) || '-'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-purple-800 font-bold text-2xl mb-1">Ortalama Puan</p>
                      <p className="text-purple-600 mb-3">5 üzerinden değerlendirme</p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span 
                            key={star} 
                            className={`text-3xl ${(patient.dischargeSurvey?.averageRating || 0) >= star ? 'text-yellow-400' : 'text-gray-300'}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                    {patient.dischargedAt && (
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Taburcu Tarihi</p>
                        <p className="text-purple-700 font-semibold">
                          {new Date(patient.dischargedAt).toLocaleDateString('tr-TR', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Individual Ratings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {[
                      { id: 'overall_satisfaction', label: 'Genel Memnuniyet', icon: '😊', desc: 'Tedavi sürecinden memnuniyet' },
                      { id: 'staff_friendliness', label: 'Personel İlgisi', icon: '👨‍⚕️', desc: 'Personelin ilgi ve alakası' },
                      { id: 'treatment_effectiveness', label: 'Tedavi Etkisi', icon: '💊', desc: 'Uygulanan tedavinin etkisi' },
                      { id: 'cleanliness', label: 'Hijyen ve Temizlik', icon: '✨', desc: 'Klinik hijyen durumu' },
                      { id: 'recommendation', label: 'Tavsiye Puanı', icon: '🌟', desc: 'Başkalarına tavsiye' }
                    ].map((item) => {
                      const rating = patient.dischargeSurvey?.ratings?.[item.id as keyof typeof patient.dischargeSurvey.ratings] || 0;
                      const ratingLabels = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'];
                      const ratingColors = ['', 'from-red-500 to-red-600', 'from-orange-500 to-orange-600', 'from-yellow-500 to-amber-500', 'from-green-500 to-green-600', 'from-emerald-500 to-teal-500'];
                      const ratingBgColors = ['', 'bg-red-100 text-red-700', 'bg-orange-100 text-orange-700', 'bg-yellow-100 text-yellow-700', 'bg-green-100 text-green-700', 'bg-emerald-100 text-emerald-700'];
                      
                      return (
                        <div key={item.id} className="bg-white rounded-xl p-5 border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="text-3xl">{item.icon}</span>
                              <div>
                                <p className="text-gray-800 font-semibold">{item.label}</p>
                                <p className="text-gray-500 text-xs">{item.desc}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex gap-1 flex-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <div 
                                  key={star}
                                  className={`h-3 flex-1 rounded-full transition-all ${rating >= star ? `bg-gradient-to-r ${ratingColors[rating]}` : 'bg-gray-200'}`}
                                />
                              ))}
                            </div>
                            <span className={`ml-3 px-3 py-1 rounded-full text-sm font-semibold ${ratingBgColors[rating]}`}>
                              {ratingLabels[rating]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Additional Feedback */}
                  {patient.dischargeSurvey.additionalFeedback && (
                    <div className="bg-white rounded-xl p-6 border border-purple-100 shadow-sm">
                      <p className="text-purple-800 font-semibold mb-3 flex items-center gap-2">
                        💬 Hastanın Ek Görüşleri
                      </p>
                      <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-400">
                        <p className="text-gray-700 italic text-lg">
                          "{patient.dischargeSurvey.additionalFeedback}"
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Survey Completion Info */}
                  {patient.dischargeSurvey.completedAt && (
                    <div className="mt-6 pt-4 border-t border-purple-200 flex items-center justify-between text-sm">
                      <span className="text-purple-600">
                        ✓ Anket başarıyla tamamlandı
                      </span>
                      <span className="text-gray-500">
                        {new Date(patient.dischargeSurvey.completedAt).toLocaleDateString('tr-TR', { 
                          day: 'numeric', 
                          month: 'long', 
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

             {/* Notes Tab */}
             {activeTab === 'notes' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📝 Hasta Notları
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                      <p className="font-semibold text-gray-800 mt-1">
                        {patient.visitReason || 'Not eklenmemiş'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Genel Notlar</label>
                      <textarea
                        className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        rows={4}
                        placeholder="Hasta hakkında notlar ekleyin..."
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📋 Not Geçmişi
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <p className="text-sm text-gray-800">Hasta kaydı oluşturuldu</p>
                        <span className="text-xs text-gray-500">{formatDate(patient.createdAt)}</span>
                      </div>
                    </div>
                    {patient.updatedAt !== patient.createdAt && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <p className="text-sm text-gray-800">Hasta bilgileri güncellendi</p>
                          <span className="text-xs text-gray-500">{formatDate(patient.updatedAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Son güncelleme: {formatDate(patient.updatedAt)}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 font-medium transition-all duration-200"
              >
                Kapat
              </button>
              <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-all duration-200">
                Yazdır
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Past History View Modal - Using AnamrezViewModal */}
      <AnamrezViewModal
        isOpen={isHistoryViewModalOpen}
        onClose={() => {
          setIsHistoryViewModalOpen(false);
          setSelectedHistoryRecord(null);
        }}
        patient={patient}
        anamrezRecord={selectedHistoryRecord}
      />
    </div>
  );
};

export default PatientDetailsModal;
