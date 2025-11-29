import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import AnamrezViewModal from './AnamrezViewModal';
import TreatmentModal from '../components/TreatmentModal';

interface DoctorPanelProps {
  doctorProfile?: any;
}

interface AssignedPatient {
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
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  assignedAt?: string;
  status?: string;
  updatedAt?: string;
  // Payment fields
  paymentCompleted?: boolean;
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  paymentHistory?: Array<{
    amount?: number;
    date?: string;
    method?: string;
  }>;
}

interface PatientStats {
  totalAssigned: number;
  inTreatment: number;
  completedToday: number;
  pendingReview: number;
}

interface TreatmentOptions {
  protocol?: string;
  notes?: string;
  protocolId?: string;
  protocolName?: string;
  isCustomized?: boolean;
  originalProtocolId?: string;
  selectedProtocol?: any; // SavedProtocol type
  customizedProtocol?: any; // SavedProtocol type
  selectedMainApplications?: string[];
}

interface DoctorMessage {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserRole: string;
  toUserId: string;
  toDoctorName: string;
  message: string;
  messageType: 'info' | 'urgent' | 'question';
  patientId?: string;
  patientName?: string;
  clinicId: string;
  isRead: boolean;
  createdAt: string;
  timestamp: any;
}

const DoctorPanel: React.FC<DoctorPanelProps> = ({ doctorProfile }) => {
  const { user } = useAuth();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [stats, setStats] = useState<PatientStats>({
    totalAssigned: 0,
    inTreatment: 0,
    completedToday: 0,
    pendingReview: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<AssignedPatient | null>(null);
  const [isAnamrezViewModalOpen, setIsAnamrezViewModalOpen] = useState(false);
  const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
  const [treatmentPatient, setTreatmentPatient] = useState<AssignedPatient | null>(null);
  const [messages, setMessages] = useState<DoctorMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMessagesExpanded, setIsMessagesExpanded] = useState(false);
  const [patientsSectionRef, setPatientsSectionRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Security check: clinicId is required
    if (!doctorProfile?.clinicId) {
      console.error('❌ DoctorPanel: No clinicId found in doctorProfile');
      setAssignedPatients([]);
      setLoading(false);
      return;
    }

    console.log('🔍 DoctorPanel: Setting up real-time listener for clinicId:', doctorProfile.clinicId);
    console.log('🔍 DoctorPanel: Doctor profile:', doctorProfile);

    // Main query - Show patients assigned to the current doctor only
    const patientsQuery = query(
      collection(db, 'patients'),
      where('clinicId', '==', doctorProfile.clinicId),
      where('assignedDoctorId', '==', user?.uid)
    );

    const unsubscribe = onSnapshot(patientsQuery, (snapshot) => {
      console.log('📊 DoctorPanel: Query returned:', snapshot.docs.length, 'patients for clinicId:', doctorProfile.clinicId);
      
      const patients = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AssignedPatient));

      console.log('👥 DoctorPanel: Processed patients:', patients);
      console.log('🔍 DoctorPanel: Patient details:', patients.map(p => ({
        id: p.id,
        name: p.fullName,
        assignedDoctorId: p.assignedDoctorId,
        assignedDoctorName: p.assignedDoctorName,
        status: p.status,
        assignedAt: p.assignedAt,
        clinicId: p.clinicId
      })));

      // Show all patients assigned to any doctor, prioritizing active ones
      const displayPatients = patients.filter(p => {
        // Include patients with assigned doctor ID
        if (!p.assignedDoctorId) return false;
        
        // Show only patients that need doctor attention (exclude treatment_decided)
        return p.status === 'assigned_to_doctor' || 
               p.status === 'in_treatment' || 
               !p.status; // Include patients without status (newly assigned)
      });
      setAssignedPatients(displayPatients);
      
      const today = new Date().toDateString();
      
      // Query completed patients separately for stats only
      const completedQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId),
        where('assignedDoctorId', '==', user?.uid),
        where('status', '==', 'treatment_completed')
      );
      
      onSnapshot(completedQuery, (completedSnapshot) => {
        const completedPatients = completedSnapshot.docs.map(doc => doc.data());
        const completedToday = completedPatients.filter(p => 
          new Date(p.updatedAt || '').toDateString() === today
        ).length;
        
        const stats: PatientStats = {
          totalAssigned: displayPatients.length, // All active patients
          inTreatment: displayPatients.filter(p => p.status === 'in_treatment').length,
          completedToday: completedToday,
          pendingReview: displayPatients.filter(p => p.status === 'assigned_to_doctor').length
        };
        setStats(stats);
      });
      
      setLoading(false);

      console.log('📊 DoctorPanel: Updated active patients:', displayPatients.map(p => p.fullName));
      console.log('📊 DoctorPanel: Display patients count:', displayPatients.length);
    }, (error) => {
      console.error('❌ DoctorPanel: Error listening to patients:', error);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [doctorProfile, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !doctorProfile?.clinicId) return;

    console.log('🔍 DoctorPanel: Setting up messages listener for doctor:', user.uid, 'clinicId:', doctorProfile.clinicId);
    
    const messagesQuery = query(
      collection(db, 'doctorMessages'),
      where('clinicId', '==', doctorProfile.clinicId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DoctorMessage));

      console.log('📨 DoctorPanel: Found messages:', fetchedMessages.length);
      setMessages(fetchedMessages);
      
      // Count unread messages
      const unread = fetchedMessages.filter(msg => !msg.isRead).length;
      setUnreadCount(unread);
      console.log('📨 DoctorPanel: Unread messages:', unread);
    });

    return () => unsubscribe();
  }, [user?.uid, doctorProfile?.clinicId]);

  // Sayfa yüklendiğinde hastalar bölümüne scroll yap
  useEffect(() => {
    if (!loading && assignedPatients.length > 0 && patientsSectionRef) {
      // Kısa bir gecikme ile scroll yap (DOM'un render olması için)
      setTimeout(() => {
        patientsSectionRef.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [loading, assignedPatients.length, patientsSectionRef]);

  const handleViewAnamnez = (patient: AssignedPatient) => {
    setSelectedPatient(patient);
    setIsAnamrezViewModalOpen(true);
  };

  const handleOpenTreatmentModal = (patient: AssignedPatient) => {
    setTreatmentPatient(patient);
    setIsTreatmentModalOpen(true);
  };

  const markMessageAsRead = async (messageId: string) => {
    try {
      await updateDoc(doc(db, 'doctorMessages', messageId), {
        isRead: true,
        readAt: new Date().toISOString()
      });
      console.log('✅ Message marked as read:', messageId);
    } catch (error) {
      console.error('❌ Error marking message as read:', error);
    }
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'question': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'urgent': return 'Acil';
      case 'question': return 'Soru';
      default: return 'Bilgi';
    }
  };

  const formatMessageDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStartTreatment = async (patient: AssignedPatient, treatmentOptions: TreatmentOptions) => {
    try {
      const patientRef = doc(db, 'patients', patient.id);
      
      // Store previous payment info in history before starting new treatment
      const previousPaymentData = patient.paymentCompleted ? {
        amount: patient.paymentAmount,
        date: patient.paymentDate,
        method: patient.paymentMethod
      } : null;

      await updateDoc(patientRef, {
        status: 'treatment_decided',
        pharmacyStatus: 'waiting', // Patient also goes to pharmacy
        treatmentStartedAt: new Date().toISOString(),
        treatmentOptions: treatmentOptions,
        // Reset payment status for new treatment
        paymentCompleted: false,
        paymentAmount: null,
        paymentDate: null,
        paymentMethod: null,
        // Store previous payment in history if exists
        ...(previousPaymentData && {
          paymentHistory: [...(patient.paymentHistory || []), previousPaymentData]
        }),
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Treatment decided for patient: ${patient.fullName} - Sent to both Muhasebe and Eczane`);
    } catch (error) {
      console.error('❌ Error starting treatment:', error);
      alert('Tedaviye başlarken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  const handleCompleteTreatment = async (patient: AssignedPatient) => {
    try {
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        status: 'treatment_completed',
        treatmentCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Treatment completed for patient: ${patient.fullName}`);
    } catch (error) {
      console.error('❌ Error completing treatment:', error);
      alert('Tedaviyi tamamlarken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Tarih belirtilmemiş';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeSince = (dateString?: string) => {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    return `${diffDays} gün önce`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'assigned_to_doctor':
        return (
          <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-xs rounded-full">
            🔄 Atandı
          </span>
        );
      case 'treatment_decided':
        return (
          <span className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs rounded-full">
            📋 Tedavi Belirlendi
          </span>
        );
      case 'in_treatment':
        return (
          <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs rounded-full">
            🏥 Tedavide
          </span>
        );
      case 'treatment_completed':
        return (
          <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 text-green-300 text-xs rounded-full">
            ✅ Tamamlandı
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 text-gray-300 text-xs rounded-full">
            ❓ Bilinmiyor
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <p className="text-white text-lg">Hastalar yükleniyor...</p>
            <p className="text-white/70 text-sm mt-2">
              Doctor UID: {user?.uid || 'Yok'}
            </p>
            <p className="text-white/70 text-sm">
              Profile: {doctorProfile?.fullName || 'Yükleniyor...'}
            </p>
            <div className="mt-4 p-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl text-xs text-white/60">
              Eğer bu ekran uzun süre kalırsa, konsol loglarını kontrol edin
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Section */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Doktor Paneli
            </h1>
            <p className="text-white/70 text-lg">
              Tüm doktor atamalarını görüntüleyin ve yönetin
            </p>
            {doctorProfile && (
              <div className="mt-4 p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl inline-block shadow-sm">
                <p className="text-white font-semibold">Dr. {doctorProfile.fullName}</p>
                <p className="text-white/70 text-sm">{doctorProfile.specialization} • {doctorProfile.department}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-xl">👥</span>
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">{stats.totalAssigned}</div>
              <div className="text-white/70 text-sm">Aktif Hasta</div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-xl">🏥</span>
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">{stats.inTreatment}</div>
              <div className="text-white/70 text-sm">Tedavide</div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-xl">✅</span>
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">{stats.completedToday}</div>
              <div className="text-white/70 text-sm">Bugün Tamamlanan</div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-xl">⏳</span>
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">{stats.pendingReview}</div>
              <div className="text-white/70 text-sm">Tedavi Bekleyen</div>
            </div>
          </div>
        </div>

        {/* Messages Section - Collapsible */}
        {messages.length > 0 && (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📨</span>
                <h2 className="text-2xl font-bold text-white">
                  Asistan Mesajları
                  {unreadCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-red-500 text-white text-sm rounded-full">
                      {unreadCount} yeni
                    </span>
                  )}
                </h2>
              </div>
              <button
                onClick={() => setIsMessagesExpanded(!isMessagesExpanded)}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 hover:text-blue-200 transition-all duration-200 flex items-center gap-2"
              >
                <span className="text-sm">
                  {isMessagesExpanded ? 'Gizle' : 'Göster'}
                </span>
                <span className={`transform transition-transform duration-200 ${isMessagesExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
            </div>

            {isMessagesExpanded && (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.map((message) => (
                  <div 
                    key={message.id}
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      message.isRead 
                        ? 'bg-white/5 border-white/20' 
                        : 'bg-blue-500/10 border-blue-500/30 shadow-lg'
                    }`}
                    onClick={() => !message.isRead && markMessageAsRead(message.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">👨‍💼</span>
                        <span className="text-white font-medium">Dr. {message.toDoctorName}</span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getMessageTypeColor(message.messageType)}`}>
                          {getMessageTypeLabel(message.messageType)}
                        </span>
                        {!message.isRead && (
                          <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
                            Yeni
                          </span>
                        )}
                      </div>
                      <span className="text-white/50 text-xs">
                        {formatMessageDate(message.createdAt)}
                      </span>
                    </div>

                    {message.patientName && (
                      <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-300">
                          <span className="text-sm">👤</span>
                          <span className="text-sm font-medium">Hasta: {message.patientName}</span>
                        </div>
                      </div>
                    )}

                    <p className="text-white/80 text-sm leading-relaxed">
                      {message.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div 
          ref={setPatientsSectionRef}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">👤</span>
            <h2 className="text-2xl font-bold text-white">
              Tüm Doktor Atamaları {assignedPatients.length > 0 ? `(${assignedPatients.length} hasta)` : ''}
            </h2>
          </div>

          {assignedPatients.length > 0 ? (
            <div className="space-y-6">
              {assignedPatients.map((patient) => (
                <div 
                  key={patient.id}
                  className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 shadow-lg"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl">👤</span>
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">{patient.fullName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusBadge(patient.status)}
                          <span className="text-white/60 text-sm">
                            {formatTimeSince(patient.assignedAt)}
                          </span>
                        </div>
                        {patient.assignedDoctorName && (
                          <div className="mt-2">
                            <span className="px-3 py-1 bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-500/30 text-green-300 text-sm rounded-full font-medium">
                              👨‍⚕️ Dr. {patient.assignedDoctorName}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => handleViewAnamnez(patient)}
                        className="px-4 py-2 bg-purple-500/30 hover:bg-purple-500/40 border border-purple-500/50 rounded-xl text-purple-200 hover:text-white text-sm font-medium transition-all duration-200 flex items-center gap-2"
                      >
                        📋 Anamnez Görüntüle
                      </button>
                      
                      {patient.status === 'assigned_to_doctor' && (
                        <button 
                          onClick={() => handleOpenTreatmentModal(patient)}
                          className="px-4 py-2 bg-blue-500/30 hover:bg-blue-500/40 border border-blue-500/50 rounded-xl text-blue-200 hover:text-white text-sm font-medium transition-all duration-200 flex items-center gap-2"
                        >
                          🏥 Tedaviye Başla
                        </button>
                      )}
                      
                      {patient.status === 'in_treatment' && (
                        <button 
                          onClick={() => handleCompleteTreatment(patient)}
                          className="px-4 py-2 bg-green-500/30 hover:bg-green-500/40 border border-green-500/50 rounded-xl text-green-200 hover:text-white text-sm font-medium transition-all duration-200 flex items-center gap-2"
                        >
                          ✅ Tedaviyi Tamamla
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="text-lg">📱</span>
                        İletişim Bilgileri
                      </h4>
                      <div className="space-y-2 text-sm">
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">TC No:</span> {patient.tcNo}
                        </p>
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Telefon:</span> {patient.phone}
                        </p>
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Acil Telefon:</span> {patient.emergencyPhone || 'Belirtilmemiş'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="text-lg">👨‍⚕️</span>
                        Hasta Bilgileri
                      </h4>
                      <div className="space-y-2 text-sm">
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Yaş:</span> {patient.birthDate ? 
                            new Date().getFullYear() - new Date(patient.birthDate).getFullYear() : 'Belirtilmemiş'
                          }
                        </p>
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Cinsiyet:</span> {patient.gender === 'male' ? 'Erkek' : 'Kadın'}
                        </p>
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Geliş Nedeni:</span> {patient.visitReason}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="text-lg">⏰</span>
                        Zaman Bilgileri
                      </h4>
                      <div className="space-y-2 text-sm">
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Atanma:</span> {formatDate(patient.assignedAt)}
                        </p>
                        {patient.anamrezCompletedAt && (
                          <p className="text-white/70">
                            <span className="font-medium text-white/90">Anamnez:</span> {formatDate(patient.anamrezCompletedAt)}
                          </p>
                        )}
                        <p className="text-white/70">
                          <span className="font-medium text-white/90">Kayıt:</span> {formatDate(patient.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {patient.selectedDiagnosisSystems && patient.selectedDiagnosisSystems.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="text-lg">🔍</span>
                        Seçilen Tanı Sistemleri
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {patient.selectedDiagnosisSystems.map((system, index) => (
                          <span 
                            key={index}
                            className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 text-purple-300 text-sm rounded-full font-medium"
                          >
                            {system}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-8xl mb-6">🩺</div>
              <h3 className="text-white text-2xl font-semibold mb-4">Atanmış Hasta Yok</h3>
              <p className="text-white/70 text-lg mb-2">
                Size henüz hasta ataması yapılmamış.
              </p>
              <p className="text-white/50 text-sm">
                Asistan tarafından hasta ataması yapıldığında burada görünecektir.
              </p>
              <div className="mt-6 p-4 bg-blue-500/20 backdrop-blur-sm border border-blue-500/30 rounded-xl inline-block">
                <p className="text-blue-300 text-sm">
                  💡 Sistem gerçek zamanlı olarak güncellenir, yenilemeye gerek yoktur.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnamrezViewModal
        isOpen={isAnamrezViewModalOpen}
        onClose={() => setIsAnamrezViewModalOpen(false)}
        patient={selectedPatient}
      />

      <TreatmentModal
        isOpen={isTreatmentModalOpen}
        onClose={() => setIsTreatmentModalOpen(false)}
        patient={treatmentPatient}
        onStartTreatment={handleStartTreatment}
      />
    </div>
  );
};

export default DoctorPanel;