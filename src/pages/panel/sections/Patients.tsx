import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AddPatientModal from './AddPatientModal';
import EditPatientModal from '../components/EditPatientModal';
import PatientDetailsModal from './PatientDetailsModal';
import AnamrezFormModal from './AnamrezFormModal';
import DischargeSurveyModal from '../components/DischargeSurveyModal';
import SurveyAnalyticsModal from '../components/SurveyAnalyticsModal';

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
  photoURL?: string;
}

interface PatientsProps {
  doctorProfile?: any;
}

const PATIENTS_PER_PAGE = 10;

const Patients: React.FC<PatientsProps> = ({ doctorProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTodayAppointments, setFilterTodayAppointments] = useState(false);
  const [todayAppointmentPatientIds, setTodayAppointmentPatientIds] = useState<Set<string>>(new Set());
  const [patients, setPatients] = useState<Patient[]>([]); // Firebase cursor pagination için
  const [allPatients, setAllPatients] = useState<Patient[]>([]); // arama/filtre/stats için tam liste
  const [treatmentCompletedPatients, setTreatmentCompletedPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedPatientForDetails, setSelectedPatientForDetails] = useState<Patient | null>(null);
  const [isPastHistoryModalOpen, setIsPastHistoryModalOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [selectedPatientForSurvey, setSelectedPatientForSurvey] = useState<Patient | null>(null);
  const [isSurveyAnalyticsOpen, setIsSurveyAnalyticsOpen] = useState(false);

  const fetchTodayAppointmentPatients = async () => {
    if (!doctorProfile?.clinicId) return;
    const today = new Date();
    const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const q = query(
      collection(db, 'appointments'),
      where('clinicId', '==', doctorProfile.clinicId),
      where('dateISO', '==', dateISO)
    );
    const snap = await getDocs(q);
    const ids = new Set<string>();
    snap.forEach(d => {
      const pid = d.data().patientId;
      if (pid) ids.add(pid);
    });
    setTodayAppointmentPatientIds(ids);
  };

  // Sayfa bazlı yükleme — allPatients'tan slice alır (index bağımlılığı yok)
  const fetchPage = useCallback(async (clinicId: string, page: number) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'patients'),
        where('clinicId', '==', clinicId)
      );
      const snap = await getDocs(q);
      const allData: Patient[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Patient))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      // allPatients'ı da güncelle (fetchAllPatients ile senkron)
      setAllPatients(allData);
      const completed = allData
        .filter(p => p.status === 'treatment_completed' && p.paymentCompleted === true)
        .sort((a, b) => new Date(b.treatmentCompletedAt || b.createdAt || 0).getTime() - new Date(a.treatmentCompletedAt || a.createdAt || 0).getTime());
      setTreatmentCompletedPatients(completed);

      // O sayfanın dilimini göster
      const start = (page - 1) * PATIENTS_PER_PAGE;
      setPatients(allData.slice(start, start + PATIENTS_PER_PAGE));
    } catch (e) {
      console.error('fetchPage error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // İlk yükleme ve yenileme
  const fetchPatients = useCallback(async () => {
    const clinicId = doctorProfile?.clinicId;
    if (!clinicId) return;
    setCurrentPage(1);
    await fetchPage(clinicId, 1);
  }, [doctorProfile?.clinicId, fetchPage]);

  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorProfile?.clinicId]);

  // Sayfa değişince patients dilimini güncelle (allPatients zaten yüklü)
  useEffect(() => {
    if (allPatients.length === 0) return;
    const hasFilter = searchTerm.trim() !== '' || filterStatus !== 'all' || filterTodayAppointments;
    if (!hasFilter) {
      const start = (currentPage - 1) * PATIENTS_PER_PAGE;
      setPatients(allPatients.slice(start, start + PATIENTS_PER_PAGE));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Arama/filtre değiştiğinde sayfayı sıfırla
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterTodayAppointments]);
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


  const handleDeletePatient = async (patient: Patient) => {
    if (!window.confirm(`"${patient.fullName}" adlı hasta kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?`)) return;
    try {
      await deleteDoc(doc(db, 'patients', patient.id));
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      setAllPatients(prev => prev.filter(p => p.id !== patient.id));
      setTreatmentCompletedPatients(prev => prev.filter(p => p.id !== patient.id));
    } catch (error) {
      console.error('Hasta silinirken hata:', error);
      alert('Hasta silinirken bir hata oluştu.');
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

  const handleToggleTodayAppointments = async () => {
    if (!filterTodayAppointments) {
      await fetchTodayAppointmentPatients();
    }
    setFilterTodayAppointments(prev => !prev);
  };

  const filteredPatients = useMemo(() => {
    const hasFilter = searchTerm.trim() !== '' || filterStatus !== 'all' || filterTodayAppointments;

    // Arama/filtre aktifse tüm listede ara, yoksa sadece o anki sayfada filtrele
    const source = hasFilter ? allPatients : patients;

    return source.filter(patient => {
      const matchesSearch = !searchTerm.trim() ||
        patient.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (patient.tcNo && patient.tcNo.includes(searchTerm)) ||
        (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (patient.phone && patient.phone.includes(searchTerm));

      const matchesFilter = filterStatus === 'all' ||
        (filterStatus === 'active' && patient.status !== 'passive') ||
        (filterStatus === 'passive' && patient.status === 'passive');

      const matchesTodayAppointment = !filterTodayAppointments || todayAppointmentPatientIds.has(patient.id);

      return matchesSearch && matchesFilter && matchesTodayAppointment;
    });
  }, [searchTerm, filterStatus, filterTodayAppointments, allPatients, patients, todayAppointmentPatientIds]);

  const hasActiveFilter = searchTerm.trim() !== '' || filterStatus !== 'all' || filterTodayAppointments;

  // Client-side pagination (arama/filtre aktifken)
  const totalPages = hasActiveFilter
    ? Math.ceil(filteredPatients.length / PATIENTS_PER_PAGE)
    : Math.ceil(allPatients.length / PATIENTS_PER_PAGE);

  const displayedPatients = hasActiveFilter
    ? filteredPatients.slice((currentPage - 1) * PATIENTS_PER_PAGE, currentPage * PATIENTS_PER_PAGE)
    : filteredPatients; // Firebase cursor pagination zaten sayfalı veriyi getiriyor

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { title: 'Toplam Hasta', value: allPatients.length.toString(), icon: '👥', color: 'from-blue-500 to-cyan-500' },
          {
            title: 'Bu Ay Yeni', value: allPatients.filter(p => {
              const createdAt = new Date(p.createdAt);
              const now = new Date();
              return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
            }).length.toString(), icon: '🆕', color: 'from-yellow-500 to-orange-500'
          },
          { title: 'Pasif Hasta', value: allPatients.filter(p => p.status === 'passive').length.toString(), icon: '⏸️', color: 'from-gray-500 to-gray-600' }
        ].map((stat, index) => (
          <div key={index} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <span className="text-white text-lg">{stat.icon}</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-white/70 text-sm">{stat.title}</div>
              </div>
            </div>
          </div>
        ))}

        {/* 5th Card – Memnuniyet Anketi (3D physical button) */}
        <button
          onClick={() => setIsSurveyAnalyticsOpen(true)}
          className="relative group text-left rounded-2xl p-5 overflow-hidden cursor-pointer select-none"
          style={{
            background: 'linear-gradient(145deg, #5b21b6 0%, #7c3aed 50%, #be185d 100%)',
            boxShadow: [
              'inset 0 1px 0 rgba(255,255,255,0.2)',   /* top highlight */
              'inset 0 -5px 0 rgba(0,0,0,0.4)',         /* bottom inner edge = slab depth */
              '0 6px 0 #2e0a66',                        /* solid bottom "floor" */
              '0 10px 20px rgba(109,40,217,0.5)',        /* ambient glow */
              '0 2px 6px rgba(0,0,0,0.5)',              /* base shadow */
            ].join(', '),
            border: '1px solid rgba(196,158,254,0.4)',
            transform: 'translateY(0)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            el.style.transform = 'translateY(-5px)';
            el.style.boxShadow = [
              'inset 0 1px 0 rgba(255,255,255,0.25)',
              'inset 0 -5px 0 rgba(0,0,0,0.4)',
              '0 11px 0 #2e0a66',
              '0 16px 28px rgba(109,40,217,0.6)',
              '0 4px 10px rgba(0,0,0,0.5)',
            ].join(', ');
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.transform = 'translateY(0)';
            el.style.boxShadow = [
              'inset 0 1px 0 rgba(255,255,255,0.2)',
              'inset 0 -5px 0 rgba(0,0,0,0.4)',
              '0 6px 0 #2e0a66',
              '0 10px 20px rgba(109,40,217,0.5)',
              '0 2px 6px rgba(0,0,0,0.5)',
            ].join(', ');
          }}
          onMouseDown={e => {
            const el = e.currentTarget;
            el.style.transform = 'translateY(4px)';
            el.style.boxShadow = [
              'inset 0 1px 0 rgba(255,255,255,0.12)',
              'inset 0 -2px 0 rgba(0,0,0,0.4)',
              '0 2px 0 #2e0a66',
              '0 4px 10px rgba(109,40,217,0.3)',
              '0 1px 3px rgba(0,0,0,0.5)',
            ].join(', ');
          }}
          onMouseUp={e => {
            const el = e.currentTarget;
            el.style.transform = 'translateY(-5px)';
            el.style.boxShadow = [
              'inset 0 1px 0 rgba(255,255,255,0.25)',
              'inset 0 -5px 0 rgba(0,0,0,0.4)',
              '0 11px 0 #2e0a66',
              '0 16px 28px rgba(109,40,217,0.6)',
              '0 4px 10px rgba(0,0,0,0.5)',
            ].join(', ');
          }}
        >
          {/* Animated attention glow ring */}
          <span
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: '0 0 0 0 rgba(167,139,250,0.6)',
              animation: 'surveyPulse 2.2s ease-out infinite',
            }}
          />
          <style>{`
            @keyframes surveyPulse {
              0%   { box-shadow: 0 0 0 0   rgba(167,139,250,0.55); }
              70%  { box-shadow: 0 0 0 10px rgba(167,139,250,0);   }
              100% { box-shadow: 0 0 0 0   rgba(167,139,250,0);   }
            }
          `}</style>

          {/* Directional top-left light (3D surface illusion) */}
          <div
            className="absolute top-0 left-0 w-2/3 h-1/2 rounded-tl-2xl pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
          />
          {/* Right-side shadow for depth */}
          <div
            className="absolute top-0 right-0 w-1/4 h-full pointer-events-none"
            style={{ background: 'linear-gradient(270deg, rgba(0,0,0,0.15) 0%, transparent 100%)' }}
          />

          {/* Content */}
          <div className="relative flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.25), 0 3px 8px rgba(0,0,0,0.3)',
              }}
            >
              📊
            </div>
            <div>
              <div className="text-2xl font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                {allPatients.filter(p => (p as any).dischargeSurvey).length}
              </div>
              <div className="text-purple-100 text-sm font-semibold tracking-wide">Memnuniyet Anketi</div>
            </div>
          </div>

          {/* Bottom hint bar */}
          <div
            className="relative mt-3 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.13)', paddingTop: '8px' }}
          >
            <span className="text-purple-200/75 text-xs">Analizi Görüntüle →</span>
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{
                background: 'rgba(255,255,255,0.9)',
                color: '#5b21b6',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25), inset 0 -1px 0 rgba(0,0,0,0.1)',
              }}
            >
              👆 Tıkla
            </span>
          </div>
        </button>
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
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 shadow-lg">
                        {patient.photoURL ? (
                          <img src={patient.photoURL} alt={patient.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {patient.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                        )}
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
        <div className="p-6 border-b border-white/20 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Hasta Listesi</h2>
          <button
            onClick={handleToggleTodayAppointments}
            className={`px-4 py-2 border rounded-xl font-semibold text-sm transition-all duration-200 ${
              filterTodayAppointments
                ? 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
            }`}
          >
            📅 Randevusu Olanlar
          </button>
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
                <th className="px-6 py-4 text-left text-white/80 font-semibold">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {displayedPatients.map((patient) => {
                const needsMediaUpload = patient.optionalScans?.hasMediaGallery && (!patient.mediaFiles || patient.mediaFiles.length === 0);
                return (
                  <tr key={patient.id} className={`transition-colors duration-200 ${needsMediaUpload
                    ? 'bg-pink-500/15 hover:bg-pink-500/25 border-l-4 border-l-pink-400'
                    : 'hover:bg-white/5'
                    }`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          {patient.photoURL ? (
                            <img src={patient.photoURL} alt={patient.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                              <span className="text-white font-semibold">
                                {patient.fullName.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                          )}
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
                          onClick={() => handleDeletePatient(patient)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200"
                          title="Hastayı Sil"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {displayedPatients.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-white/60">Hasta bulunamadı</div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-white/60 text-sm">
              {hasActiveFilter
                ? `${filteredPatients.length} sonuçtan ${(currentPage - 1) * PATIENTS_PER_PAGE + 1}–${Math.min(currentPage * PATIENTS_PER_PAGE, filteredPatients.length)} gösteriliyor`
                : `${allPatients.length} hastadan sayfa ${currentPage} / ${totalPages}`
              }
            </div>
            <div className="flex items-center gap-1">
              {/* Önceki */}
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                ← Önceki
              </button>

              {/* Sayfa numaraları */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                  if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 py-2 text-white/40 text-sm">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                        currentPage === item
                          ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 border border-green-400'
                          : 'bg-white/10 border border-white/20 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )
              }

              {/* Sonraki */}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                Sonraki →
              </button>
            </div>
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
        doctorProfile={doctorProfile}
        onPatientUpdated={fetchPatients}
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

      {/* Survey Analytics Modal */}
      <SurveyAnalyticsModal
        isOpen={isSurveyAnalyticsOpen}
        onClose={() => setIsSurveyAnalyticsOpen(false)}
        clinicId={doctorProfile?.clinicId}
      />
    </div>
  );
};

export default Patients; 