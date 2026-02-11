import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AddPatientModal from './AddPatientModal';
import EditPatientModal from '../components/EditPatientModal';
import PatientDetailsModal from './PatientDetailsModal';
import AnamrezFormModal from './AnamrezFormModal';
import DischargeSurveyModal from '../components/DischargeSurveyModal';

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
  emergencyPhoneOwner: string;
  fatherName: string;
  birthPlace: string;
  registeredProvince: string;
  registrationDate: string;
  visitReason: string;
  createdAt: string;
  updatedAt: string;
  treatmentOptions?: TreatmentOptions;
  treatmentStartedAt?: string;
  treatmentCompletedAt?: string;
  status?: string;
  clinicId?: string;
  paymentCompleted?: boolean;
  assignedDoctorName?: string;
  optionalScans?: {
    hasMediaGallery?: boolean;
    [key: string]: any;
  };
  mediaFiles?: any[];
}

interface PatientsProps {
  doctorProfile?: any;
}

const Patients: React.FC<PatientsProps> = ({ doctorProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [treatmentCompletedPatients, setTreatmentCompletedPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedPatientForDetails, setSelectedPatientForDetails] = useState<Patient | null>(null);
  const [isPastHistoryModalOpen, setIsPastHistoryModalOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [selectedPatientForSurvey, setSelectedPatientForSurvey] = useState<Patient | null>(null);

  // Fetch patients from Firestore
  const fetchPatients = async () => {
    try {
      setLoading(true);

      // Check if doctorProfile and clinicId exist
      if (!doctorProfile?.clinicId) {
        setPatients([]);
        return;
      }

      const patientsRef = collection(db, 'patients');
      const q = query(
        patientsRef,
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const querySnapshot = await getDocs(q);

      const patientsData: Patient[] = [];
      querySnapshot.forEach((doc) => {
        patientsData.push({
          id: doc.id,
          ...doc.data()
        } as Patient);
      });

      // Sort manually by createdAt (newest first)
      patientsData.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      // Filter treatment completed patients (ready for discharge)
      const completedPatients = patientsData.filter(patient =>
        patient.status === 'treatment_completed' && patient.paymentCompleted === true
      ).sort((a, b) => {
        const dateA = new Date(a.treatmentCompletedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.treatmentCompletedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      setTreatmentCompletedPatients(completedPatients);
      setPatients(patientsData);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchPatients();
    }
  }, [doctorProfile?.clinicId]);
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

  // Toggle patient active/passive status
  const togglePatientStatus = async (patient: Patient) => {
    try {
      const newStatus = patient.status === 'passive' ? 'active' : 'passive';
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, { status: newStatus });

      // Update local state
      setPatients(prevPatients =>
        prevPatients.map(p =>
          p.id === patient.id ? { ...p, status: newStatus } : p
        )
      );
    } catch (error) {
      console.error('Error toggling patient status:', error);
    }
  };

  // Discharge patient - open survey modal first
  const handleDischargePatient = (patient: Patient) => {
    setSelectedPatientForSurvey(patient);
    setIsSurveyModalOpen(true);
  };

  // Called after survey is completed or skipped
  const handleSurveyCompleted = () => {
    if (selectedPatientForSurvey) {
      // Remove from treatment completed list
      setTreatmentCompletedPatients(prev => prev.filter(p => p.id !== selectedPatientForSurvey.id));

      // Update in main patients list
      setPatients(prevPatients =>
        prevPatients.map(p =>
          p.id === selectedPatientForSurvey.id ? { ...p, status: 'discharged' } : p
        )
      );

      console.log(`✅ Patient discharged: ${selectedPatientForSurvey.fullName}`);
    }
    
    setIsSurveyModalOpen(false);
    setSelectedPatientForSurvey(null);
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient.tcNo && patient.tcNo.includes(searchTerm)) ||
      (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (patient.phone && patient.phone.includes(searchTerm));

    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'active' && patient.status !== 'passive') ||
      (filterStatus === 'passive' && patient.status === 'passive');
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Hasta Yönetimi</h1>
          <p className="text-white/70">Hasta listesi ve bilgileri</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-200 shadow-lg"
        >
          + Yeni Hasta Ekle
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/60">🔍</span>
              </div>
              <input
                type="text"
                placeholder="Hasta adı, TC No veya email ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Tüm Hastalar</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { title: 'Toplam Hasta', value: patients.length.toString(), icon: '👥', color: 'from-blue-500 to-cyan-500' },
          { title: 'Aktif Hasta', value: patients.filter(p => p.status !== 'passive').length.toString(), icon: '✅', color: 'from-green-500 to-emerald-500' },
          {
            title: 'Bu Ay Yeni', value: patients.filter(p => {
              const createdAt = new Date(p.createdAt);
              const now = new Date();
              return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
            }).length.toString(), icon: '🆕', color: 'from-yellow-500 to-orange-500'
          },
          { title: 'Pasif Hasta', value: patients.filter(p => p.status === 'passive').length.toString(), icon: '⏸️', color: 'from-gray-500 to-gray-600' }
        ].map((stat, index) => (
        <div key={index} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
              <span className="text-white text-xl">{stat.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-white/70 text-sm">{stat.title}</div>
            </div>
          </div>
        </div>
      ))}
      </div>

      {/* Treatment Completed Patients - Ready for Discharge */}
      {treatmentCompletedPatients.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 backdrop-blur-xl border-2 border-emerald-400/50 rounded-2xl overflow-hidden shadow-lg shadow-emerald-500/10">
          <div className="p-6 border-b border-emerald-400/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-500 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                  <span className="text-2xl">🏁</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Tedavisi Tamamlananlar</h2>
                  <p className="text-emerald-200/80 text-sm">Çıkış için bekleyen hastalar</p>
                </div>
              </div>
              <div className="bg-emerald-500/30 px-4 py-2 rounded-full border border-emerald-400/50">
                <span className="text-emerald-200 font-bold text-lg">{treatmentCompletedPatients.length}</span>
                <span className="text-emerald-300/70 ml-1 text-sm">hasta</span>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {treatmentCompletedPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/15 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-lg">
                          {patient.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">{patient.fullName}</h3>
                        <p className="text-white/60 text-sm">{calculateAge(patient.birthDate)} yaş, {patient.gender}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-emerald-500/30 border border-emerald-400/50 rounded-full text-emerald-200 text-xs font-medium">
                      ✓ Tamamlandı
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-white/70 text-sm">
                      <span>📋</span>
                      <span>TC: {patient.tcNo}</span>
                    </div>
                    {patient.assignedDoctorName && (
                      <div className="flex items-center gap-2 text-white/70 text-sm">
                        <span>👨‍⚕️</span>
                        <span>{patient.assignedDoctorName}</span>
                      </div>
                    )}
                    {patient.treatmentCompletedAt && (
                      <div className="flex items-center gap-2 text-white/70 text-sm">
                        <span>🕐</span>
                        <span>
                          {new Date(patient.treatmentCompletedAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDischargePatient(patient)}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-600 hover:to-green-600 hover:scale-[1.02] shadow-lg hover:shadow-emerald-500/30"
                  >
                    <span>🚪</span>
                    Hasta Çıkışı Yap
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Patients Table */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/20">
          <h2 className="text-xl font-bold text-white">Hasta Listesi</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">Hasta</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">TC No</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">Telefon</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">Email</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">İkamet</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">Durum</th>
                <th className="px-6 py-4 text-left text-white/80 font-semibold">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredPatients.map((patient) => {
                const needsMediaUpload = patient.optionalScans?.hasMediaGallery && (!patient.mediaFiles || patient.mediaFiles.length === 0);
                return (
                <tr key={patient.id} className={`transition-colors duration-200 ${
                  needsMediaUpload 
                    ? 'bg-pink-500/15 hover:bg-pink-500/25 border-l-4 border-l-pink-400' 
                    : 'hover:bg-white/5'
                }`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {patient.fullName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-semibold flex items-center gap-2">
                          {patient.fullName}
                          {needsMediaUpload && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-500/30 border border-pink-400/50 rounded-full text-pink-200 text-xs font-medium animate-pulse" title="Fotoğraf/Video yüklenmesi gerekiyor">
                              📷 Medya Bekleniyor
                            </span>
                          )}
                        </div>
                        <div className="text-white/60 text-sm">{calculateAge(patient.birthDate)} yaş, {patient.gender}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white">{patient.tcNo}</td>
                  <td className="px-6 py-4 text-white">{patient.phone}</td>
                  <td className="px-6 py-4 text-white">{patient.email}</td>
                  <td className="px-6 py-4 text-white">
                    {(patient as any).residenceCity 
                      ? `${(patient as any).country || 'Türkiye'} / ${(patient as any).residenceCity}` 
                      : (patient as any).registrationDate 
                        ? formatDate((patient as any).registrationDate) 
                        : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      patient.status === 'passive'
                        ? 'bg-gray-500/20 text-gray-300'
                        : 'bg-green-500/20 text-green-300'
                    }`}>
                      {patient.status === 'passive' ? 'Pasif' : 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedPatientForDetails(patient);
                          setIsDetailsModalOpen(true);
                        }}
                        className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => {
                          setSelectedPatientForHistory(patient);
                          setIsPastHistoryModalOpen(true);
                        }}
                        className="p-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-300 hover:text-purple-200 transition-all duration-200"
                        title="Geçmiş Kayıt Ekle"
                      >
                        📜
                      </button>
                      <button
                        onClick={() => {
                          setSelectedPatient(patient);
                          setIsEditModalOpen(true);
                        }}
                        className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-300 hover:text-green-200 transition-all duration-200"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => togglePatientStatus(patient)}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          patient.status === 'passive'
                            ? 'bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-300 hover:text-gray-200'
                            : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 hover:text-green-200'
                        }`}
                        title={patient.status === 'passive' ? 'Aktif Yap' : 'Pasif Yap'}
                      >
                        {patient.status === 'passive' ? '🔴' : '🟢'}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredPatients.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-white/60">Hasta bulunamadı</div>
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      <AddPatientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onPatientAdded={fetchPatients}
        doctorProfile={doctorProfile}
      />

      {/* Edit Patient Modal */}
      <EditPatientModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedPatient(null);
        }}
        onPatientUpdated={fetchPatients}
        patient={selectedPatient}
        doctorProfile={doctorProfile}
      />

      {/* Patient Details Modal */}
      <PatientDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedPatientForDetails(null);
        }}
        patient={selectedPatientForDetails}
      />

      {/* Past History Modal - Using AnamrezFormModal in past history mode */}
      <AnamrezFormModal
        isOpen={isPastHistoryModalOpen}
        onClose={() => {
          setIsPastHistoryModalOpen(false);
          setSelectedPatientForHistory(null);
        }}
        patient={selectedPatientForHistory}
        doctorProfile={doctorProfile}
        onAnamrezCompleted={() => {
          fetchPatients();
          setIsPastHistoryModalOpen(false);
          setSelectedPatientForHistory(null);
        }}
        isPastHistory={true}
      />

      {/* Discharge Survey Modal */}
      <DischargeSurveyModal
        isOpen={isSurveyModalOpen}
        onClose={() => {
          setIsSurveyModalOpen(false);
          setSelectedPatientForSurvey(null);
        }}
        patient={selectedPatientForSurvey}
        onSurveyCompleted={handleSurveyCompleted}
      />
    </div>
  );
};

export default Patients; 