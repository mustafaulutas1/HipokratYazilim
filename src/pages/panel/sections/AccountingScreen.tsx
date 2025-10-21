import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  treatmentApplied?: boolean;
  treatmentNotAppliedReason?: string;
  treatmentNotes?: string;
  refundProcessed?: boolean;
  refundDate?: string;
  refundAmount?: number;
  refundMethod?: string;
  optionalScans?: {
    meridianScan?: { enabled?: boolean };
    thermalScan?: { enabled?: boolean };
    toxicityScan?: { enabled?: boolean };
  };
}

interface PaymentStats {
  totalPendingPayments: number;
  todayPayments: number;
  totalRevenue: number;
  pendingAmount: number;
  totalRefunds: number;
  notAppliedTreatments: number;
}

const AccountingScreen: React.FC<AccountingScreenProps> = ({ doctorProfile }) => {
  const [stats, setStats] = useState<PaymentStats>({
    totalPendingPayments: 0,
    todayPayments: 0,
    totalRevenue: 0,
    pendingAmount: 0,
    totalRefunds: 0,
    notAppliedTreatments: 0
  });
  const [pendingPaymentPatients, setPendingPaymentPatients] = useState<PaymentPatient[]>([]);
  const [paidPatients, setPaidPatients] = useState<PaymentPatient[]>([]);
  const [notAppliedTreatmentPatients, setNotAppliedTreatmentPatients] = useState<PaymentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListType, setActiveListType] = useState<'pending_payment' | 'completed_payment' | 'not_applied_treatment'>('pending_payment');
  const [selectedPatient, setSelectedPatient] = useState<PaymentPatient | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('nakit');
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<string>('nakit');
  const [reportPeriod, setReportPeriod] = useState<string>('daily');
  const [reportData, setReportData] = useState<{
    payments: PaymentPatient[];
    refunds: PaymentPatient[];
    periodStats: {
      totalPayments: number;
      totalRefunds: number;
      netRevenue: number;
      paymentCount: number;
      refundCount: number;
    };
  }>({
    payments: [],
    refunds: [],
    periodStats: {
      totalPayments: 0,
      totalRefunds: 0,
      netRevenue: 0,
      paymentCount: 0,
      refundCount: 0
    }
  });

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

        // Filter patients with not applied treatments (need refund)
        const notAppliedTreatments = allClinicPatients.filter(patient =>
          patient.status === 'treatment_not_applied' &&
          patient.paymentCompleted === true &&
          !patient.refundProcessed
        ).sort((a, b) => {
          const dateA = new Date(b.updatedAt || b.createdAt).getTime();
          const dateB = new Date(a.updatedAt || a.createdAt).getTime();
          return dateA - dateB; // Most recent first
        });

        console.log('💰 AccountingScreen: Not applied treatment patients:', notAppliedTreatments.length);
        setNotAppliedTreatmentPatients(notAppliedTreatments);

        // Calculate stats
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayPayments = completedPayments.filter(patient =>
          patient.paymentDate && new Date(patient.paymentDate) >= todayStart
        ).length;

        const totalRevenue = completedPayments.reduce((sum, patient) => 
          sum + (patient.paymentAmount || 0), 0
        );

        const totalRefunds = allClinicPatients
          .filter(patient => patient.refundProcessed === true)
          .reduce((sum, patient) => sum + (patient.refundAmount || 0), 0);

        const estimatedPendingAmount = pendingPayments.length * 500; // Estimated 500 TL per treatment

        setStats({
          totalPendingPayments: pendingPayments.length,
          todayPayments,
          totalRevenue,
          pendingAmount: estimatedPendingAmount,
          totalRefunds,
          notAppliedTreatments: notAppliedTreatments.length
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

  const handleProcessRefund = async () => {
    if (!selectedPatient || !refundAmount) return;

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', selectedPatient.id);
      
      await updateDoc(patientRef, {
        refundProcessed: true,
        refundAmount: parseFloat(refundAmount),
        refundDate: new Date().toISOString(),
        refundMethod: refundMethod,
        status: 'refund_processed',
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Refund processed for patient: ${selectedPatient.fullName}`);
      
      // Refresh data
      setIsRefundModalOpen(false);
      setSelectedPatient(null);
      setRefundAmount('');
      setRefundMethod('nakit');
      
      // Refetch data
      window.location.reload(); // Simple refresh for now

    } catch (error) {
      console.error('❌ Error processing refund:', error);
      alert('İade işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReportData = async (period: string) => {
    if (!doctorProfile?.clinicId) return;

    try {
      setLoading(true);
      
      // Tarih aralığını hesapla
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'daily':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'weekly':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      // Tüm hastaları getir
      const allClinicPatientsQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const allClinicSnapshot = await getDocs(allClinicPatientsQuery);
      const allClinicPatients = allClinicSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PaymentPatient));

      // Ödemeleri filtrele
      const periodPayments = allClinicPatients.filter(patient => {
        if (!patient.paymentCompleted || !patient.paymentDate) return false;
        const paymentDate = new Date(patient.paymentDate);
        return paymentDate >= startDate && paymentDate <= now;
      });

      // İadeleri filtrele
      const periodRefunds = allClinicPatients.filter(patient => {
        if (!patient.refundProcessed || !patient.refundDate) return false;
        const refundDate = new Date(patient.refundDate);
        return refundDate >= startDate && refundDate <= now;
      });

      // İstatistikleri hesapla
      const totalPayments = periodPayments.reduce((sum, patient) => sum + (patient.paymentAmount || 0), 0);
      const totalRefunds = periodRefunds.reduce((sum, patient) => sum + (patient.refundAmount || 0), 0);
      const netRevenue = totalPayments - totalRefunds;

      setReportData({
        payments: periodPayments.sort((a, b) => new Date(b.paymentDate || '').getTime() - new Date(a.paymentDate || '').getTime()),
        refunds: periodRefunds.sort((a, b) => new Date(b.refundDate || '').getTime() - new Date(a.refundDate || '').getTime()),
        periodStats: {
          totalPayments,
          totalRefunds,
          netRevenue,
          paymentCount: periodPayments.length,
          refundCount: periodRefunds.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDFReport = () => {
    const doc = new jsPDF();
    const periodText = reportPeriod === 'daily' ? 'Günlük' : reportPeriod === 'weekly' ? 'Haftalık' : 'Aylık';
    const currentDate = new Date().toLocaleDateString('tr-TR');
    
    // Başlık
    doc.setFontSize(20);
    doc.text(`${periodText} Muhasebe Raporu`, 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Tarih: ${currentDate}`, 20, 30);
    doc.text(`Klinik: ${doctorProfile?.fullName || 'Belirtilmemiş'}`, 20, 35);
    
    // İstatistikler
    doc.setFontSize(14);
    doc.text('Özet İstatistikler', 20, 50);
    
    doc.setFontSize(10);
    doc.text(`Toplam Ödeme: ${formatCurrency(reportData.periodStats.totalPayments)}`, 20, 60);
    doc.text(`Toplam İade: ${formatCurrency(reportData.periodStats.totalRefunds)}`, 20, 65);
    doc.text(`Net Gelir: ${formatCurrency(reportData.periodStats.netRevenue)}`, 20, 70);
    doc.text(`Ödeme Sayısı: ${reportData.periodStats.paymentCount}`, 20, 75);
    doc.text(`İade Sayısı: ${reportData.periodStats.refundCount}`, 20, 80);
    
    // Ödemeler tablosu
    if (reportData.payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Ödemeler', 20, 95);
      
      const paymentTableData = reportData.payments.map(patient => [
        patient.fullName,
        patient.tcNo,
        formatCurrency(patient.paymentAmount || 0),
        formatDate(patient.paymentDate),
        getPaymentMethodLabel(patient.paymentMethod || 'nakit')
      ]);
      
      (doc as any).autoTable({
        head: [['Hasta Adı', 'TC No', 'Tutar', 'Tarih', 'Yöntem']],
        body: paymentTableData,
        startY: 100,
        styles: { fontSize: 8 }
      });
    }
    
    // İadeler tablosu
    if (reportData.refunds.length > 0) {
      const lastTableEnd = (doc as any).lastAutoTable.finalY || 100;
      doc.setFontSize(12);
      doc.text('İadeler', 20, lastTableEnd + 10);
      
      const refundTableData = reportData.refunds.map(patient => [
        patient.fullName,
        patient.tcNo,
        formatCurrency(patient.refundAmount || 0),
        formatDate(patient.refundDate),
        getPaymentMethodLabel(patient.refundMethod || 'nakit')
      ]);
      
      (doc as any).autoTable({
        head: [['Hasta Adı', 'TC No', 'Tutar', 'Tarih', 'Yöntem']],
        body: refundTableData,
        startY: lastTableEnd + 15,
        styles: { fontSize: 8 }
      });
    }
    
    // PDF'i indir
    doc.save(`${periodText}_Muhasebe_Raporu_${currentDate.replace(/\//g, '-')}.pdf`);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
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

        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Toplam İade</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(stats.totalRefunds)}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🔄</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">İade Bekleyen</p>
              <p className="text-2xl font-bold text-white">{stats.notAppliedTreatments}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-500/30 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
        </div>
      </div>

      {/* List Filter Buttons */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">📋</span>
            Ödeme Listesi Filtreleri
          </h3>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsReportModalOpen(true);
                fetchReportData('daily');
              }}
              className="px-4 py-2 bg-blue-500/20 border border-blue-400 rounded-xl text-blue-200 hover:bg-blue-500/30 transition-all duration-200 flex items-center gap-2"
            >
              <span className="text-lg">📊</span>
              Raporlar
            </button>
          </div>
        </div>

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

          <button
            onClick={() => setActiveListType('not_applied_treatment')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'not_applied_treatment'
                ? 'bg-yellow-500/30 border-2 border-yellow-400 text-yellow-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">⚠️</span>
            İade Bekleyen Tedaviler ({notAppliedTreatmentPatients.length})
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
            ) : activeListType === 'completed_payment' ? (
              <>
                <span className="text-2xl">✅</span>
                Tamamlanan Ödemeler
              </>
            ) : (
              <>
                <span className="text-2xl">⚠️</span>
                İade Bekleyen Tedaviler
              </>
            )}
          </h3>
        </div>

        <div className="divide-y divide-white/10">
          {(activeListType === 'pending_payment' ? pendingPaymentPatients : 
            activeListType === 'completed_payment' ? paidPatients : 
            notAppliedTreatmentPatients).map((patient) => (
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
                  ) : activeListType === 'completed_payment' ? (
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
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-400 rounded-full text-yellow-200 text-xs font-medium">
                          İade Bekliyor
                        </span>
                      </div>
                      <p className="text-white/60 text-sm">
                        Ödeme: {formatCurrency(patient.paymentAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Ödeme Tarihi: {formatDate(patient.paymentDate)}
                      </p>
                      {patient.treatmentNotAppliedReason && (
                        <p className="text-white/60 text-xs max-w-xs truncate">
                          Neden: {patient.treatmentNotAppliedReason}
                        </p>
                      )}
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

                {activeListType === 'not_applied_treatment' && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedPatient(patient);
                        setRefundAmount(patient.paymentAmount?.toString() || '');
                        setIsRefundModalOpen(true);
                      }}
                      className="px-4 py-2 bg-yellow-500/20 border border-yellow-400 rounded-xl text-yellow-200 hover:bg-yellow-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">🔄</span>
                      İade İşlemi
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

          {(activeListType === 'pending_payment' ? pendingPaymentPatients : 
            activeListType === 'completed_payment' ? paidPatients : 
            notAppliedTreatmentPatients).length === 0 && (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">
                {activeListType === 'pending_payment' ? '⏳' : 
                 activeListType === 'completed_payment' ? '✅' : '⚠️'}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {activeListType === 'pending_payment' ? 'Bekleyen Ödeme Yok' : 
                 activeListType === 'completed_payment' ? 'Henüz Tamamlanan Ödeme Yok' :
                 'İade Bekleyen Tedavi Yok'}
              </h3>
              <p className="text-white/60">
                {activeListType === 'pending_payment' 
                  ? 'Şu anda ödeme bekleyen hasta bulunmuyor.'
                  : activeListType === 'completed_payment'
                  ? 'Henüz tamamlanan ödeme kaydı bulunmuyor.'
                  : 'Şu anda iade bekleyen tedavi bulunmuyor.'
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

              {/* Optional Scans Display */}
              {selectedPatient.optionalScans && (
                selectedPatient.optionalScans.meridianScan?.enabled ||
                selectedPatient.optionalScans.thermalScan?.enabled ||
                selectedPatient.optionalScans.toxicityScan?.enabled
              ) && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    Opsiyonel Taramalar
                  </h4>
                  <div className="space-y-2">
                    {selectedPatient.optionalScans.meridianScan?.enabled && (
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-purple-200">
                        <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          ✓
                        </div>
                        <span className="text-purple-900 font-medium">Meridyen Tarama Tek Seans</span>
                        <span className="ml-auto text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                          Tarama
                        </span>
                      </div>
                    )}
                    {selectedPatient.optionalScans.thermalScan?.enabled && (
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-purple-200">
                        <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          ✓
                        </div>
                        <span className="text-purple-900 font-medium">Termal Tarama (IRIS-XP)</span>
                        <span className="ml-auto text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                          Tarama
                        </span>
                      </div>
                    )}
                    {selectedPatient.optionalScans.toxicityScan?.enabled && (
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-purple-200">
                        <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          ✓
                        </div>
                        <span className="text-purple-900 font-medium">Toksisite Ölçümü (TEK SEANS)</span>
                        <span className="ml-auto text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                          Tarama
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 p-2 bg-purple-100 border border-purple-300 rounded text-sm text-purple-800">
                    <span className="font-medium">💡 Not:</span> Bu taramalar ayrı fiyatlandırılmalıdır.
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

      {/* Refund Modal */}
      {isRefundModalOpen && selectedPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-yellow-50">
              <h3 className="text-xl font-bold text-yellow-800 mb-2 flex items-center gap-2">
                <span className="text-2xl">🔄</span>
                Yapılamayan Tedavinin İade İşlemi
              </h3>
              <p className="text-yellow-600">
                {selectedPatient.fullName} için iade işlemi
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Treatment Not Applied Reason */}
              {selectedPatient.treatmentNotAppliedReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                    <span className="text-lg">❌</span>
                    Tedavi Uygulanmama Nedeni
                  </h4>
                  <p className="text-red-800 text-sm">
                    {selectedPatient.treatmentNotAppliedReason}
                  </p>
                </div>
              )}

              {/* Original Payment Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <span className="text-lg">💳</span>
                  Orijinal Ödeme Bilgileri
                </h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <p><span className="font-medium">Ödeme Tutarı:</span> {formatCurrency(selectedPatient.paymentAmount || 0)}</p>
                  <p><span className="font-medium">Ödeme Tarihi:</span> {formatDate(selectedPatient.paymentDate)}</p>
                  <p><span className="font-medium">Ödeme Yöntemi:</span> {getPaymentMethodLabel(selectedPatient.paymentMethod || 'nakit')}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İade Tutarı (TL)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder={selectedPatient.paymentAmount?.toString() || "0"}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Önerilen tutar: {formatCurrency(selectedPatient.paymentAmount || 0)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İade Yöntemi
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
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
                  <p>Ödeme Tarihi: {formatDate(selectedPatient.paymentDate)}</p>
                  <p>Orijinal Tutar: {formatCurrency(selectedPatient.paymentAmount || 0)}</p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-yellow-800 text-sm">
                  <span className="font-semibold">⚠️ Uyarı:</span> Bu işlem geri alınamaz. İade işlemi tamamlandıktan sonra hasta kaydı "İade İşlendi" olarak işaretlenecektir.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsRefundModalOpen(false);
                  setSelectedPatient(null);
                  setRefundAmount('');
                  setRefundMethod('nakit');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={loading || !refundAmount || parseFloat(refundAmount) <= 0}
                className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    🔄 İade İşle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-blue-50">
              <h3 className="text-xl font-bold text-blue-800 mb-2 flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Günlük-Haftalık-Aylık Raporlar
              </h3>
              <p className="text-blue-600">
                Ödeme ve iade raporlarını görüntüleyin
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rapor Dönemi
                  </label>
                  <select
                    value={reportPeriod}
                    onChange={(e) => {
                      setReportPeriod(e.target.value);
                      fetchReportData(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="daily">Günlük Rapor</option>
                    <option value="weekly">Haftalık Rapor</option>
                    <option value="monthly">Aylık Rapor</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => fetchReportData(reportPeriod)}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Yükleniyor...
                      </>
                    ) : (
                      <>
                        🔄 Yenile
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">💰</span>
                    Ödemeler ({reportData.periodStats.paymentCount})
                  </h4>
                  <div className="space-y-2 text-sm text-green-800">
                    <p><span className="font-medium">Toplam Tutar:</span> {formatCurrency(reportData.periodStats.totalPayments)}</p>
                    <p><span className="font-medium">Ortalama:</span> {reportData.periodStats.paymentCount > 0 ? formatCurrency(reportData.periodStats.totalPayments / reportData.periodStats.paymentCount) : '₺0,00'}</p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🔄</span>
                    İadeler ({reportData.periodStats.refundCount})
                  </h4>
                  <div className="space-y-2 text-sm text-red-800">
                    <p><span className="font-medium">Toplam Tutar:</span> {formatCurrency(reportData.periodStats.totalRefunds)}</p>
                    <p><span className="font-medium">Ortalama:</span> {reportData.periodStats.refundCount > 0 ? formatCurrency(reportData.periodStats.totalRefunds / reportData.periodStats.refundCount) : '₺0,00'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Net Gelir</h4>
                <div className="text-2xl font-bold text-blue-800">
                  {formatCurrency(reportData.periodStats.netRevenue)}
                </div>
                <p className="text-blue-600 text-sm mt-1">
                  {reportPeriod === 'daily' && 'Bugünkü net gelir'}
                  {reportPeriod === 'weekly' && 'Bu haftaki net gelir'}
                  {reportPeriod === 'monthly' && 'Bu ayki net gelir'}
                </p>
              </div>

              {/* Ödemeler Listesi */}
              {reportData.payments.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">💰</span>
                    Ödemeler Listesi
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <div className="space-y-2">
                      {reportData.payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium text-sm">{payment.fullName}</p>
                            <p className="text-xs text-gray-600">{formatDate(payment.paymentDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm text-green-600">{formatCurrency(payment.paymentAmount || 0)}</p>
                            <p className="text-xs text-gray-600">{getPaymentMethodLabel(payment.paymentMethod || 'nakit')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* İadeler Listesi */}
              {reportData.refunds.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🔄</span>
                    İadeler Listesi
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <div className="space-y-2">
                      {reportData.refunds.map((refund) => (
                        <div key={refund.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium text-sm">{refund.fullName}</p>
                            <p className="text-xs text-gray-600">{formatDate(refund.refundDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm text-red-600">{formatCurrency(refund.refundAmount || 0)}</p>
                            <p className="text-xs text-gray-600">{getPaymentMethodLabel(refund.refundMethod || 'nakit')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {reportData.payments.length === 0 && reportData.refunds.length === 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-2">📊</div>
                  <h4 className="font-semibold text-gray-700 mb-2">Veri Bulunamadı</h4>
                  <p className="text-gray-600 text-sm">
                    {reportPeriod === 'daily' && 'Bugün için ödeme veya iade kaydı bulunmuyor.'}
                    {reportPeriod === 'weekly' && 'Bu hafta için ödeme veya iade kaydı bulunmuyor.'}
                    {reportPeriod === 'monthly' && 'Bu ay için ödeme veya iade kaydı bulunmuyor.'}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                Kapat
              </button>
              <button
                onClick={generatePDFReport}
                disabled={reportData.payments.length === 0 && reportData.refunds.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📄 PDF Dönüştür
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingScreen;