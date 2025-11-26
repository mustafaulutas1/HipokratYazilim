import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
}

const Anamnez: React.FC<AnamrezProps> = ({ doctorProfile }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pendingAnamrezRecords, setPendingAnamrezRecords] = useState<AnamrezRecord[]>([]);
  const [completedAnamrezRecords, setCompletedAnamrezRecords] = useState<AnamrezRecord[]>([]);
  const [selectedAnamrezRecord, setSelectedAnamrezRecord] = useState<AnamrezRecord | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [completedSearchTerm, setCompletedSearchTerm] = useState('');
  const [isAnamrezModalOpen, setIsAnamrezModalOpen] = useState(false);
  const [isAnamrezViewModalOpen, setIsAnamrezViewModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

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
      const pendingRecords = allAnamrezRecords.filter(r => r.status === 'pending');
      const completedRecords = allAnamrezRecords.filter(r => r.status === 'completed');

      // Sort by creation date
      pendingRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      completedRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('📋 Anamnez: Found pending records:', pendingRecords.length);
      console.log('✅ Anamnez: Found completed records:', completedRecords.length);

      setPendingAnamrezRecords(pendingRecords);
      setCompletedAnamrezRecords(completedRecords);

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

  // Get patient by ID
  const getPatientById = (patientId: string): Patient | undefined => {
    return patients.find(p => p.id === patientId);
  };

  // Get all anamnez records for a patient
  const getPatientAnamrezRecords = (patientId: string) => {
    return completedAnamrezRecords.filter(record => record.patientId === patientId);
  };

  // Handle selecting an anamnez record
  const handleSelectAnamrezRecord = (record: AnamrezRecord) => {
    setSelectedAnamrezRecord(record);
    const patient = getPatientById(record.patientId);
    if (patient) {
      setSelectedPatient(patient);
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
              className={`relative flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
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
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'completed'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'text-white/70 hover:text-white/90'
              }`}
            >
              Tamamlanan ({completedAnamrezRecords.length})
            </button>
          </div>

          {activeTab === 'pending' ? (
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
                          </div>
                          <div className="text-right">
                            <div className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs">
                              Bekliyor
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
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
                    {selectedAnamrezRecord.status === 'completed' ? (
                      <div className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-semibold">
                        ✅ Anamnez Tamamlandı
                      </div>
                    ) : (
                      <div className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs font-semibold">
                        ⏳ Anamnez Bekliyor
                      </div>
                    )}
                  </div>
                  {selectedAnamrezRecord.status === 'pending' && (
                    <button
                      onClick={() => setIsAnamrezModalOpen(true)}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
                    >
                      Anamnez Doldur
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
                  {selectedAnamrezRecord.appointmentDate && (
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
        onClose={() => setIsAnamrezModalOpen(false)}
        patient={selectedPatient}
        doctorProfile={doctorProfile}
        onAnamrezCompleted={handleAnamrezCompleted}
        anamrezRecordId={selectedAnamrezRecord?.id}
        appointmentId={selectedAnamrezRecord?.appointmentId}
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