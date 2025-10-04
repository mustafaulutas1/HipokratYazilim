import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

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
  const [treatmentNotes, setTreatmentNotes] = useState<string>('');
  const [notAppliedReason, setNotAppliedReason] = useState<string>('');

  useEffect(() => {
    const fetchTreatmentData = async () => {
      if (!doctorProfile?.clinicId) return;

      try {
        setLoading(true);
        console.log('🏥 TreatmentPanel: Fetching data for clinicId:', doctorProfile.clinicId);

        // Fetch all patients for this clinic
        const allClinicPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        
        const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
        const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as TreatmentPatient));
        
        console.log('🏥 TreatmentPanel: Total patients in clinic:', allClinicPatients.length);
        
        // Filter patients with payment_completed status (ready for treatment)
        const pendingTreatments = allClinicPatients.filter(patient =>
          patient.status === 'payment_completed' &&
          patient.paymentCompleted === true
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

      } catch (error) {
        console.error('❌ TreatmentPanel: Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTreatmentData();
  }, [doctorProfile?.clinicId]);

  const handleProcessTreatment = async () => {
    if (!selectedPatient) return;

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', selectedPatient.id);
      
      const updateData: Record<string, string | boolean> = {
        updatedAt: new Date().toISOString()
      };

      if (treatmentApplied) {
        updateData.status = 'treatment_completed';
        updateData.treatmentCompletedAt = new Date().toISOString();
        updateData.treatmentApplied = true;
        if (treatmentNotes.trim()) {
          updateData.treatmentNotes = treatmentNotes.trim();
        }
      } else {
        updateData.status = 'treatment_not_applied';
        updateData.treatmentApplied = false;
        updateData.treatmentNotAppliedReason = notAppliedReason.trim();
        if (treatmentNotes.trim()) {
          updateData.treatmentNotes = treatmentNotes.trim();
        }
      }

      await updateDoc(patientRef, updateData);

      console.log(`✅ Treatment processed for patient: ${selectedPatient.fullName}, Applied: ${treatmentApplied}`);
      
      // Reset modal state
      setIsTreatmentModalOpen(false);
      setSelectedPatient(null);
      setTreatmentApplied(true);
      setTreatmentNotes('');
      setNotAppliedReason('');
      
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
                        setIsTreatmentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-green-500/20 border border-green-400 rounded-xl text-green-200 hover:bg-green-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">🏥</span>
                      Tedavi Uygula
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
              {/* Selected Applications Display */}
              {selectedPatient.treatmentOptions?.selectedMainApplications && selectedPatient.treatmentOptions.selectedMainApplications.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏥</span>
                    Uygulanacak Tedaviler
                  </h4>
                  <div className="space-y-2">
                    {selectedPatient.treatmentOptions.selectedMainApplications.map((application: string, index: number) => (
                      <div key={index} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <span className="text-blue-900 font-medium">{application}</span>
                        <span className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                          Planlı
                        </span>
                      </div>
                    ))}
                  </div>
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
                    Tedavi Uygulanmama Nedeni *
                  </label>
                  <textarea
                    value={notAppliedReason}
                    onChange={(e) => setNotAppliedReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Tedavi neden uygulanmadığını açıklayın..."
                    rows={3}
                    required
                  />
                </div>
              )}

              {/* Treatment Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tedavi Notları (İsteğe bağlı)
                </label>
                <textarea
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Tedavi ile ilgili ek notlar..."
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
                  setTreatmentNotes('');
                  setNotAppliedReason('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleProcessTreatment}
                disabled={loading || (!treatmentApplied && !notAppliedReason.trim())}
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
    </div>
  );
};

export default TreatmentPanel;
