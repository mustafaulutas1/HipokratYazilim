import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface AccountingScreenProps {
  doctorProfile?: any;
}

interface PaymentPatient {
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
  treatmentOptions?: any;
  paymentCompleted?: boolean;
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  updatedAt?: string;
  indirim_check?: boolean;
  indirim_orani?: number;
}

interface PaymentStats {
  totalPendingPayments: number;
  todayPayments: number;
  totalRevenue: number;
  pendingAmount: number;
}

const AccountingScreen: React.FC<AccountingScreenProps> = ({ doctorProfile }) => {
  const [stats, setStats] = useState<PaymentStats>({
    totalPendingPayments: 0,
    todayPayments: 0,
    totalRevenue: 0,
    pendingAmount: 0
  });
  const [pendingPaymentPatients, setPendingPaymentPatients] = useState<PaymentPatient[]>([]);
  const [paidPatients, setPaidPatients] = useState<PaymentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListType, setActiveListType] = useState<'pending_payment' | 'completed_payment'>('pending_payment');
  const [selectedPatient, setSelectedPatient] = useState<PaymentPatient | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('nakit');

  useEffect(() => {
    const fetchAccountingData = async () => {
      if (!doctorProfile?.clinicId) return;

      try {
        setLoading(true);
        console.log('💰 AccountingScreen: Fetching data for clinicId:', doctorProfile.clinicId);

        // Fetch all patients for this clinic
        const allClinicPatientsQuery = query(
          collection(db, 'patients'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        
        const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
        const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as PaymentPatient));
        
        console.log('💰 AccountingScreen: Total patients in clinic:', allClinicPatients.length);
        
        // Filter patients with treatment_decided status (pending payment)
        const pendingPayments = allClinicPatients.filter(patient =>
          patient.status === 'treatment_decided' &&
          !patient.paymentCompleted
        ).sort((a, b) => {
          const dateA = new Date(a.treatmentStartedAt || a.createdAt).getTime();
          const dateB = new Date(b.treatmentStartedAt || b.createdAt).getTime();
          return dateA - dateB; // Oldest first (earliest treatment decisions first)
        });

        console.log('💰 AccountingScreen: Pending payment patients:', pendingPayments.length);
        setPendingPaymentPatients(pendingPayments);

        // Filter patients with completed payments
        const completedPayments = allClinicPatients.filter(patient =>
          patient.paymentCompleted === true
        ).sort((a, b) => {
          const dateA = new Date(b.paymentDate || b.updatedAt || b.createdAt).getTime();
          const dateB = new Date(a.paymentDate || a.updatedAt || a.createdAt).getTime();
          return dateA - dateB; // Most recent payments first
        }).slice(0, 50); // Limit to last 50 payments

        console.log('💰 AccountingScreen: Completed payment patients:', completedPayments.length);
        setPaidPatients(completedPayments);

        // Calculate stats
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayPayments = completedPayments.filter(patient =>
          patient.paymentDate && new Date(patient.paymentDate) >= todayStart
        ).length;

        const totalRevenue = completedPayments.reduce((sum, patient) => 
          sum + (patient.paymentAmount || 0), 0
        );

        const estimatedPendingAmount = pendingPayments.length * 500; // Estimated 500 TL per treatment

        setStats({
          totalPendingPayments: pendingPayments.length,
          todayPayments,
          totalRevenue,
          pendingAmount: estimatedPendingAmount
        });

      } catch (error) {
        console.error('❌ AccountingScreen: Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountingData();
  }, [doctorProfile?.clinicId]);

  const handleProcessPayment = async () => {
    if (!selectedPatient || !paymentAmount) return;

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', selectedPatient.id);
      
      await updateDoc(patientRef, {
        paymentCompleted: true,
        paymentAmount: parseFloat(paymentAmount),
        paymentDate: new Date().toISOString(),
        paymentMethod: paymentMethod,
        status: 'payment_completed',
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Payment processed for patient: ${selectedPatient.fullName}`);
      
      // Refresh data
      setIsPaymentModalOpen(false);
      setSelectedPatient(null);
      setPaymentAmount('');
      setPaymentMethod('nakit');
      
      // Refetch data
      window.location.reload(); // Simple refresh for now

    } catch (error) {
      console.error('❌ Error processing payment:', error);
      alert('Ödeme işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
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

  const getPaymentMethodLabel = (method: string) => {
    const methods: { [key: string]: string } = {
      'nakit': 'Nakit',
      'kartkredi': 'Kredi Kartı',
      'kartdebit': 'Banka Kartı',
      'havale': 'Havale/EFT',
      'cek': 'Çek'
    };
    return methods[method] || method;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-white">Muhasebe Verileri Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <span className="text-4xl">💰</span>
          Muhasebe Ekranı
        </h1>
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span className="text-white/80 text-sm">Aktif</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-red-500/20 to-red-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bekleyen Ödemeler</p>
              <p className="text-2xl font-bold text-white">{stats.totalPendingPayments}</p>
            </div>
            <div className="w-12 h-12 bg-red-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bugünkü Ödemeler</p>
              <p className="text-2xl font-bold text-white">{stats.todayPayments}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Toplam Gelir</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">💎</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Bekleyen Tutar</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(stats.pendingAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-orange-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">💸</span>
            </div>
          </div>
        </div>
      </div>

      {/* List Filter Buttons */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">📋</span>
          Ödeme Listesi Filtreleri
        </h3>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveListType('pending_payment')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'pending_payment'
                ? 'bg-red-500/30 border-2 border-red-400 text-red-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">⏳</span>
            Bekleyen Ödemeler ({pendingPaymentPatients.length})
          </button>

          <button
            onClick={() => setActiveListType('completed_payment')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'completed_payment'
                ? 'bg-green-500/30 border-2 border-green-400 text-green-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">✅</span>
            Tamamlanan Ödemeler ({paidPatients.length})
          </button>
        </div>
      </div>

      {/* Patient List */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/20">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {activeListType === 'pending_payment' ? (
              <>
                <span className="text-2xl">⏳</span>
                Bekleyen Ödemeler
              </>
            ) : (
              <>
                <span className="text-2xl">✅</span>
                Tamamlanan Ödemeler
              </>
            )}
          </h3>
        </div>

        <div className="divide-y divide-white/10">
          {(activeListType === 'pending_payment' ? pendingPaymentPatients : paidPatients).map((patient) => (
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
                  {activeListType === 'pending_payment' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-red-500/20 border border-red-400 rounded-full text-red-200 text-xs font-medium">
                          Ödeme Bekliyor
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">
                        Tedavi: {formatDate(patient.treatmentStartedAt)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Doktor: {patient.assignedDoctorName || 'Belirtilmemiş'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-green-500/20 border border-green-400 rounded-full text-green-200 text-xs font-medium">
                          Ödendi
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">
                        {formatCurrency(patient.paymentAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        {formatDate(patient.paymentDate)} • {getPaymentMethodLabel(patient.paymentMethod || 'nakit')}
                      </p>
                    </div>
                  )}
                </div>

                {activeListType === 'pending_payment' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedPatient(patient);
                        setIsPaymentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-green-500/20 border border-green-400 rounded-xl text-green-200 hover:bg-green-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">💳</span>
                      Ödeme Al
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
                    {patient.indirim_check && (
                      <div className="mt-2 p-2 bg-green-500/20 border border-green-400/30 rounded-lg">
                        <p className="text-green-200 font-medium text-xs">
                          🎯 İndirim Aktif: %{patient.indirim_orani || 20} indirim uygulanacak
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {(activeListType === 'pending_payment' ? pendingPaymentPatients : paidPatients).length === 0 && (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">
                {activeListType === 'pending_payment' ? '⏳' : '✅'}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {activeListType === 'pending_payment' ? 'Bekleyen Ödeme Yok' : 'Henüz Tamamlanan Ödeme Yok'}
              </h3>
              <p className="text-white/60">
                {activeListType === 'pending_payment' 
                  ? 'Şu anda ödeme bekleyen hasta bulunmuyor.'
                  : 'Henüz tamamlanan ödeme kaydı bulunmuyor.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                💳 Ödeme Alma
              </h3>
              <p className="text-gray-600">
                {selectedPatient.fullName} için ödeme işlemi
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Selected Applications Display */}
              {selectedPatient.treatmentOptions?.selectedMainApplications && selectedPatient.treatmentOptions.selectedMainApplications.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏥</span>
                    Seçilen Ana Uygulamalar
                  </h4>
                  <div className="space-y-2">
                    {selectedPatient.treatmentOptions.selectedMainApplications.map((application: string, index: number) => (
                      <div key={index} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <span className="text-blue-900 font-medium">{application}</span>
                        <span className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                          Aktif
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
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    <span className="font-medium">💡 Not:</span> Yukarıdaki uygulamalar doktor tarafından seçilmiştir. Ücretlendirme bu uygulamalara göre yapılmalıdır.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ödeme Tutarı (TL)
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ödeme Yöntemi
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="nakit">Nakit</option>
                  <option value="kartkredi">Kredi Kartı</option>
                  <option value="kartdebit">Banka Kartı</option>
                  <option value="havale">Havale/EFT</option>
                  <option value="cek">Çek</option>
                </select>
              </div>

              {/* Patient Info Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Hasta Bilgileri</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>Ad Soyad: {selectedPatient.fullName}</p>
                  <p>TC No: {selectedPatient.tcNo}</p>
                  <p>Telefon: {selectedPatient.phone}</p>
                  <p>Tedavi Tarihi: {formatDate(selectedPatient.treatmentStartedAt)}</p>
                  <p>Doktor: {selectedPatient.assignedDoctorName || 'Belirtilmemiş'}</p>
                  {selectedPatient.indirim_check && (
                    <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded-lg">
                      <p className="text-green-800 font-medium">
                        🎯 İndirim Aktif: %{selectedPatient.indirim_orani || 20} indirim uygulanacak
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setSelectedPatient(null);
                  setPaymentAmount('');
                  setPaymentMethod('nakit');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleProcessPayment}
                disabled={loading || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    💳 Ödeme Al
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

export default AccountingScreen;