import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, orderBy, limit, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import AnamrezViewModal from './AnamrezViewModal';
import TreatmentModal from '../components/TreatmentModal';
import DoctorReplyModal from '../components/DoctorReplyModal';

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
  routineProgram?: {
    enabled: boolean;
    frequency: string;
    totalSessions: number;
    notes: string;
  };
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
  reply?: string;
  replyAt?: string;
  repliedBy?: string;
  repliedByName?: string;
}

interface AdditionalTreatmentRequest {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  fromUserId: string;
  fromUserName: string;
  fromUserRole: string;
  toDoctorId: string;
  toDoctorName: string;
  patientId: string;
  patientName: string;
  // Application info
  applicationId?: string;
  applicationName?: string;
  applicationPrice?: number;
  applicationDescription?: string;
  treatmentDescription: string;
  treatmentReason?: string;
  clinicId: string;
  createdAt: string;
  timestamp: any;
  responseNote?: string;
  respondedAt?: string;
  respondedBy?: string;
  respondedByName?: string;
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
  const [selectedMessage, setSelectedMessage] = useState<DoctorMessage | null>(null);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMessagesExpanded, setIsMessagesExpanded] = useState(false);
  const [patientsSectionRef, setPatientsSectionRef] = useState<HTMLDivElement | null>(null);
  
  // Additional Treatment Requests state
  const [treatmentRequests, setTreatmentRequests] = useState<AdditionalTreatmentRequest[]>([]);
  const [selectedTreatmentRequest, setSelectedTreatmentRequest] = useState<AdditionalTreatmentRequest | null>(null);
  const [isTreatmentRequestModalOpen, setIsTreatmentRequestModalOpen] = useState(false);
  const [treatmentRequestsCount, setTreatmentRequestsCount] = useState(0);
  const [isTreatmentRequestsExpanded, setIsTreatmentRequestsExpanded] = useState(false);

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

  // Listen for additional treatment requests
  useEffect(() => {
    if (!user?.uid || !doctorProfile?.clinicId) return;

    console.log('🔍 DoctorPanel: Setting up additional treatment requests listener for doctor:', user.uid);
    
    const requestsQuery = query(
      collection(db, 'additionalTreatmentRequests'),
      where('clinicId', '==', doctorProfile.clinicId),
      where('toDoctorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const fetchedRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AdditionalTreatmentRequest));

      console.log('💊 DoctorPanel: Found treatment requests:', fetchedRequests.length);
      setTreatmentRequests(fetchedRequests);
      
      // Count pending requests
      const pendingCount = fetchedRequests.filter(req => req.status === 'pending').length;
      setTreatmentRequestsCount(pendingCount);
      console.log('💊 DoctorPanel: Pending treatment requests:', pendingCount);
    }, (error) => {
      console.error('❌ DoctorPanel: Error listening to treatment requests:', error);
      // If index doesn't exist yet, try simpler query
      const simpleQuery = query(
        collection(db, 'additionalTreatmentRequests'),
        where('clinicId', '==', doctorProfile.clinicId),
        where('toDoctorId', '==', user.uid)
      );
      
      onSnapshot(simpleQuery, (snapshot) => {
        const fetchedRequests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AdditionalTreatmentRequest)).sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        setTreatmentRequests(fetchedRequests);
        const pendingCount = fetchedRequests.filter(req => req.status === 'pending').length;
        setTreatmentRequestsCount(pendingCount);
      });
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

  const handleOpenReplyModal = (message: DoctorMessage) => {
    setSelectedMessage(message);
    setIsReplyModalOpen(true);
    // Also mark as read when opening
    if (!message.isRead) {
      markMessageAsRead(message.id);
    }
  };

  const handleOpenTreatmentRequestModal = (request: AdditionalTreatmentRequest) => {
    setSelectedTreatmentRequest(request);
    setIsTreatmentRequestModalOpen(true);
  };

  const handleRespondToTreatmentRequest = async (requestId: string, status: 'approved' | 'rejected', responseNote: string) => {
    if (!user || !doctorProfile) return;
    
    // Find the request to get patient and treatment info
    const request = treatmentRequests.find(r => r.id === requestId);
    if (!request) {
      console.error('❌ Request not found:', requestId);
      return;
    }
    
    try {
      const requestRef = doc(db, 'additionalTreatmentRequests', requestId);
      await updateDoc(requestRef, {
        status: status,
        responseNote: responseNote.trim() || null,
        respondedAt: new Date().toISOString(),
        respondedBy: user.uid,
        respondedByName: doctorProfile?.fullName || doctorProfile?.name || 'Doktor'
      });
      
      // If approved, add the treatment to the patient's treatment list and send to accounting
      if (status === 'approved' && request.patientId && request.treatmentDescription) {
        try {
          const patientRef = doc(db, 'patients', request.patientId);
          
          // Get current patient data to append to existing treatments
          const { getDoc } = await import('firebase/firestore');
          const patientSnap = await getDoc(patientRef);
          
          if (patientSnap.exists()) {
            const patientData = patientSnap.data();
            const currentApplications = patientData.treatmentOptions?.selectedMainApplications || [];
            
            // Add the new approved treatment if not already in list
            if (!currentApplications.includes(request.treatmentDescription)) {
              const updatedApplications = [...currentApplications, request.treatmentDescription];
              
              await updateDoc(patientRef, {
                'treatmentOptions.selectedMainApplications': updatedApplications,
                // Send patient to accounting for payment of additional treatment
                status: 'treatment_decided',
                paymentCompleted: false,
                // Track that this is for additional treatment
                additionalTreatmentPending: true,
                additionalTreatmentName: request.treatmentDescription,
                additionalTreatmentPrice: request.applicationPrice || 0,
                updatedAt: new Date().toISOString()
              });
              
              console.log(`✅ Added treatment "${request.treatmentDescription}" to patient ${request.patientName} - sent to accounting`);
            }
          }
        } catch (patientError) {
          console.error('❌ Error updating patient treatments:', patientError);
          // Don't fail the whole operation if patient update fails
        }
      }
      
      console.log(`✅ Treatment request ${status}:`, requestId);
      setIsTreatmentRequestModalOpen(false);
      setSelectedTreatmentRequest(null);
    } catch (error) {
      console.error('❌ Error responding to treatment request:', error);
      alert('Talep yanıtlanırken bir hata oluştu. Lütfen tekrar deneyin.');
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

  // Helper function to check if treatment protocol has any medications/drugs
  const hasMedicationsInProtocol = (treatmentOptions: TreatmentOptions): boolean => {
    const protocol = treatmentOptions.customizedProtocol || treatmentOptions.selectedProtocol;
    
    if (!protocol?.phases) return false;
    
    // Check remember and regeneration phases for medications
    const phases = protocol.phases;
    const hasPhaseMedications = [
      phases.remember?.treatment,
      phases.regeneration1?.treatment,
      phases.regeneration2?.treatment,
      phases.regeneration3?.treatment,
      phases.regeneration4?.treatment
    ].some(treatment => treatment && treatment !== '-' && treatment.trim() !== '');
    
    // Check mainTreatments array
    const hasMainTreatments = phases.mainTreatments && 
      Array.isArray(phases.mainTreatments) && 
      phases.mainTreatments.length > 0 &&
      phases.mainTreatments.some((mt: any) => mt.treatment && mt.treatment.trim() !== '');
    
    return hasPhaseMedications || hasMainTreatments;
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

      // Check if treatment has medications - only send to pharmacy if there are drugs
      const shouldGoToPharmacy = hasMedicationsInProtocol(treatmentOptions);

      await updateDoc(patientRef, {
        status: 'treatment_decided',
        // Only set pharmacyStatus to 'waiting' if there are medications in the protocol
        ...(shouldGoToPharmacy && { pharmacyStatus: 'waiting' }),
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
      
      if (treatmentOptions.routineProgram?.enabled) {
        await addDoc(collection(db, 'routine_programs'), {
          patientId: patient.id,
          patientName: patient.fullName,
          clinicId: patient.clinicId,
          doctorId: patient.assignedDoctorId || null,
          doctorName: patient.assignedDoctorName || null,
          frequency: treatmentOptions.routineProgram.frequency,
          totalSessions: treatmentOptions.routineProgram.totalSessions,
          scheduledSessions: 0,
          status: 'active',
          treatmentProtocolName: treatmentOptions.protocolName || '',
          notes: treatmentOptions.routineProgram.notes || '',
          createdAt: new Date().toISOString(),
        });
        console.log(`📋 Routine program created for patient: ${patient.fullName}`);
      }

      if (shouldGoToPharmacy) {
        console.log(`✅ Treatment decided for patient: ${patient.fullName} - Sent to both Muhasebe and Eczane`);
      } else {
        console.log(`✅ Treatment decided for patient: ${patient.fullName} - Sent to Muhasebe only (no medications in protocol)`);
      }
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
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-lg ${
                      message.isRead 
                        ? 'bg-white/5 border-white/20 hover:bg-white/10' 
                        : 'bg-blue-500/10 border-blue-500/30 shadow-lg hover:bg-blue-500/20'
                    }`}
                    onClick={() => handleOpenReplyModal(message)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">👨‍💼</span>
                        <span className="text-white font-medium">{message.fromUserName}</span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getMessageTypeColor(message.messageType)}`}>
                          {getMessageTypeLabel(message.messageType)}
                        </span>
                        {!message.isRead && (
                          <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
                            Yeni
                          </span>
                        )}
                        {message.reply && (
                          <span className="text-xs bg-green-500/20 border border-green-500/30 text-green-300 px-2 py-1 rounded-full">
                            ✅ Yanıtlandı
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

                    {/* Reply Preview */}
                    {message.reply && (
                      <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-green-300 mb-1">
                          <span className="text-sm">💬</span>
                          <span className="text-xs font-medium">Yanıtınız:</span>
                        </div>
                        <p className="text-green-200/80 text-xs line-clamp-2">
                          {message.reply}
                        </p>
                      </div>
                    )}

                    {/* Click hint */}
                    <div className="mt-3 flex items-center justify-end">
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <span>👆</span>
                        {message.reply ? 'Detay için tıklayın' : 'Yanıtlamak için tıklayın'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Additional Treatment Requests Section */}
        {treatmentRequests.length > 0 && (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">💊</span>
                <h2 className="text-2xl font-bold text-white">
                  Ek Tedavi Talepleri
                  {treatmentRequestsCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-purple-500 text-white text-sm rounded-full">
                      {treatmentRequestsCount} bekleyen
                    </span>
                  )}
                </h2>
              </div>
              <button
                onClick={() => setIsTreatmentRequestsExpanded(!isTreatmentRequestsExpanded)}
                className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 hover:text-purple-200 transition-all duration-200 flex items-center gap-2"
              >
                <span className="text-sm">
                  {isTreatmentRequestsExpanded ? 'Gizle' : 'Göster'}
                </span>
                <span className={`transform transition-transform duration-200 ${isTreatmentRequestsExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
            </div>

            {isTreatmentRequestsExpanded && (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {treatmentRequests.map((request) => (
                  <div 
                    key={request.id}
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-lg ${
                      request.status === 'pending'
                        ? 'bg-purple-500/10 border-purple-500/30 shadow-lg hover:bg-purple-500/20' 
                        : request.status === 'approved'
                        ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
                        : 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                    }`}
                    onClick={() => handleOpenTreatmentRequestModal(request)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">👨‍⚕️</span>
                        <span className="text-white font-medium">{request.fromUserName}</span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${
                          request.status === 'pending' 
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                            : request.status === 'approved'
                            ? 'bg-green-500/20 text-green-300 border-green-500/30'
                            : 'bg-red-500/20 text-red-300 border-red-500/30'
                        }`}>
                          {request.status === 'pending' ? '⏳ Beklemede' : request.status === 'approved' ? '✅ Onaylandı' : '❌ Reddedildi'}
                        </span>
                      </div>
                      <span className="text-white/50 text-xs">
                        {new Date(request.createdAt).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-300">
                        <span className="text-sm">👤</span>
                        <span className="text-sm font-medium">Hasta: {request.patientName}</span>
                      </div>
                    </div>

                    <div className="mb-2">
                      <p className="text-white/60 text-xs font-medium mb-1">Talep Edilen Tedavi:</p>
                      <div className="flex items-center justify-between">
                        <p className="text-white/80 text-sm leading-relaxed">
                          {request.treatmentDescription}
                        </p>
                        {request.applicationPrice !== undefined && request.applicationPrice > 0 && (
                          <span className="ml-2 px-2 py-1 bg-purple-500/30 text-purple-200 text-xs font-medium rounded-lg">
                            {request.applicationPrice.toLocaleString('tr-TR')} TL
                          </span>
                        )}
                      </div>
                    </div>

                    {request.treatmentReason && (
                      <div className="mb-2">
                        <p className="text-white/60 text-xs font-medium mb-1">Gerekçe:</p>
                        <p className="text-white/70 text-xs leading-relaxed">
                          {request.treatmentReason}
                        </p>
                      </div>
                    )}

                    {/* Response Preview */}
                    {request.responseNote && (
                      <div className={`mt-3 p-2 rounded-lg border ${
                        request.status === 'approved'
                          ? 'bg-green-500/10 border-green-500/20'
                          : 'bg-red-500/10 border-red-500/20'
                      }`}>
                        <div className={`flex items-center gap-2 mb-1 ${
                          request.status === 'approved' ? 'text-green-300' : 'text-red-300'
                        }`}>
                          <span className="text-sm">💬</span>
                          <span className="text-xs font-medium">Yanıtınız:</span>
                        </div>
                        <p className={`text-xs line-clamp-2 ${
                          request.status === 'approved' ? 'text-green-200/80' : 'text-red-200/80'
                        }`}>
                          {request.responseNote}
                        </p>
                      </div>
                    )}

                    {/* Click hint */}
                    <div className="mt-3 flex items-center justify-end">
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <span>👆</span>
                        {request.status === 'pending' ? 'Yanıtlamak için tıklayın' : 'Detay için tıklayın'}
                      </span>
                    </div>
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
                          <span className="font-medium text-white/90">Cinsiyet:</span> {patient.gender === 'Erkek' ? 'Erkek' : patient.gender === 'Kadın' ? 'Kadın' : patient.gender === 'male' ? 'Erkek' : patient.gender === 'female' ? 'Kadın' : patient.gender || 'Belirtilmemiş'}
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
        editable={true}
      />

      <TreatmentModal
        isOpen={isTreatmentModalOpen}
        onClose={() => setIsTreatmentModalOpen(false)}
        patient={treatmentPatient}
        onStartTreatment={handleStartTreatment}
      />

      <DoctorReplyModal
        isOpen={isReplyModalOpen}
        onClose={() => {
          setIsReplyModalOpen(false);
          setSelectedMessage(null);
        }}
        message={selectedMessage}
        doctorProfile={doctorProfile}
      />

      {/* Additional Treatment Request Response Modal */}
      {isTreatmentRequestModalOpen && selectedTreatmentRequest && (
        <TreatmentRequestResponseModal
          isOpen={isTreatmentRequestModalOpen}
          onClose={() => {
            setIsTreatmentRequestModalOpen(false);
            setSelectedTreatmentRequest(null);
          }}
          request={selectedTreatmentRequest}
          onRespond={handleRespondToTreatmentRequest}
        />
      )}
    </div>
  );
};

// Treatment Request Response Modal Component
interface TreatmentRequestResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: AdditionalTreatmentRequest;
  onRespond: (requestId: string, status: 'approved' | 'rejected', responseNote: string) => Promise<void>;
}

const TreatmentRequestResponseModal: React.FC<TreatmentRequestResponseModalProps> = ({
  isOpen,
  onClose,
  request,
  onRespond
}) => {
  const [responseNote, setResponseNote] = useState('');
  const [sending, setSending] = useState(false);
  const [applicationDescription, setApplicationDescription] = useState<string>(request.applicationDescription || '');

  useEffect(() => {
    if (request.applicationDescription) {
      setApplicationDescription(request.applicationDescription);
      return;
    }
    if (!request.applicationId) return;
    getDoc(doc(db, 'medicalApplications', request.applicationId)).then(snap => {
      if (snap.exists()) setApplicationDescription(snap.data().description || '');
    });
  }, [request.applicationId, request.applicationDescription]);

  const handleRespond = async (status: 'approved' | 'rejected') => {
    setSending(true);
    try {
      await onRespond(request.id, status, responseNote);
      setResponseNote('');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  const isPending = request.status === 'pending';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b border-gray-200 ${
          request.status === 'approved' 
            ? 'bg-gradient-to-r from-green-50 to-emerald-50'
            : request.status === 'rejected'
            ? 'bg-gradient-to-r from-red-50 to-pink-50'
            : 'bg-gradient-to-r from-purple-50 to-indigo-50'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">💊</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Ek Tedavi Talebi</h2>
              <p className="text-gray-600">
                {isPending ? 'Talebe yanıt verin' : 'Talep detayları'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Request Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">👨‍⚕️</span>
                <span className="text-gray-800 font-medium">{request.fromUserName}</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${
                  request.status === 'pending' 
                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    : request.status === 'approved'
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {request.status === 'pending' ? '⏳ Beklemede' : request.status === 'approved' ? '✅ Onaylandı' : '❌ Reddedildi'}
                </span>
              </div>
              <span className="text-gray-500 text-xs">
                {formatDate(request.createdAt)}
              </span>
            </div>
            
            {/* Patient Info */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-lg">👤</span>
                <span className="font-medium">Hasta: {request.patientName}</span>
              </div>
            </div>

            {/* Treatment Description */}
            <div className="mb-4">
              <p className="text-gray-600 text-sm font-medium mb-2">Talep Edilen Tedavi:</p>
              <div className="p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-gray-800 font-medium">{request.treatmentDescription}</p>
                  {request.applicationPrice !== undefined && request.applicationPrice > 0 && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg">
                      {request.applicationPrice.toLocaleString('tr-TR')} TL
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Treatment Reason */}
            {request.treatmentReason && (
              <div>
                <p className="text-gray-600 text-sm font-medium mb-2">Gerekçe:</p>
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <p className="text-gray-700 text-sm">{request.treatmentReason}</p>
                </div>
              </div>
            )}

            {/* Protocol Description */}
            {applicationDescription && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">Protokol Açıklaması</p>
                <p className="text-sm text-blue-900">{applicationDescription}</p>
              </div>
            )}
          </div>

          {/* Previous Response (if already responded) */}
          {!isPending && request.responseNote && (
            <div className={`p-4 rounded-xl border ${
              request.status === 'approved'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className={`flex items-center gap-2 mb-2 ${
                request.status === 'approved' ? 'text-green-700' : 'text-red-700'
              }`}>
                <span className="text-lg">💬</span>
                <span className="font-medium">Yanıtınız:</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {request.respondedAt && formatDate(request.respondedAt)}
                </span>
              </div>
              <p className={`${request.status === 'approved' ? 'text-green-800' : 'text-red-800'}`}>
                {request.responseNote}
              </p>
            </div>
          )}

          {/* Response Form (only for pending requests) */}
          {isPending && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Yanıt Notu (Opsiyonel)
              </label>
              <textarea
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder="Onay veya red gerekçenizi yazabilirsiniz..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
          >
            {isPending ? 'İptal' : 'Kapat'}
          </button>
          
          {isPending && (
            <>
              <button
                onClick={() => handleRespond('rejected')}
                disabled={sending}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <span>❌</span>
                    Reddet
                  </>
                )}
              </button>
              <button
                onClick={() => handleRespond('approved')}
                disabled={sending}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <span>✅</span>
                    Onayla
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorPanel;