import React, { useState, useEffect } from 'react';
import { collection, query, where, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AdditionalTreatmentRequestModal from '../components/AdditionalTreatmentRequestModal';

interface TreatmentPanelProps {
  doctorProfile?: {
    clinicId: string;
    fullName: string;
    role?: string;
    userType?: string;
  } | null;
}

interface TreatmentPatient {
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
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  assignedAt?: string;
  status?: string;
  createdAt: string;
  treatmentStartedAt?: string;
  treatmentOptions?: {
    protocolName?: string;
    selectedMainApplications?: string[];
  };
  paymentCompleted?: boolean;
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  updatedAt?: string;
  treatmentNotes?: string;
  treatmentNotAppliedReason?: string;
  treatmentApplied?: boolean;
  treatmentCompletedAt?: string;
  appointmentType?: string; // 'tedavi' or 'kontrol'
}

interface TreatmentStats {
  totalPendingTreatments: number;
  todayTreatments: number;
  completedTreatments: number;
  inProgressTreatments: number;
}

const TreatmentPanel: React.FC<TreatmentPanelProps> = ({ doctorProfile }) => {
  const [stats, setStats] = useState<TreatmentStats>({
    totalPendingTreatments: 0,
    todayTreatments: 0,
    completedTreatments: 0,
    inProgressTreatments: 0
  });
  const [pendingTreatmentPatients, setPendingTreatmentPatients] = useState<TreatmentPatient[]>([]);
  const [completedTreatmentPatients, setCompletedTreatmentPatients] = useState<TreatmentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListType, setActiveListType] = useState<'pending_treatment' | 'completed_treatment'>('pending_treatment');
  const [selectedPatient, setSelectedPatient] = useState<TreatmentPatient | null>(null);
  const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
  const [treatmentApplied, setTreatmentApplied] = useState<boolean>(true);
  const [treatmentNotes, setTreatmentNotes] = useState<string>('Tedavi Başarı İle Uygulandı');
  const [notAppliedReason, setNotAppliedReason] = useState<string>('');
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [unselectedTreatmentReason, setUnselectedTreatmentReason] = useState<string>('');
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [selectedEmergencyCause, setSelectedEmergencyCause] = useState<string>('');
  const [customEmergencyCause, setCustomEmergencyCause] = useState<string>('');
  const [emergencyPatient, setEmergencyPatient] = useState<TreatmentPatient | null>(null);
  
  // Additional Treatment Request state
  const [isAdditionalTreatmentModalOpen, setIsAdditionalTreatmentModalOpen] = useState(false);
  const [additionalTreatmentPatient, setAdditionalTreatmentPatient] = useState<TreatmentPatient | null>(null);

  useEffect(() => {
    if (!doctorProfile?.clinicId) return;

    console.log('🏥 TreatmentPanel: Setting up real-time listener for clinicId:', doctorProfile.clinicId);
    setLoading(true);

    // Real-time listener for patients
    const allClinicPatientsQuery = query(
      collection(db, 'patients'),
      where('clinicId', '==', doctorProfile.clinicId)
    );
    
    const unsubscribe = onSnapshot(allClinicPatientsQuery, (snapshot) => {
      const allClinicPatients = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TreatmentPatient));
      
      console.log('🏥 TreatmentPanel: Total patients in clinic:', allClinicPatients.length);
      console.log('🏥 TreatmentPanel: All patient statuses:', allClinicPatients.map(p => ({ name: p.fullName, status: p.status, appointmentType: p.appointmentType })));
      
      // Filter patients with payment_completed status (ready for treatment)
      const pendingTreatments = allClinicPatients.filter(patient =>
        (patient.status === 'payment_completed' && patient.paymentCompleted === true) ||
        patient.status === 'treatment_continue'
      ).sort((a, b) => {
        const dateA = new Date(a.paymentDate || a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.paymentDate || b.updatedAt || b.createdAt).getTime();
        return dateA - dateB; // Oldest payments first (earliest treatments first)
      });

      console.log('🏥 TreatmentPanel: Pending treatment patients:', pendingTreatments.length);
      setPendingTreatmentPatients(pendingTreatments);

      // Filter patients with treatment_completed status
      const completedTreatments = allClinicPatients.filter(patient =>
        patient.status === 'treatment_completed'
      ).sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt).getTime();
        const dateB = new Date(a.updatedAt || a.createdAt).getTime();
        return dateA - dateB; // Most recent treatments first
      }).slice(0, 50); // Limit to last 50 treatments

      console.log('🏥 TreatmentPanel: Completed treatment patients:', completedTreatments.length);
      setCompletedTreatmentPatients(completedTreatments);

      // Calculate stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayTreatments = completedTreatments.filter(patient =>
        patient.updatedAt && new Date(patient.updatedAt) >= todayStart
      ).length;

      setStats({
        totalPendingTreatments: pendingTreatments.length,
        todayTreatments,
        completedTreatments: completedTreatments.length,
        inProgressTreatments: pendingTreatments.length
      });

      setLoading(false);
    }, (error) => {
      console.error('❌ TreatmentPanel: Error listening to patients:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [doctorProfile?.clinicId]);

  const handleMarkAsEmergency = (patient: TreatmentPatient) => {
    setEmergencyPatient(patient);
    setSelectedEmergencyCause('');
    setCustomEmergencyCause('');
    setIsEmergencyModalOpen(true);
  };

  const handleConfirmEmergency = async () => {
    if (!emergencyPatient) return;

    const finalCause = selectedEmergencyCause === 'Diğer'
      ? customEmergencyCause.trim()
      : selectedEmergencyCause;

    if (!finalCause) {
      alert('Lütfen bir acil durum nedeni seçin veya yazın.');
      return;
    }

    if (selectedEmergencyCause === 'Diğer' && customEmergencyCause.trim().length < 10) {
      alert('Özel neden en az 10 karakter olmalıdır.');
      return;
    }

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', emergencyPatient.id);

      await updateDoc(patientRef, {
        isEmergency: true,
        emergencyCause: finalCause,
        emergencyMarkedAt: new Date().toISOString(),
        emergencyMarkedBy: doctorProfile?.fullName || '',
        updatedAt: new Date().toISOString()
      });

      console.log(`🚨 Patient marked as emergency: ${emergencyPatient.fullName}`);

      // Close modal and reset
      setIsEmergencyModalOpen(false);
      setEmergencyPatient(null);
      setSelectedEmergencyCause('');
      setCustomEmergencyCause('');

      // Refetch data
      window.location.reload();

    } catch (error) {
      console.error('❌ Error marking patient as emergency:', error);
      alert('Acil durum işaretlenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessTreatment = async () => {
    if (!selectedPatient) return;

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', selectedPatient.id);

      // Get all planned treatments and determine which were unselected
      const allTreatments = selectedPatient.treatmentOptions?.selectedMainApplications || [];
      const unselectedTreatments = allTreatments.filter((t: string) => !selectedTreatments.includes(t));
      const hasUnselectedTreatments = unselectedTreatments.length > 0;

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString()
      };

      if (treatmentApplied) {
        // Check if some treatments were not applied (unselected)
        if (hasUnselectedTreatments) {
          // Partial treatment - send to Muhasebe for payment of applied treatments
          updateData.status = 'treatment_decided';
          updateData.paymentCompleted = false;
          updateData.treatmentCompletedAt = new Date().toISOString();
          updateData.treatmentApplied = true;
          updateData.treatmentPartiallyApplied = true;
          updateData.appliedTreatments = selectedTreatments;
          updateData.unselectedTreatments = unselectedTreatments;
          updateData.unselectedTreatmentReason = unselectedTreatmentReason.trim() || 'Hasta tarafından reddedildi';
          updateData.postTreatmentPayment = true;
          if (treatmentNotes.trim()) {
            updateData.treatmentNotes = treatmentNotes.trim();
          }
        } else {
          // All treatments applied - send to Muhasebe for payment
          updateData.status = 'treatment_decided';
          updateData.paymentCompleted = false;
          updateData.treatmentCompletedAt = new Date().toISOString();
          updateData.treatmentApplied = true;
          updateData.treatmentPartiallyApplied = false;
          updateData.appliedTreatments = selectedTreatments;
          updateData.unselectedTreatments = [];
          updateData.postTreatmentPayment = true;
          if (treatmentNotes.trim()) {
            updateData.treatmentNotes = treatmentNotes.trim();
          }
        }
      } else {
        // No treatment applied at all - send to Muhasebe for cancellation/zero payment
        updateData.status = 'treatment_decided';
        updateData.paymentCompleted = false;
        updateData.treatmentApplied = false;
        updateData.treatmentPartiallyApplied = false;
        updateData.treatmentNotAppliedReason = notAppliedReason.trim();
        updateData.appliedTreatments = [];
        updateData.unselectedTreatments = allTreatments;
        updateData.postTreatmentPayment = true;
        if (treatmentNotes.trim()) {
          updateData.treatmentNotes = treatmentNotes.trim();
        }
      }

      await updateDoc(patientRef, updateData);

      console.log(`✅ Treatment processed for patient: ${selectedPatient.fullName}`);
      console.log(`✅ Applied treatments: ${selectedTreatments.join(', ')}`);
      if (hasUnselectedTreatments) {
        console.log(`⚠️ Unselected treatments (refund required): ${unselectedTreatments.join(', ')}`);
      }

      // Reset modal state
      setIsTreatmentModalOpen(false);
      setSelectedPatient(null);
      setTreatmentApplied(true);
      setTreatmentNotes('Tedavi Başarı İle Uygulandı');
      setNotAppliedReason('');
      setSelectedTreatments([]);
      setUnselectedTreatmentReason('');

      // Refetch data
      window.location.reload(); // Simple refresh for now

    } catch (error) {
      console.error('❌ Error processing treatment:', error);
      alert('Tedavi işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-white">Tedavi Verileri Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <span className="text-4xl">🏥</span>
          Tedavi Ekranı
        </h1>
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
              <p className="text-white/70 text-sm font-medium">Bekleyen Tedaviler</p>
              <p className="text-2xl font-bold text-white">{stats.totalPendingTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bugünkü Tedaviler</p>
              <p className="text-2xl font-bold text-white">{stats.todayTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">✅</span>
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
              <span className="text-2xl">🎯</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">İşlemde Olanlar</p>
              <p className="text-2xl font-bold text-white">{stats.inProgressTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-orange-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🔄</span>
            </div>
          </div>
        </div>
      </div>

      {/* List Filter Buttons */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          Tedavi Listesi Filtreleri
        </h3>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveListType('pending_treatment')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'pending_treatment'
                ? 'bg-blue-500/30 border-2 border-blue-400 text-blue-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">⏳</span>
            Bekleyen Tedaviler ({pendingTreatmentPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('completed_treatment')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'completed_treatment'
                ? 'bg-green-500/30 border-2 border-green-400 text-green-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">✅</span>
            Tamamlanan Tedaviler ({completedTreatmentPatients.length})
          </button>
        </div>
      </div>

      {/* Patient List */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/20">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {activeListType === 'pending_treatment' ? (
              <>
                <span className="text-2xl">⏳</span>
                Bekleyen Tedaviler
              </>
            ) : (
              <>
                <span className="text-2xl">✅</span>
                Tamamlanan Tedaviler
              </>
            )}
          </h3>
        </div>

        <div className="divide-y divide-white/10">
          {(activeListType === 'pending_treatment' ? pendingTreatmentPatients : completedTreatmentPatients).map((patient) => (
            <div key={patient.id} className="p-6 hover:bg-white/5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {patient.fullName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">{patient.fullName}</h4>
                    <p className="text-white/60 text-sm">TC: {patient.tcNo}</p>
                    <p className="text-white/60 text-sm">📞 {patient.phone}</p>
                  </div>
                </div>

                <div className="text-right">
                  {activeListType === 'pending_treatment' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-500/20 border border-blue-400 rounded-full text-blue-200 text-xs font-medium">
                          Tedavi Bekliyor
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">
                        Ödeme: {formatDate(patient.paymentDate)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Tutar: {formatCurrency(patient.paymentAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Doktor: {patient.assignedDoctorName || 'Belirtilmemiş'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          patient.status === 'treatment_completed'
                            ? 'bg-green-500/20 border border-green-400 text-green-200'
                            : 'bg-red-500/20 border border-red-400 text-red-200'
                        }`}>
                          {patient.status === 'treatment_completed' ? 'Tedavi Tamamlandı' : 'Tedavi Uygulanmadı'}
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">
                        {formatDate(patient.updatedAt)}
                      </p>
                      {patient.treatmentNotes && (
                        <p className="text-white/60 text-xs max-w-xs truncate">
                          Not: {patient.treatmentNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {activeListType === 'pending_treatment' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedPatient(patient);
                        setTreatmentApplied(true);
                        setTreatmentNotes('Tedavi Başarı İle Uygulandı');
                        setNotAppliedReason('');
                        // Initialize selected treatments with all available treatments
                        const allTreatments = patient.treatmentOptions?.selectedMainApplications || [];
                        setSelectedTreatments([...allTreatments]);
                        setUnselectedTreatmentReason('');
                        setIsTreatmentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-green-500/20 border border-green-400 rounded-xl text-green-200 hover:bg-green-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">🏥</span>
                      Tedavi Uygula
                    </button>
                    <button
                      onClick={() => handleMarkAsEmergency(patient)}
                      disabled={loading}
                      className="px-4 py-2 bg-red-500/20 border border-red-400 rounded-xl text-red-200 hover:bg-red-500/30 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-lg">🚨</span>
                      Acil Durum
                    </button>
                    <button
                      onClick={() => {
                        setAdditionalTreatmentPatient(patient);
                        setIsAdditionalTreatmentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-purple-500/20 border border-purple-400 rounded-xl text-purple-200 hover:bg-purple-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">💊</span>
                      Ek Tedavi Talep Et
                    </button>
                  </div>
                )}
              </div>

              {/* Treatment Details */}
              {patient.treatmentOptions && (
                <div className="mt-4 p-4 bg-white/5 rounded-xl">
                  <h5 className="text-white/80 font-medium mb-2">Tedavi Detayları:</h5>
                  <div className="text-sm text-white/60 space-y-1">
                    <p>Protokol: {patient.treatmentOptions.protocolName || 'Belirtilmemiş'}</p>
                    {patient.treatmentOptions.selectedMainApplications && (
                      <p>Uygulamalar: {patient.treatmentOptions.selectedMainApplications.join(', ')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {(activeListType === 'pending_treatment' ? pendingTreatmentPatients : completedTreatmentPatients).length === 0 && (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">
                {activeListType === 'pending_treatment' ? '⏳' : '✅'}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {activeListType === 'pending_treatment' ? 'Bekleyen Tedavi Yok' : 'Henüz Tamamlanan Tedavi Yok'}
              </h3>
              <p className="text-white/60">
                {activeListType === 'pending_treatment' 
                  ? 'Şu anda tedavi bekleyen hasta bulunmuyor.'
                  : 'Henüz tamamlanan tedavi kaydı bulunmuyor.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Treatment Modal */}
      {isTreatmentModalOpen && selectedPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                🏥 Tedavi Uygulama
              </h3>
              <p className="text-gray-600">
                {selectedPatient.fullName} için tedavi işlemi
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Selected Applications Display - Clickable to toggle */}
              {selectedPatient.treatmentOptions?.selectedMainApplications && selectedPatient.treatmentOptions.selectedMainApplications.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏥</span>
                    Uygulanacak Tedaviler
                    <span className="text-xs font-normal text-blue-600 ml-2">
                      (Uygulanmayan tedavileri kaldırmak için tıklayın)
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {selectedPatient.treatmentOptions.selectedMainApplications.map((application: string, index: number) => {
                      const isSelected = selectedTreatments.includes(application);
                      return (
                        <div 
                          key={index} 
                          onClick={() => {
                            if (treatmentApplied) {
                              if (isSelected) {
                                setSelectedTreatments(prev => prev.filter(t => t !== application));
                              } else {
                                setSelectedTreatments(prev => [...prev, application]);
                              }
                            }
                          }}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer transition-all duration-200 ${
                            !treatmentApplied 
                              ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                              : isSelected 
                                ? 'bg-white border-blue-200 hover:bg-blue-50' 
                                : 'bg-red-50 border-red-300 hover:bg-red-100'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                            !treatmentApplied
                              ? 'bg-gray-400 text-white'
                              : isSelected 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-red-500 text-white'
                          }`}>
                            {isSelected ? index + 1 : '✕'}
                          </div>
                          <span className={`font-medium ${
                            !treatmentApplied
                              ? 'text-gray-500'
                              : isSelected 
                                ? 'text-blue-900' 
                                : 'text-red-700 line-through'
                          }`}>
                            {application}
                          </span>
                          <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                            !treatmentApplied
                              ? 'text-gray-600 bg-gray-200'
                              : isSelected 
                                ? 'text-green-600 bg-green-100' 
                                : 'text-red-600 bg-red-100'
                          }`}>
                            {!treatmentApplied ? 'Devre Dışı' : isSelected ? 'Uygulanacak' : 'İade Edilecek'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Warning for unselected treatments */}
                  {treatmentApplied && selectedTreatments.length < (selectedPatient.treatmentOptions.selectedMainApplications?.length || 0) && (
                    <div className="mt-3 p-3 bg-orange-100 border border-orange-300 rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="text-xl">⚠️</span>
                        <div className="flex-1">
                          <p className="text-orange-800 font-medium text-sm">
                            {selectedPatient.treatmentOptions.selectedMainApplications.length - selectedTreatments.length} tedavi uygulanmayacak!
                          </p>
                          <p className="text-orange-700 text-xs mt-1">
                            Hasta, uygulanmayan tedaviler için İade Bekleyenler listesine yönlendirilecektir.
                          </p>
                          
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-orange-800 mb-1">
                              Uygulanmama Nedeni (Opsiyonel)
                            </label>
                            <input
                              type="text"
                              value={unselectedTreatmentReason}
                              onChange={(e) => setUnselectedTreatmentReason(e.target.value)}
                              placeholder="Örn: Hasta reddetti, zaman yetersiz..."
                              className="w-full px-2 py-1 text-sm border border-orange-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {treatmentApplied && selectedTreatments.length === 0 && (
                    <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
                      <span className="font-medium">⚠️ Uyarı:</span> En az bir tedavi seçmelisiniz veya "Tedavi Uygulanmadı" seçeneğini işaretleyin.
                    </div>
                  )}
                  
                  {selectedPatient.treatmentOptions?.protocolName && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">Protokol:</span> {selectedPatient.treatmentOptions.protocolName}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Treatment Status Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tedavi Durumu
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="treatmentStatus"
                      checked={treatmentApplied === true}
                      onChange={() => setTreatmentApplied(true)}
                      className="mr-2"
                    />
                    <span className="text-green-700 font-medium">✅ Tedavi Uygulandı</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="treatmentStatus"
                      checked={treatmentApplied === false}
                      onChange={() => setTreatmentApplied(false)}
                      className="mr-2"
                    />
                    <span className="text-red-700 font-medium">❌ Tedavi Uygulanmadı</span>
                  </label>
                </div>
              </div>

              {/* Reason for not applying treatment */}
              {!treatmentApplied && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tedavi Uygulanmama Nedeni * (En az 20 karakter)
                  </label>
                  <textarea
                    value={notAppliedReason}
                    onChange={(e) => setNotAppliedReason(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      notAppliedReason.length > 0 && notAppliedReason.length < 20
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                    placeholder="Tedavi neden uygulanmadığını açıklayın... (En az 20 karakter)"
                    rows={3}
                    required
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs ${
                      notAppliedReason.length < 20 ? 'text-red-600 font-medium' : 'text-green-600'
                    }`}>
                      {notAppliedReason.length < 20
                        ? `${20 - notAppliedReason.length} karakter daha gerekli`
                        : '✓ Yeterli açıklama'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {notAppliedReason.length} / 20
                    </span>
                  </div>
                </div>
              )}

              {/* Treatment Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tedavi Açıklaması
                </label>
                <textarea
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Tedavi ile ilgili açıklama..."
                  rows={3}
                />
              </div>

              {/* Patient Info Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Hasta Bilgileri</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>Ad Soyad: {selectedPatient.fullName}</p>
                  <p>TC No: {selectedPatient.tcNo}</p>
                  <p>Telefon: {selectedPatient.phone}</p>
                  <p>Ödeme Tarihi: {formatDate(selectedPatient.paymentDate)}</p>
                  <p>Ödeme Tutarı: {formatCurrency(selectedPatient.paymentAmount || 0)}</p>
                  <p>Doktor: {selectedPatient.assignedDoctorName || 'Belirtilmemiş'}</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsTreatmentModalOpen(false);
                  setSelectedPatient(null);
                  setTreatmentApplied(true);
                  setTreatmentNotes('Tedavi Başarı İle Uygulandı');
                  setNotAppliedReason('');
                  setSelectedTreatments([]);
                  setUnselectedTreatmentReason('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleProcessTreatment}
                disabled={loading || (!treatmentApplied && notAppliedReason.trim().length < 20) || (treatmentApplied && selectedTreatments.length === 0)}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    🏥 Tedavi Kaydet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      {isEmergencyModalOpen && emergencyPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-red-50">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🚨</span>
                <div>
                  <h3 className="text-xl font-bold text-red-800">
                    Acil Durum
                  </h3>
                  <p className="text-red-600 text-sm">
                    {emergencyPatient.fullName}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Acil Durum Nedeni Seçin
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'Yüksek Ateş', icon: '🌡️' },
                    { value: 'Şiddetli Ağrı', icon: '⚠️' },
                    { value: 'Nefes Darlığı', icon: '😮‍💨' },
                    { value: 'Kalp Sorunu', icon: '❤️' },
                    { value: 'Baş Dönmesi', icon: '😵' },
                    { value: 'Alerji Reaksiyonu', icon: '🤧' },
                    { value: 'Kanama', icon: '🩸' },
                    { value: 'Bayılma', icon: '😴' },
                    { value: 'Şok Belirtileri', icon: '⚡' },
                    { value: 'Şiddetli Bulantı', icon: '🤢' },
                    { value: 'Travma', icon: '🤕' },
                    { value: 'Diğer', icon: '📝' }
                  ].map((cause) => (
                    <button
                      key={cause.value}
                      onClick={() => setSelectedEmergencyCause(cause.value)}
                      className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                        selectedEmergencyCause === cause.value
                          ? 'bg-red-50 border-red-500 shadow-md scale-105'
                          : 'bg-white border-gray-200 hover:border-red-300 hover:bg-red-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{cause.icon}</span>
                        <span className={`text-sm font-medium ${
                          selectedEmergencyCause === cause.value
                            ? 'text-red-700'
                            : 'text-gray-700'
                        }`}>
                          {cause.value}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedEmergencyCause === 'Diğer' && (
                <div className="animate-fadeIn">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Özel Neden (En az 10 karakter)
                  </label>
                  <textarea
                    value={customEmergencyCause}
                    onChange={(e) => setCustomEmergencyCause(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                      customEmergencyCause.length > 0 && customEmergencyCause.length < 10
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                    placeholder="Acil durum nedenini detaylı yazın..."
                    rows={3}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs ${
                      customEmergencyCause.length < 10 ? 'text-red-600 font-medium' : 'text-green-600'
                    }`}>
                      {customEmergencyCause.length < 10
                        ? `${10 - customEmergencyCause.length} karakter daha gerekli`
                        : '✓ Yeterli açıklama'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {customEmergencyCause.length} / 10
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                <p className="text-yellow-800 text-sm">
                  <span className="font-semibold">⚠️ Uyarı:</span> Bu hasta acil durumlar listesine eklenecektir.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
              <button
                onClick={() => {
                  setIsEmergencyModalOpen(false);
                  setEmergencyPatient(null);
                  setSelectedEmergencyCause('');
                  setCustomEmergencyCause('');
                }}
                className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleConfirmEmergency}
                disabled={loading || !selectedEmergencyCause || (selectedEmergencyCause === 'Diğer' && customEmergencyCause.trim().length < 10)}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    🚨 Acil Durum Olarak İşaretle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Treatment Request Modal */}
      {additionalTreatmentPatient && (
        <AdditionalTreatmentRequestModal
          isOpen={isAdditionalTreatmentModalOpen}
          onClose={() => {
            setIsAdditionalTreatmentModalOpen(false);
            setAdditionalTreatmentPatient(null);
          }}
          patientId={additionalTreatmentPatient.id}
          patientName={additionalTreatmentPatient.fullName}
          doctorProfile={doctorProfile}
        />
      )}
    </div>
  );
};

export default TreatmentPanel;
