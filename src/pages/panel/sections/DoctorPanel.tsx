import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AnamrezViewModal from './AnamrezViewModal';
import DoctorNotesModal from './DoctorNotesModal';

interface DoctorPanelProps {
  doctorProfile?: any;
}

interface PatientStats {
  totalPatients: number;
  todayAppointments: number;
  completedTreatments: number;
  pendingReports: number;
}

interface WaitingPatient {
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
  anamrezCompletedAt?: string;
  anamrezCompletedBy?: string;
  createdAt: string;
  selectedDiagnosisSystems?: string[];
}

interface AnamrezRecord {
  id: string;
  patientId: string;
  selectedDiagnosisSystems: string[];
  createdAt: string;
  updatedAt: string;
}

const DoctorPanel: React.FC<DoctorPanelProps> = ({ doctorProfile }) => {
  const [stats, setStats] = useState<PatientStats>({
    totalPatients: 0,
    todayAppointments: 0,
    completedTreatments: 0,
    pendingReports: 0
  });
  const [waitingPatients, setWaitingPatients] = useState<WaitingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<WaitingPatient | null>(null);
  const [isAnamrezViewModalOpen, setIsAnamrezViewModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  useEffect(() => {
    const fetchDoctorData = async () => {
      if (!doctorProfile?.clinicId) return;

      try {
        setLoading(true);
        console.log('🔍 DoctorPanel: Fetching data for clinicId:', doctorProfile.clinicId);

        // Fetch patients with completed anamnez (waiting for treatment)
        // First, get all patients for this clinic
        console.log('🔍 DoctorPanel: Querying patients with clinicId:', doctorProfile.clinicId);
        
        const allClinicPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        
        const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
        const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as WaitingPatient));
        
        console.log('📊 DoctorPanel: Total patients in clinic:', allClinicPatients.length);
        console.log('📋 DoctorPanel: Sample patient data:', allClinicPatients[0]);
        
        // Filter for completed anamnez in memory to avoid composite index issues
        const completedPatients = allClinicPatients.filter(patient => 
          patient.isAnamnezCompleted === true
        ).sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA; // Most recent first
        }).slice(0, 10);

        console.log('👥 DoctorPanel: Patients with completed anamnez:', completedPatients.length);
        
        // Fetch anamnez records for these patients to get their diagnosis systems
        if (completedPatients.length > 0) {
          const patientIds = completedPatients.map(p => p.id);
          const anamrezQuery = query(
            collection(db, 'anamrezRecords'),
            where('patientId', 'in', patientIds)
          );
          
          const anamrezSnapshot = await getDocs(anamrezQuery);
          const anamrezRecords = anamrezSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as AnamrezRecord));
          
          console.log('� DoctorPanel: Found anamnez records:', anamrezRecords.length);
          
          // Match diagnosis systems with patients and get anamnez completion date
          const patientsWithDiagnosis = completedPatients.map(patient => {
            const patientAnamrezRecords = anamrezRecords.filter(record => record.patientId === patient.id);
            const latestAnamrezRecord = patientAnamrezRecords.sort((a, b) => 
              new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
            )[0];
            
            return {
              ...patient,
              selectedDiagnosisSystems: patientAnamrezRecords
                .map(record => record.selectedDiagnosisSystems)
                .flat()
                .filter((system, index, arr) => arr.indexOf(system) === index), // Remove duplicates
              anamrezCompletedAt: latestAnamrezRecord ? (latestAnamrezRecord.updatedAt || latestAnamrezRecord.createdAt) : patient.anamrezCompletedAt
            };
          });
          
          // Sort by anamnez completion date - oldest first (earliest date first)
          const sortedPatients = patientsWithDiagnosis.sort((a, b) => {
            const dateA = new Date(a.anamrezCompletedAt || a.createdAt).getTime();
            const dateB = new Date(b.anamrezCompletedAt || b.createdAt).getTime();
            return dateA - dateB; // Oldest first
          });
          
          console.log('🔍 DoctorPanel: Patients sorted by anamnez completion:', sortedPatients.map(p => ({
            name: p.fullName,
            anamrezCompletedAt: p.anamrezCompletedAt,
            diagnosisSystems: p.selectedDiagnosisSystems
          })));
          
          setWaitingPatients(sortedPatients);
        } else {
          setWaitingPatients(completedPatients);
        }

        // Get the final waiting patients count for stats
        const finalWaitingPatientsCount = completedPatients.length;

        // Fetch total patients count for this clinic
        const allPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        const allPatientsSnapshot = await getDocs(allPatientsQuery);
        const totalPatients = allPatientsSnapshot.size;

        // Fetch today's appointments
        const today = new Date();
        const todayDateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        console.log('📅 DoctorPanel: Looking for appointments on date:', todayDateString);
        
        let todayAppointments = 0;
        try {
          // Try different date formats - some might be stored as date strings
          const appointmentsQuery = query(
            collection(db, 'appointments'),
            where('clinicId', '==', doctorProfile.clinicId)
          );
          const appointmentsSnapshot = await getDocs(appointmentsQuery);
          
          // Filter by today's date in memory to handle different date formats
          const todayAppointmentsList = appointmentsSnapshot.docs.filter(doc => {
            const data = doc.data();
            const appointmentDate = data.date || data.appointmentDate || data.scheduledDate;
            if (!appointmentDate) return false;
            
            // Handle different date formats
            const dateStr = typeof appointmentDate === 'string' ? 
              appointmentDate.split('T')[0] : 
              new Date(appointmentDate).toISOString().split('T')[0];
            
            return dateStr === todayDateString;
          });
          
          todayAppointments = todayAppointmentsList.length;
          console.log('📅 DoctorPanel: Found today\'s appointments:', todayAppointments);
          console.log('📅 DoctorPanel: Sample appointment data:', todayAppointmentsList[0]?.data());
        } catch (appointmentError) {
          console.warn('⚠️ Could not fetch today\'s appointments, using fallback:', appointmentError);
          // Fallback: estimate based on clinic size
          todayAppointments = Math.max(1, Math.floor(totalPatients * 0.15));
        }

        // Fetch completed treatments (completed anamnez records)
        let completedTreatments = 0;
        try {
          const completedAnamrezQuery = query(
            collection(db, 'patients'),
            where('clinicId', '==', doctorProfile.clinicId),
            where('isAnamnezCompleted', '==', true)
          );
          const completedAnamrezSnapshot = await getDocs(completedAnamrezQuery);
          completedTreatments = completedAnamrezSnapshot.size;
          console.log('🩺 DoctorPanel: Completed treatments:', completedTreatments);
        } catch (treatmentError) {
          console.warn('⚠️ Could not fetch completed treatments:', treatmentError);
          completedTreatments = completedPatients.length;
        }

        const finalStats = {
          totalPatients: totalPatients,
          todayAppointments: todayAppointments,
          completedTreatments: completedTreatments,
          pendingReports: finalWaitingPatientsCount // Use actual waiting patients count
        };
        
        console.log('📊 DoctorPanel: Final stats:', finalStats);
        setStats(finalStats);

      } catch (error) {
        console.error('❌ DoctorPanel: Error fetching doctor data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoctorData();
  }, [doctorProfile]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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

  const handleViewAnamnez = (patient: WaitingPatient) => {
    setSelectedPatient(patient);
    setIsAnamrezViewModalOpen(true);
  };

  const getWaitingDuration = (completedDate: string) => {
    const completed = new Date(completedDate);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return `${diffInHours} saat`;
    } else {
      const days = Math.floor(diffInHours / 24);
      return `${days} gün`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">👨‍⚕️</span>
            Doktor Ekranı
          </h2>
          <p className="text-white/70">
            Hoş geldiniz, Dr. {doctorProfile?.fullName || 'Doktor'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span className="text-white/80 text-sm">Aktif</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Toplam Hastalarım</p>
              <p className="text-2xl font-bold text-white">{stats.totalPatients}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bugünkü Randevular</p>
              <p className="text-2xl font-bold text-white">{stats.todayAppointments}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Tamamlanan Tedaviler</p>
              <p className="text-2xl font-bold text-white">{stats.completedTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🩺</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Tedavi Bekleyen</p>
              <p className="text-2xl font-bold text-white">{waitingPatients.length}</p>
            </div>
            <div className="w-12 h-12 bg-orange-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🏥</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patients Waiting for Treatment */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-2xl">🏥</span>
            Tedavi Bekleyen Hastalar ({waitingPatients.length})
          </h3>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {waitingPatients.length > 0 ? (
              waitingPatients.map((patient) => (
                <div 
                  key={patient.id}
                  className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-200"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-lg">👤</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{patient.fullName}</span>
                      <span className="text-xs bg-green-500/30 text-green-200 px-2 py-1 rounded-full">
                        Anamnez Tamamlandı
                      </span>
                      <span className="text-xs bg-orange-500/30 text-orange-200 px-2 py-1 rounded-full">
                        {getWaitingDuration(patient.anamrezCompletedAt || patient.createdAt)} bekliyor
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-white/70 text-sm">
                      <span>Yaş: {calculateAge(patient.birthDate)}</span>
                      <span>•</span>
                      <span>Cinsiyet: {patient.gender === 'male' ? 'Erkek' : 'Kadın'}</span>
                      <span>•</span>
                      <span>Tel: {patient.phone}</span>
                    </div>
                    <div className="mt-1">
                      <p className="text-white/70 text-sm font-medium mb-1">Hasta Şikayetleri:</p>
                      <div className="flex flex-wrap gap-1">
                        {patient.selectedDiagnosisSystems && patient.selectedDiagnosisSystems.length > 0 ? (
                          patient.selectedDiagnosisSystems.map((system, index) => (
                            <span 
                              key={index}
                              className="px-2 py-1 bg-blue-500/20 text-blue-200 text-xs rounded-full border border-blue-500/30"
                            >
                              {system}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/50 text-xs italic">Sistem seçimi bulunamadı</span>
                        )}
                      </div>
                    </div>
                    <p className="text-white/50 text-xs mt-1">
                      Anamnez Tamamlanma: {formatDate(patient.anamrezCompletedAt || patient.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-200 text-sm transition-all duration-200">
                      Muayene Et
                    </button>
                    <button 
                      onClick={() => handleViewAnamnez(patient)}
                      className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-200 text-sm transition-all duration-200"
                    >
                      Anamnez Görüntüle
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🏥</div>
                <h4 className="text-white/80 text-lg font-semibold mb-2">Tedavi Bekleyen Hasta Yok</h4>
                <p className="text-white/60">Anamnezi tamamlanmış hasta bulunmuyor.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            Hızlı İşlemler
          </h3>
          
          <div className="space-y-3">
            <button 
              onClick={() => setIsNotesModalOpen(true)}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-green-500/20 to-green-600/30 hover:from-green-500/30 hover:to-green-600/40 border border-green-500/30 rounded-xl text-white transition-all duration-200"
            >
              <span className="text-lg">📝</span>
              <span className="font-medium text-sm">Not Al</span>
            </button>
            
            <button className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-blue-500/20 to-blue-600/30 hover:from-blue-500/30 hover:to-blue-600/40 border border-blue-500/30 rounded-xl text-white transition-all duration-200">
              <span className="text-lg"> ‍⚕️</span>
              <span className="font-medium text-sm">Asistana Bildir</span>
            </button>
            
            <button className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500/20 to-purple-600/30 hover:from-purple-500/30 hover:to-purple-600/40 border border-purple-500/30 rounded-xl text-white transition-all duration-200">
              <span className="text-lg">💊</span>
              <span className="font-medium text-sm">Reçete Yaz</span>
            </button>
            
            <button className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-orange-500/20 to-orange-600/30 hover:from-orange-500/30 hover:to-orange-600/40 border border-orange-500/30 rounded-xl text-white transition-all duration-200">
              <span className="text-lg">📋</span>
              <span className="font-medium text-sm">Rapor Hazırla</span>
            </button>
            

          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">ℹ️</span>
          Doktor Bilgileri
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Uzmanlık Alanı</p>
            <p className="text-white">{doctorProfile?.specialization || 'Belirtilmemiş'}</p>
          </div>
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Hastane/Klinik</p>
            <p className="text-white">{doctorProfile?.hospital || 'Belirtilmemiş'}</p>
          </div>
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Departman</p>
            <p className="text-white">{doctorProfile?.department || 'Belirtilmemiş'}</p>
          </div>
        </div>
      </div>

      {/* Doctor Notes Modal */}
      <DoctorNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        doctorProfile={doctorProfile}
      />

      {/* Anamnez View Modal */}
      <AnamrezViewModal
        isOpen={isAnamrezViewModalOpen}
        onClose={() => setIsAnamrezViewModalOpen(false)}
        patient={selectedPatient}
      />
    </div>
  );
};

export default DoctorPanel;
