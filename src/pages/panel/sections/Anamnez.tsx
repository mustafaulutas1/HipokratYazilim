import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AnamrezFormModal from './AnamrezFormModal';
import AnamrezViewModal from './AnamrezViewModal';

interface AnamrezProps {
  doctorProfile: any;
}

interface Patient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyPhone: string;
  visitReason: string;
  clinicId: string;
  isAnamnezCompleted: boolean;
  createdAt: string;
  anamrezCompletedAt?: string;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  status?: string;
}

interface AnamrezRecord {
  id: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  appointmentDate?: string;
  status: 'pending' | 'completed';
  // Form saves as complaintDetails, not chiefComplaint
  complaintDetails?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  medications?: string;
  allergies?: string;
  familyHistory?: string;
  socialHistory?: string;
  systemsReview?: string;
  vitalSigns?: {
    bloodPressure?: string;
    pulse?: string;
    temperature?: string;
    respiratoryRate?: string;
    weight?: string;
    height?: string;
  };
  physicalExamination?: string;
  nurseId?: string;
  nurseName?: string;
  createdAt: string;
  updatedAt: string;
  // For past history records
  historyDate?: string;
  isPastHistory?: boolean;
  // For routine anamnez
  isRoutineAnamnez?: boolean;
  routineAnamnezTemplates?: string[];
  routineProgramId?: string;
  routineAnamnezData?: Record<string, number>;
  routineAnamnezNotes?: Record<string, string>;
  completedAt?: string;
}

const Anamnez: React.FC<AnamrezProps> = ({ doctorProfile }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pendingAnamrezRecords, setPendingAnamrezRecords] = useState<AnamrezRecord[]>([]);
  const [completedAnamrezRecords, setCompletedAnamrezRecords] = useState<AnamrezRecord[]>([]);
  const [pastHistoryRecords, setPastHistoryRecords] = useState<AnamrezRecord[]>([]);
  const [routineAnamnezRecords, setRoutineAnamnezRecords] = useState<AnamrezRecord[]>([]);
  const [selectedAnamrezRecord, setSelectedAnamrezRecord] = useState<AnamrezRecord | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [completedSearchTerm, setCompletedSearchTerm] = useState('');
  const [pastHistorySearchTerm, setPastHistorySearchTerm] = useState('');
  const [routineSearchTerm, setRoutineSearchTerm] = useState('');
  const [isAnamrezModalOpen, setIsAnamrezModalOpen] = useState(false);
  const [isAnamrezViewModalOpen, setIsAnamrezViewModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'pastHistory' | 'routine'>('pending');
  const [, setIsEditMode] = useState(false);
  const [, setEditingAnamrezRecord] = useState<AnamrezRecord | null>(null);

  // Fetch anamnez records and patients
  const fetchData = async () => {
    if (!doctorProfile?.clinicId) return;

    try {
      console.log('🔍 Anamnez: Fetching data for clinicId:', doctorProfile?.clinicId);

      // Fetch all anamnez records for this clinic
      const anamrezQuery = query(
        collection(db, 'anamrezRecords'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const anamrezSnapshot = await getDocs(anamrezQuery);
      const allAnamrezRecords = anamrezSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AnamrezRecord));

      // Separate pending and completed anamnez records
      // Routine anamnez records (isRoutineAnamnez=true) shown in separate tab
      const pendingRecords = allAnamrezRecords.filter(r => r.status === 'pending' && !r.isRoutineAnamnez);
      const completedRecords = allAnamrezRecords.filter(r => r.status === 'completed' && !r.isRoutineAnamnez);
      const routineRecords = allAnamrezRecords.filter(r => r.isRoutineAnamnez && r.status === 'completed');
      routineRecords.sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
      setRoutineAnamnezRecords(routineRecords);

      // Sort by creation date
      pendingRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      completedRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('📋 Anamnez: Found pending records:', pendingRecords.length);
      console.log('✅ Anamnez: Found completed records:', completedRecords.length);

      setPendingAnamrezRecords(pendingRecords);
      setCompletedAnamrezRecords(completedRecords);

      // Fetch past history records from patientHistoryRecords collection
      const pastHistoryQuery = query(
        collection(db, 'patientHistoryRecords'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const pastHistorySnapshot = await getDocs(pastHistoryQuery);
      const pastHistoryData = pastHistorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isPastHistory: true,
        status: 'completed' as const
      } as AnamrezRecord));

      // Sort past history by historyDate (newest first)
      pastHistoryData.sort((a, b) => {
        const dateA = new Date(a.historyDate || a.createdAt).getTime();
        const dateB = new Date(b.historyDate || b.createdAt).getTime();
        return dateB - dateA;
      });

      console.log('📜 Anamnez: Found past history records:', pastHistoryData.length);
      setPastHistoryRecords(pastHistoryData);

      // Also fetch all patients for reference
      const patientsQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const patientsSnapshot = await getDocs(patientsQuery);
      const patientsList = patientsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Patient));
      setPatients(patientsList);

      setLoading(false);
    } catch (error) {
      console.error('❌ Anamnez: Veri yüklenirken hata oluştu:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [doctorProfile]);

  // Filter pending anamnez records by patient name
  const filteredPendingRecords = pendingAnamrezRecords.filter(record =>
    record.patientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter completed anamnez records by patient name
  const filteredCompletedRecords = completedAnamrezRecords.filter(record =>
    record.patientName.toLowerCase().includes(completedSearchTerm.toLowerCase())
  );

  // Filter past history records by patient name
  const filteredPastHistoryRecords = pastHistoryRecords.filter(record =>
    record.patientName.toLowerCase().includes(pastHistorySearchTerm.toLowerCase())
  );

  // Filter routine anamnez records by patient name
  const filteredRoutineRecords = routineAnamnezRecords.filter(record =>
    record.patientName.toLowerCase().includes(routineSearchTerm.toLowerCase())
  );

  // Get patient by ID
  const getPatientById = (patientId: string): Patient | undefined => {
    return patients.find(p => p.id === patientId);
  };

  // Get all anamnez records for a patient
  const getPatientAnamrezRecords = (patientId: string) => {
    return completedAnamrezRecords.filter(record => record.patientId === patientId);
  };

  // Check if anamnesis is editable (patient not sent to doctor from Assistant Screen)
  const isAnamrezEditable = (patientId: string): boolean => {
    const patient = getPatientById(patientId);
    if (!patient) return false;

    // If patient has been assigned to a doctor and is in active treatment flow, editing is disabled
    const nonEditableStatuses = ['assigned_to_doctor', 'in_treatment', 'treatment_decided', 'treatment_continue'];

    // If patient has an assigned doctor and status indicates they're in the doctor workflow
    if (patient.assignedDoctorId && patient.status && nonEditableStatuses.includes(patient.status)) {
      return false;
    }

    return true;
  };

  // Handle edit anamnesis
  const handleEditAnamrez = (record: AnamrezRecord) => {
    setEditingAnamrezRecord(record);
    setSelectedAnamrezRecord(record);
    const patient = getPatientById(record.patientId);
    if (patient) {
      setSelectedPatient(patient);
    }
    setIsEditMode(true);
    setIsAnamrezModalOpen(true);
  };

  // Handle selecting an anamnez record
  const handleSelectAnamrezRecord = (record: AnamrezRecord) => {
    setSelectedAnamrezRecord(record);
    const patient = getPatientById(record.patientId);
    if (patient) {
      setSelectedPatient(patient);
    }
  };

  const handleDeletePendingRecord = async (record: AnamrezRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`"${record.patientName}" adlı hastanın bekleyen anamnez kaydı iptal edilsin mi?`)) return;
    try {
      await deleteDoc(doc(db, 'anamrezRecords', record.id));
      setPendingAnamrezRecords(prev => prev.filter(r => r.id !== record.id));
      if (selectedAnamrezRecord?.id === record.id) {
        setSelectedAnamrezRecord(null);
        setSelectedPatient(null);
      }
    } catch (error) {
      console.error('Kayıt silinirken hata:', error);
      alert('Kayıt silinirken bir hata oluştu.');
    }
  };

  const handleAnamrezCompleted = () => {
    // Immediately update the UI to reflect the change
    if (selectedAnamrezRecord) {
      // Move the anamnez record from pending to completed list
      setPendingAnamrezRecords(prev => prev.filter(r => r.id !== selectedAnamrezRecord.id));

      // Add to completed list with updated status
      const updatedRecord = {
        ...selectedAnamrezRecord,
        status: 'completed' as const,
        updatedAt: new Date().toISOString()
      };

      setCompletedAnamrezRecords(prev => [updatedRecord, ...prev]);
      setSelectedAnamrezRecord(null);
      setSelectedPatient(null);
    }

    // Reset edit mode
    setIsEditMode(false);
    setEditingAnamrezRecord(null);

    // Refresh data from database to ensure consistency
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <>
      {/* Custom CSS for pulsing glow animation */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(249, 115, 22, 0.4), 0 0 10px rgba(249, 115, 22, 0.2), 0 0 15px rgba(249, 115, 22, 0.1);
          }
          50% {
            box-shadow: 0 0 10px rgba(249, 115, 22, 0.6), 0 0 20px rgba(249, 115, 22, 0.4), 0 0 30px rgba(249, 115, 22, 0.2);
          }
        }
        
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        @keyframes subtle-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.02);
            opacity: 0.9;
          }
        }
        
        .animate-subtle-pulse {
          animation: subtle-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
      
      <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">📝 Anamnez Ekranı</h1>
            <p className="text-white/70">
              Anamnez tamamlanmamış hastaları görüntüleyin ve anamnez oluşturun
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-white/60 text-sm">Bekleyen</div>
              <div className="text-2xl font-bold text-orange-300">{pendingAnamrezRecords.length}</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-sm">Tamamlanan</div>
              <div className="text-2xl font-bold text-green-300">{completedAnamrezRecords.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patients List */}
        <div className="lg:col-span-1 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          {/* Tab Navigation */}
          <div className="flex items-center mb-6 bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('pending')}
              className={`relative flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'pending'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'text-white/70 hover:text-white/90'
              } ${pendingAnamrezRecords.length > 0 && activeTab === 'pending' ? 'animate-pulse-glow' : ''}`}
            >
              {pendingAnamrezRecords.length > 0 && (
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-orange-500 rounded-full animate-ping"></div>
              )}
              {pendingAnamrezRecords.length > 0 && (
                <div className="absolute -top-1 -left-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
              )}
              Bekleyen ({pendingAnamrezRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'completed'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'text-white/70 hover:text-white/90'
              }`}
            >
              Tamamlanan ({completedAnamrezRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('pastHistory')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'pastHistory'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-white/70 hover:text-white/90'
              }`}
            >
              📜 Geçmiş ({pastHistoryRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('routine')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeTab === 'routine'
                  ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                  : 'text-white/70 hover:text-white/90'
              }`}
            >
              💜 Rutin ({routineAnamnezRecords.length})
            </button>
          </div>

          {activeTab === 'pending' && (
            <>
              {/* Search for Pending */}
              <div className="mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/50">🔍</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Bekleyen hasta ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Pending Anamnez Records List */}
              <div className="space-y-2 max-h-96 overflow-y-auto admin-panel-scrollbar">
                {filteredPendingRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">📋</div>
                    <p className="text-white/70 text-sm">Anamnez bekleyen kayıt bulunmuyor.</p>
                  </div>
                ) : (
                  filteredPendingRecords.map((record) => {
                    return (
                      <div
                        key={record.id}
                        onClick={() => handleSelectAnamrezRecord(record)}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedAnamrezRecord?.id === record.id
                            ? 'bg-orange-500/20 border border-orange-500/30'
                            : 'bg-white/5 hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-semibold text-sm">{record.patientName}</h3>
                            {record.appointmentDate && (
                              <p className="text-white/60 text-xs">
                                Randevu: {new Date(record.appointmentDate).toLocaleDateString('tr-TR')}
                              </p>
                            )}
                            <p className="text-white/60 text-xs">
                              Oluşturulma: {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                            </p>
                            {(record as any).isRoutineAnamnez && (record as any).routineAnamnezTemplates?.length > 0 && (
                              <p className="text-purple-300 text-xs font-medium mt-0.5">
                                Rutin: {(record as any).routineAnamnezTemplates.join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            <div className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs">
                              Bekliyor
                            </div>
                            <button
                              onClick={(e) => handleDeletePendingRecord(record, e)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full text-xs transition-colors"
                            >
                              İptal Et
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'completed' && (
            <>
              {/* Search for Completed */}
              <div className="mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/50">🔍</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Tamamlanan hasta ara..."
                    value={completedSearchTerm}
                    onChange={(e) => setCompletedSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              {/* Completed Anamnez Records List */}
              <div className="space-y-2 max-h-96 overflow-y-auto admin-panel-scrollbar">
                {filteredCompletedRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">✅</div>
                    <p className="text-white/70 text-sm">Tamamlanan anamnez kaydı bulunmuyor.</p>
                  </div>
                ) : (
                  filteredCompletedRecords.map((record) => {
                    return (
                      <div
                        key={record.id}
                        onClick={() => handleSelectAnamrezRecord(record)}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedAnamrezRecord?.id === record.id
                            ? 'bg-green-500/20 border border-green-500/30'
                            : 'bg-white/5 hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-semibold text-sm">{record.patientName}</h3>
                            {record.appointmentDate && (
                              <p className="text-white/60 text-xs">
                                Randevu: {new Date(record.appointmentDate).toLocaleDateString('tr-TR')}
                              </p>
                            )}
                            <p className="text-white/60 text-xs">
                              Tamamlandı: {new Date(record.updatedAt).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="px-2 py-1 bg-green-500/20 text-green-300 rounded-full text-xs">
                              ✅ Tamamlandı
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'routine' && (
            <>
              <div className="mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/50">🔍</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Rutin anamnez ara..."
                    value={routineSearchTerm}
                    onChange={(e) => setRoutineSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto admin-panel-scrollbar">
                {filteredRoutineRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">💜</div>
                    <p className="text-white/70 text-sm">Rutin anamnez kaydı bulunmuyor.</p>
                  </div>
                ) : (
                  filteredRoutineRecords.map((record) => (
                    <div
                      key={record.id}
                      onClick={() => handleSelectAnamrezRecord(record)}
                      className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                        selectedAnamrezRecord?.id === record.id
                          ? 'bg-pink-500/20 border border-pink-500/30'
                          : 'bg-white/5 hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-white font-semibold text-sm">{record.patientName}</h3>
                          <p className="text-white/60 text-xs">
                            Tamamlandı: {new Date(record.completedAt || record.updatedAt).toLocaleDateString('tr-TR')}
                          </p>
                          {record.routineAnamnezTemplates && record.routineAnamnezTemplates.length > 0 && (
                            <p className="text-pink-300 text-xs font-medium mt-0.5 line-clamp-1">
                              {record.routineAnamnezTemplates.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="px-2 py-1 bg-pink-500/20 text-pink-300 rounded-full text-xs whitespace-nowrap">
                          💜 Rutin
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'pastHistory' && (
            <>
              {/* Search for Past History */}
              <div className="mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/50">🔍</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Geçmiş kayıtlarda ara..."
                    value={pastHistorySearchTerm}
                    onChange={(e) => setPastHistorySearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Past History Records List */}
              <div className="space-y-2 max-h-96 overflow-y-auto admin-panel-scrollbar">
                {filteredPastHistoryRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">📜</div>
                    <p className="text-white/70 text-sm">Geçmiş anamnez kaydı bulunmuyor.</p>
                    <p className="text-white/50 text-xs mt-2">Hasta Yönetimi sayfasından 📜 butonunu kullanarak geçmiş kayıt ekleyebilirsiniz.</p>
                  </div>
                ) : (
                  filteredPastHistoryRecords.map((record) => {
                    return (
                      <div
                        key={record.id}
                        onClick={() => handleSelectAnamrezRecord(record)}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedAnamrezRecord?.id === record.id
                            ? 'bg-purple-500/20 border border-purple-500/30'
                            : 'bg-white/5 hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-white font-semibold text-sm">{record.patientName}</h3>
                            <p className="text-white/60 text-xs">
                              📅 Geçmiş Tarih: {new Date(record.historyDate || record.createdAt).toLocaleDateString('tr-TR')}
                            </p>
                            <p className="text-white/60 text-xs">
                              Eklendi: {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs">
                              📜 Geçmiş
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Patient Details & Records */}
        <div className="lg:col-span-2 space-y-6">
          {selectedAnamrezRecord && selectedPatient ? (
            <>
              {/* Patient Info */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-white">Hasta Bilgileri</h2>
                    {selectedAnamrezRecord.isPastHistory ? (
                      <div className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs font-semibold">
                        📜 Geçmiş Kayıt
                      </div>
                    ) : selectedAnamrezRecord.isRoutineAnamnez ? (
                      <div className="px-3 py-1 bg-pink-500/20 text-pink-300 rounded-full text-xs font-semibold">
                        💜 Rutin Anamnez
                      </div>
                    ) : selectedAnamrezRecord.status === 'completed' ? (
                      <div className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-semibold">
                        ✅ Anamnez Tamamlandı
                      </div>
                    ) : (
                      <div className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs font-semibold">
                        ⏳ Anamnez Bekliyor
                      </div>
                    )}
                  </div>
                  {selectedAnamrezRecord.status === 'pending' && !selectedAnamrezRecord.isPastHistory && (
                    <button
                      onClick={() => setIsAnamrezModalOpen(true)}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
                    >
                      Anamnez Doldur
                    </button>
                  )}
                  {selectedAnamrezRecord.status === 'completed' && !selectedAnamrezRecord.isPastHistory && (
                    <div className="flex items-center gap-2">
                      {isAnamrezEditable(selectedAnamrezRecord.patientId) ? (
                        <button
                          onClick={() => handleEditAnamrez(selectedAnamrezRecord)}
                          className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 hover:text-blue-200 transition-all duration-200"
                        >
                          ✏️ Düzenle
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-500/20 border border-gray-500/30 rounded-xl">
                          <span className="text-gray-400 text-sm">🔒 Doktora gönderildi</span>
                        </div>
                      )}
                      <button
                        onClick={() => setIsAnamrezViewModalOpen(true)}
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
                      >
                        👁️ Görüntüle
                      </button>
                    </div>
                  )}
                  {selectedAnamrezRecord.isPastHistory && (
                    <button
                      onClick={() => setIsAnamrezViewModalOpen(true)}
                      className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 hover:text-purple-200 transition-all duration-200"
                    >
                      👁️ Detayları Gör
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">Ad Soyad</label>
                    <div className="text-white font-semibold">{selectedPatient.fullName}</div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">TC No</label>
                    <div className="text-white font-semibold">{selectedPatient.tcNo}</div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">Doğum Tarihi</label>
                    <div className="text-white font-semibold">{selectedPatient.birthDate}</div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">Cinsiyet</label>
                    <div className="text-white font-semibold">{selectedPatient.gender}</div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">Telefon</label>
                    <div className="text-white font-semibold">{selectedPatient.phone}</div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-xs font-medium mb-1">Acil Telefon</label>
                    <div className="text-white font-semibold">{selectedPatient.emergencyPhone}</div>
                  </div>
                  {selectedAnamrezRecord.historyDate && (
                    <div>
                      <label className="block text-white/70 text-xs font-medium mb-1">📅 Geçmiş Tarih</label>
                      <div className="text-purple-300 font-semibold">
                        {new Date(selectedAnamrezRecord.historyDate).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                  )}
                  {selectedAnamrezRecord.appointmentDate && !selectedAnamrezRecord.isPastHistory && (
                    <div>
                      <label className="block text-white/70 text-xs font-medium mb-1">Randevu Tarihi</label>
                      <div className="text-white font-semibold">
                        {new Date(selectedAnamrezRecord.appointmentDate).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-white/70 text-xs font-medium mb-1">Başvuru Nedeni</label>
                    <div className="text-white font-semibold">{selectedPatient.visitReason}</div>
                  </div>
                </div>
              </div>

              {/* Routine Anamnez Detail */}
              {selectedAnamrezRecord?.isRoutineAnamnez && selectedAnamrezRecord.routineAnamnezTemplates && (
                <div className="bg-white/10 backdrop-blur-xl border border-pink-500/30 rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span>💜</span> Rutin Anamnez Sonuçları
                  </h2>
                  <div className="space-y-3">
                    {selectedAnamrezRecord.routineAnamnezTemplates.map((template, i) => {
                      const rating = selectedAnamrezRecord.routineAnamnezData?.[template] ?? '-';
                      const note = selectedAnamrezRecord.routineAnamnezNotes?.[template];
                      return (
                        <div key={i} className="bg-white/5 border border-pink-500/20 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium text-sm">{template}</span>
                            <span className="px-3 py-1 bg-pink-500/20 text-pink-300 rounded-full text-sm font-bold">
                              Şiddet: {rating}/10
                            </span>
                          </div>
                          {note && (
                            <p className="text-white/60 text-xs mt-1">Not: {note}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Patient's All Anamnez Records */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Bu Hastanın Tüm Anamnez Kayıtları</h2>

                {getPatientAnamrezRecords(selectedPatient.id).length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">📋</div>
                    <p className="text-white/70">Bu hasta için henüz tamamlanmış anamnez kaydı bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {getPatientAnamrezRecords(selectedPatient.id).map((record) => (
                      <div key={record.id} className="bg-white/5 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                              <span className="text-blue-300 text-sm">📋</span>
                            </div>
                            <div>
                              <h4 className="text-white font-semibold text-sm">
                                {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                              </h4>
                              {record.appointmentDate && (
                                <p className="text-white/60 text-xs">
                                  Randevu: {new Date(record.appointmentDate).toLocaleDateString('tr-TR')}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedAnamrezRecord(record);
                              setIsAnamrezViewModalOpen(true);
                            }}
                            className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-xs transition-all duration-200"
                          >
                            Görüntüle
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <label className="block text-white/60 text-xs mb-1">Ana Şikayet</label>
                            <p className="text-white/90 line-clamp-2">{record.complaintDetails || record.chiefComplaint || '-'}</p>
                          </div>
                          <div>
                            <label className="block text-white/60 text-xs mb-1">Belirtiler</label>
                            <p className="text-white/90">
                              {record.vitalSigns ?
                                `BP: ${record.vitalSigns.bloodPressure || '-'}, Nabız: ${record.vitalSigns.pulse || '-'}`
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="text-center py-12">
                <div className="text-white/50 text-4xl mb-4">👈</div>
                <h3 className="text-xl font-semibold text-white mb-2">Anamnez Kaydı Seçin</h3>
                <p className="text-white/70">
                  Detayları görüntülemek için sol taraftan bir anamnez kaydı seçin
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anamnez Form Modal */}
      <AnamrezFormModal
        isOpen={isAnamrezModalOpen}
        onClose={() => {
          setIsAnamrezModalOpen(false);
          setIsEditMode(false);
          setEditingAnamrezRecord(null);
        }}
        patient={selectedPatient}
        doctorProfile={doctorProfile}
        onAnamrezCompleted={handleAnamrezCompleted}
        anamrezRecordId={selectedAnamrezRecord?.id}
        appointmentId={selectedAnamrezRecord?.appointmentId}
        routineAnamnezTemplates={selectedAnamrezRecord?.isRoutineAnamnez ? selectedAnamrezRecord.routineAnamnezTemplates : undefined}
      />

      {/* Anamnez View Modal */}
      <AnamrezViewModal
        isOpen={isAnamrezViewModalOpen}
        onClose={() => setIsAnamrezViewModalOpen(false)}
        patient={selectedPatient}
        anamrezRecord={selectedAnamrezRecord}
      />
      </div>
    </>
  );
};

export default Anamnez;