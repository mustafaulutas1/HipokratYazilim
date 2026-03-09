import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, getDocs, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { utils, writeFile } from 'xlsx';
import ExcelJS from 'exceljs';
import MultiPaymentMethodSelector, { formatPaymentMethods } from '../../../components/UI/MultiPaymentMethodSelector';
import type { PaymentMethodEntry } from '../../../components/UI/MultiPaymentMethodSelector';

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
  paymentMethods?: PaymentMethodEntry[];
  updatedAt?: string;
  indirim_check?: boolean;
  indirim_orani?: number;
  indirim_tipi?: 'yuzde' | 'tutar';
  indirim_tutar?: number;
  // Discount tracking for reporting
  discountApplied?: boolean;
  discountType?: 'yuzde' | 'tutar';
  discountValue?: number;
  discountAmount?: number;
  originalPaymentAmount?: number;
  treatmentApplied?: boolean;
  treatmentNotAppliedReason?: string;
  treatmentNotes?: string;
  refundProcessed?: boolean;
  refundDate?: string;
  refundAmount?: number;
  refundMethod?: string;
  refundMethods?: PaymentMethodEntry[];
  optionalScans?: {
    meridianScan?: { enabled?: boolean };
    thermalScan?: { enabled?: boolean };
    toxicityScan?: { enabled?: boolean };
  };
  // Debt tracking fields
  debtAmount?: number;
  debtDate?: string;
  debtReason?: string;
  originalExpectedAmount?: number;
  hasDebt?: boolean;
  // Partial treatment tracking fields
  treatmentPartiallyApplied?: boolean;
  appliedTreatments?: string[];
  unselectedTreatments?: string[];
  unselectedTreatmentReason?: string;
  requiresRefund?: boolean;
  refundReason?: string;
  // Additional treatment tracking fields
  additionalTreatmentPending?: boolean;
  additionalTreatmentName?: string;
  additionalTreatmentPrice?: number;
  // Post-treatment payment tracking (Tedavi appointment flow)
  postTreatmentPayment?: boolean;
  appointmentType?: string;
}

interface PaymentStats {
  totalPendingPayments: number;
  todayPayments: number;
  totalRevenue: number;
  pendingAmount: number;
  totalRefunds: number;
  notAppliedTreatments: number;
  totalDebtPatients: number;
  totalDebtAmount: number;
}

const AccountingScreen: React.FC<AccountingScreenProps> = ({ doctorProfile }) => {
  const filterSectionRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<PaymentStats>({
    totalPendingPayments: 0,
    todayPayments: 0,
    totalRevenue: 0,
    pendingAmount: 0,
    totalRefunds: 0,
    notAppliedTreatments: 0,
    totalDebtPatients: 0,
    totalDebtAmount: 0
  });
  const [pendingPaymentPatients, setPendingPaymentPatients] = useState<PaymentPatient[]>([]);
  const [paidPatients, setPaidPatients] = useState<PaymentPatient[]>([]);
  const [notAppliedTreatmentPatients, setNotAppliedTreatmentPatients] = useState<PaymentPatient[]>([]);
  const [debtPatients, setDebtPatients] = useState<PaymentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListType, setActiveListType] = useState<'pending_payment' | 'completed_payment' | 'not_applied_treatment' | 'debt_patients'>('pending_payment');
  const [selectedPatient, setSelectedPatient] = useState<PaymentPatient | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isDebtPaymentModalOpen, setIsDebtPaymentModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  // `paymentAmount` is the user-editable input. `payableAmount` is the actual amount
  // used for payment processing and is affected by discounts.
  const [payableAmount, setPayableAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('nakit');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [includeMuayene, setIncludeMuayene] = useState<boolean>(true);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<string>('nakit');
  const [refundMethods, setRefundMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState<string>('');
  const [debtPaymentMethod, setDebtPaymentMethod] = useState<string>('nakit');
  const [debtPaymentMethods, setDebtPaymentMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [discountPercent, setDiscountPercent] = useState<string>('');
  const [discountFixedAmount, setDiscountFixedAmount] = useState<string>('');
  const [discountType, setDiscountType] = useState<'yuzde' | 'tutar'>('yuzde');
  const [isDiscountActive, setIsDiscountActive] = useState<boolean>(false);
  const [originalAmount, setOriginalAmount] = useState<string>('');
  const [includeDebtInPayment, setIncludeDebtInPayment] = useState<boolean>(true);
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(false);
  const [remainingDebtAmount, setRemainingDebtAmount] = useState<string>('');
  const [debtNote, setDebtNote] = useState<string>('');
  const [debtPaymentNote, setDebtPaymentNote] = useState<string>('');
  const [debtSearchQuery, setDebtSearchQuery] = useState<string>('');
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
    if (!doctorProfile?.clinicId) return;

    setLoading(true);
    console.log('💰 AccountingScreen: Setting up real-time listener for clinicId:', doctorProfile.clinicId);

    // Set up real-time listener for all patients in this clinic
    const allClinicPatientsQuery = query(
      collection(db, 'patients'),
      where('clinicId', '==', doctorProfile.clinicId)
    );
    
    const unsubscribe = onSnapshot(allClinicPatientsQuery, (snapshot) => {
      const allClinicPatients = snapshot.docs.map(doc => ({
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

      // Filter patients with debt
      const patientsWithDebt = allClinicPatients.filter(patient =>
        patient.hasDebt === true &&
        patient.debtAmount &&
        patient.debtAmount > 0
      ).sort((a, b) => {
        const dateA = new Date(b.debtDate || b.updatedAt || b.createdAt).getTime();
        const dateB = new Date(a.debtDate || a.updatedAt || a.createdAt).getTime();
        return dateA - dateB; // Most recent first
      });

      console.log('💰 AccountingScreen: Debt patients:', patientsWithDebt.length);
      setDebtPatients(patientsWithDebt);

      // Calculate total debt amount
      const totalDebtAmount = patientsWithDebt.reduce((sum, patient) => 
        sum + (patient.debtAmount || 0), 0
      );

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
        notAppliedTreatments: notAppliedTreatments.length,
        totalDebtPatients: patientsWithDebt.length,
        totalDebtAmount
      });

      setLoading(false);
    }, (error) => {
      console.error('❌ AccountingScreen: Error in real-time listener:', error);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [doctorProfile?.clinicId]);

  // Auto-calculate remaining debt when partial payment is enabled
  useEffect(() => {
    if (!isPartialPayment) return;

    const paidTotal = paymentMethods.reduce((sum, m) => sum + (parseFloat(String(m.amount)) || 0), 0);
    const dueTotal = parseFloat(payableAmount) || 0;
    const remaining = Math.max(0, dueTotal - paidTotal);
    setRemainingDebtAmount(remaining.toFixed(2));
  }, [isPartialPayment, paymentMethods, payableAmount]);

  // Keep primary payment method amount synced with payableAmount when it changes
  useEffect(() => {
    if (paymentMethods.length > 0) {
      setPaymentMethods((prev) => prev.map((m, i) => i === 0 ? { ...m, amount: parseFloat(payableAmount) || 0 } : m));
    }
  }, [payableAmount]);

  const handleProcessPayment = async () => {
    if (!selectedPatient || !payableAmount) return;

    // Validate discount
    if (isDiscountActive && !originalAmount) {
      alert('⚠️ Lütfen indirimi uygulamadan önce ödeme tutarını girin!');
      return;
    }

    if (isDiscountActive && !discountPercent && !discountFixedAmount) {
      alert('⚠️ İndirim seçtiniz fakat yüzde veya tutarını seçmemişsiniz!\n\nLütfen bir indirim oranı veya tutarı seçin.');
      return;
    }

    if (isDiscountActive) {
      const discountValue = discountType === 'yuzde' ? parseFloat(discountPercent) : parseFloat(discountFixedAmount);
      if (isNaN(discountValue) || discountValue <= 0) {
        alert('⚠️ Geçerli bir indirim değeri giriniz!');
        return;
      }
    }

    try {
      setLoading(true);
      const patientRef = doc(db, 'patients', selectedPatient.id);
      
      // Get removed applications
      const allApplications = selectedPatient.treatmentOptions?.selectedMainApplications || [];
      const removedApplications = allApplications.filter((app: string) => !selectedApplications.includes(app));
      
      // Get current payment amount (this should already have discount applied)
      const currentPayment = parseFloat(payableAmount);
      
      // Calculate previous debt to potentially add to payment
      const previousDebt = (includeDebtInPayment && selectedPatient.debtAmount) ? selectedPatient.debtAmount : 0;
      
      // Determine if there's new debt from this transaction
      const newDebtAmount = isPartialPayment && remainingDebtAmount ? parseFloat(remainingDebtAmount) : 0;
      
      // Total debt = new debt from this payment + any previous debt NOT being paid off
      const totalRemainingDebt = newDebtAmount + (!includeDebtInPayment && selectedPatient.debtAmount ? selectedPatient.debtAmount : 0);
      
      // Calculate discount amount based on type
      let calculatedDiscountAmount = 0;
      let calculatedDiscountPercent = 0;
      if (isDiscountActive && originalAmount) {
        const original = parseFloat(originalAmount);
        if (discountType === 'yuzde' && discountPercent) {
          calculatedDiscountPercent = parseFloat(discountPercent);
          calculatedDiscountAmount = original * calculatedDiscountPercent / 100;
        } else if (discountType === 'tutar' && discountFixedAmount) {
          calculatedDiscountAmount = parseFloat(discountFixedAmount);
          calculatedDiscountPercent = (calculatedDiscountAmount / original) * 100;
        }
      }

      const updateData: any = {
        paymentCompleted: true,
        paymentAmount: currentPayment,
        paymentDate: new Date().toISOString(),
        paymentMethod: paymentMethod,
        // Multi-payment method support
        paymentMethods: paymentMethods.filter(m => m.amount > 0),
        // Save which applications the patient will actually receive
        approvedApplications: selectedApplications,
        removedApplications: removedApplications,
        // Muayene (Examination) selection
        includeMuayene: includeMuayene,
        // If payment is after treatment (Tedavi flow), mark as completed. Otherwise, send to treatment.
        status: selectedPatient.postTreatmentPayment ? 'treatment_completed' : 'treatment_continue',
        updatedAt: new Date().toISOString(),
        // Discount tracking for reporting
        discountApplied: isDiscountActive && calculatedDiscountAmount > 0,
        discountType: isDiscountActive ? discountType : null,
        discountValue: isDiscountActive ? (discountType === 'yuzde' ? calculatedDiscountPercent : calculatedDiscountAmount) : null,
        discountAmount: isDiscountActive ? Math.round(calculatedDiscountAmount * 100) / 100 : null,
        originalPaymentAmount: isDiscountActive && originalAmount ? parseFloat(originalAmount) : null,
        // Clear additional treatment flags after payment
        additionalTreatmentPending: false,
        additionalTreatmentName: null,
        additionalTreatmentPrice: null,
        // Clear post-treatment payment flag
        postTreatmentPayment: false,
      };
      
      // Handle debt tracking - simplified with explicit checkbox
      if (totalRemainingDebt > 0) {
        updateData.hasDebt = true;
        updateData.debtAmount = Math.round(totalRemainingDebt * 100) / 100;
        updateData.debtDate = new Date().toISOString();
        updateData.debtReason = isPartialPayment
          ? `Eksik ödeme - Ödenen: ${currentPayment.toLocaleString('tr-TR')} TL, Kalan borç: ${totalRemainingDebt.toLocaleString('tr-TR')} TL`
          : selectedPatient.debtReason || 'Önceki borç';
        updateData.debtNote = debtNote.trim() || null;
      } else {
        // Clear any previous debt
        updateData.hasDebt = false;
        updateData.debtAmount = 0;
        updateData.debtDate = null;
        updateData.debtReason = null;
      }
      
      // If paying off previous debt, record it
      if (includeDebtInPayment && previousDebt > 0) {
        updateData.previousDebtCleared = true;
        updateData.previousDebtClearedDate = new Date().toISOString();
        updateData.previousDebtClearedAmount = previousDebt;
      }
      
      await updateDoc(patientRef, updateData);

      console.log(`✅ Payment processed for patient: ${selectedPatient.fullName}`);
      console.log(`✅ Approved applications: ${selectedApplications.join(', ')}`);
      if (totalRemainingDebt > 0) {
        console.log(`⚠️ Remaining debt: ${totalRemainingDebt.toLocaleString('tr-TR')} TL`);
      }
      if (removedApplications.length > 0) {
        console.log(`⚠️ Removed applications: ${removedApplications.join(', ')}`);
      }
      
      // Refresh data
      setIsPaymentModalOpen(false);
      setSelectedPatient(null);
      setPaymentAmount('');
      setPayableAmount('');
      setPaymentMethod('nakit');
      setPaymentMethods([{ method: 'nakit', amount: 0 }]);
      setSelectedApplications([]);
      setIsPartialPayment(false);
      setRemainingDebtAmount('');
      setDebtNote('');
      // Reset discount states
      setIsDiscountActive(false);
      setDiscountPercent('');
      setDiscountFixedAmount('');
      setDiscountType('yuzde');
      setOriginalAmount('');
      
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
        // Multi-payment method support for refunds
        refundMethods: refundMethods.filter(m => m.amount > 0),
        status: 'refund_processed',
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Refund processed for patient: ${selectedPatient.fullName}`);

      // Refresh data
      setIsRefundModalOpen(false);
      setSelectedPatient(null);
      setRefundAmount('');
      setRefundMethod('nakit');
      setRefundMethods([{ method: 'nakit', amount: 0 }]);

      // Refetch data
      window.location.reload(); // Simple refresh for now

    } catch (error) {
      console.error('❌ Error processing refund:', error);
      alert('İade işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessDebtPayment = async () => {
    if (!selectedPatient || !debtPaymentAmount || !doctorProfile?.clinicId) return;

    try {
      setLoading(true);
      
      const paymentAmountNum = parseFloat(debtPaymentAmount);
      const currentDebt = selectedPatient.debtAmount || 0;
      
      // Validate required patient fields
      if (!selectedPatient.tcNo) {
        alert('⚠️ Hastanın TC No bilgisi eksik. Lütfen hasta bilgilerini kontrol edin.');
        setLoading(false);
        return;
      }
      
      // Validate payment amount
      if (paymentAmountNum <= 0) {
        alert('⚠️ Lütfen geçerli bir ödeme tutarı girin!');
        setLoading(false);
        return;
      }
      
      if (!isPartialPayment && paymentAmountNum > currentDebt) {
        alert(`⚠️ Ödeme tutarı borç tutarından fazla olamaz!\n\nMevcut Borç: ${currentDebt.toLocaleString('tr-TR')} TL\nGiriş Tutarı: ${paymentAmountNum.toLocaleString('tr-TR')} TL\n\nKısmi ödeme yapmak istiyorsanız "Hasta borcun tamamını ödemiyor" seçeneğini işaretleyin.`);
        setLoading(false);
        return;
      }
      
      // Validate payment methods
      const validPaymentMethods = debtPaymentMethods.filter(m => m.amount > 0);
      if (validPaymentMethods.length === 0) {
        alert('⚠️ Lütfen ödeme yöntemi seçin!');
        setLoading(false);
        return;
      }
      
      const batch = writeBatch(db);
      const patientRef = doc(db, 'patients', selectedPatient.id);
      const remainingDebt = currentDebt - paymentAmountNum;
      
      // First, get all unpaid pharmacy debts for this patient
      const debtsRef = collection(db, 'pharmacy_debts');
      const debtsQuery = query(
        debtsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('patientTcNo', '==', selectedPatient.tcNo),
        where('isPaid', '==', false)
      );
      
      let unpaidDebts: any[] = [];
      try {
        const debtsSnapshot = await getDocs(debtsQuery);
        debtsSnapshot.forEach((docSnap) => {
          unpaidDebts.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });
      } catch (debtsError: any) {
        // If pharmacy_debts collection doesn't exist, continue without pharmacy debt updates
        console.log('ℹ️ No pharmacy debts collection or query failed:', debtsError.message);
      }
      
      // Sort by date, oldest first
      unpaidDebts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // Mark debts as paid until payment amount is used up
      let remainingPayment = paymentAmountNum;
      for (const debt of unpaidDebts) {
        if (remainingPayment <= 0) break;
        
        const debtAmount = debt.amount || 0;
        const debtRef = doc(db, 'pharmacy_debts', debt.id);
        
        if (remainingPayment >= debtAmount) {
          // Fully pay this debt
          batch.update(debtRef, {
            isPaid: true,
            paidAt: new Date().toISOString(),
            paidAmount: debtAmount,
            paymentMethod: debtPaymentMethod,
            paidFrom: 'muhasebe'
          });
          remainingPayment -= debtAmount;
        } else {
          // Partially pay this debt - update the amount
          batch.update(debtRef, {
            amount: debtAmount - remainingPayment,
            partialPaymentAt: new Date().toISOString(),
            partialPaymentAmount: remainingPayment,
            partialPaymentMethod: debtPaymentMethod
          });
          remainingPayment = 0;
        }
      }
      
      const paymentHistoryEntry = {
        date: new Date().toISOString(),
        amount: paymentAmountNum,
        methods: validPaymentMethods.length > 0 ? validPaymentMethods : [{ method: debtPaymentMethod, amount: paymentAmountNum }],
        note: debtPaymentNote.trim() || null,
        remainingDebtAfter: Math.max(0, Math.round((currentDebt - paymentAmountNum) * 100) / 100),
      };

      const updateData: any = {
        updatedAt: new Date().toISOString(),
        // Record this debt payment
        lastDebtPaymentAmount: paymentAmountNum,
        lastDebtPaymentDate: new Date().toISOString(),
        lastDebtPaymentMethod: debtPaymentMethod,
        lastDebtPaymentMethods: validPaymentMethods.length > 0 ? validPaymentMethods : [{ method: debtPaymentMethod, amount: paymentAmountNum }],
        lastDebtPaymentNote: debtPaymentNote.trim() || null,
        // Append to cumulative payment history
        debtPaymentHistory: arrayUnion(paymentHistoryEntry),
      };
      
      if (remainingDebt <= 0) {
        // Debt fully paid
        updateData.hasDebt = false;
        updateData.debtAmount = 0;
        updateData.debtDate = null;
        updateData.debtReason = null;
        updateData.debtFullyPaidAt = new Date().toISOString();
        updateData.debtFullyPaidAmount = currentDebt;
      } else if (remainingDebt > 0) {
        // Partial debt payment
        updateData.hasDebt = true;
        updateData.debtAmount = Math.round(remainingDebt * 100) / 100;
        updateData.debtReason = `Kısmi borç ödemesi yapıldı - Ödenen: ${paymentAmountNum.toLocaleString('tr-TR')} TL, Kalan: ${Math.round(remainingDebt * 100) / 100} TL`;
      }
      
      batch.update(patientRef, updateData);
      
      // Commit all changes
      await batch.commit();

      if (remainingDebt <= 0) {
        console.log(`✅ Debt fully paid for patient: ${selectedPatient.fullName}`);
        alert(`✅ Borç tamamen kapatıldı! Ödenen tutar: ${paymentAmountNum.toLocaleString('tr-TR')} TL`);
      } else {
        console.log(`✅ Partial debt payment for patient: ${selectedPatient.fullName}, Remaining: ${remainingDebt.toLocaleString('tr-TR')} TL`);
        alert(`✅ Kısmi borç ödemesi alındı! Kalan borç: ${Math.round(remainingDebt * 100) / 100} TL`);
      }
      
      // Refresh data
      setIsDebtPaymentModalOpen(false);
      setSelectedPatient(null);
      setDebtPaymentAmount('');
      setDebtPaymentMethod('nakit');
      setDebtPaymentMethods([{ method: 'nakit', amount: 0 }]);
      setDebtPaymentNote('');

      // Refetch data
      window.location.reload();

    } catch (error: any) {
      console.error('❌ Error processing debt payment:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      alert(`❌ Borç ödemesi işlenirken bir hata oluştu.\n\nHata: ${error.message || 'Bilinmeyen hata'}\n\nLütfen yöneticiyle iletişim kurun.`);
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
      const allClinicPatients = allClinicSnapshot.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({
        id: doc.id,
        ...doc.data()
      } as PaymentPatient));

      // Ödemeleri filtrele – paymentDate yoksa updatedAt veya createdAt'e geri dön
      const periodPayments = allClinicPatients.filter((patient: PaymentPatient) => {
        if (!patient.paymentCompleted) return false;
        const dateStr = patient.paymentDate || patient.updatedAt || patient.createdAt;
        if (!dateStr) return false;
        const paymentDate = new Date(dateStr);
        return paymentDate >= startDate && paymentDate <= now;
      });

      // İadeleri filtrele – refundDate yoksa updatedAt veya createdAt'e geri dön
      const periodRefunds = allClinicPatients.filter((patient: PaymentPatient) => {
        if (!patient.refundProcessed) return false;
        const dateStr = patient.refundDate || patient.updatedAt || patient.createdAt;
        if (!dateStr) return false;
        const refundDate = new Date(dateStr);
        return refundDate >= startDate && refundDate <= now;
      });

      // İstatistikleri hesapla
      const totalPayments = periodPayments.reduce((sum: number, patient: PaymentPatient) => sum + (patient.paymentAmount || 0), 0);
      const totalRefunds = periodRefunds.reduce((sum: number, patient: PaymentPatient) => sum + (patient.refundAmount || 0), 0);
      const netRevenue = totalPayments - totalRefunds;

      setReportData({
        payments: periodPayments.sort((a, b) =>
          new Date(b.paymentDate || b.updatedAt || b.createdAt || '').getTime() -
          new Date(a.paymentDate || a.updatedAt || a.createdAt || '').getTime()
        ),
        refunds: periodRefunds.sort((a, b) =>
          new Date(b.refundDate || b.updatedAt || b.createdAt || '').getTime() -
          new Date(a.refundDate || a.updatedAt || a.createdAt || '').getTime()
        ),
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

  const generateExcelReport = async () => {
    const periodText = reportPeriod === 'daily' ? 'Günlük' : reportPeriod === 'weekly' ? 'Haftalık' : 'Aylık';
    const currentDate = new Date().toLocaleDateString('tr-TR');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RTM Soft';
    workbook.created = new Date();

    // ── Renkler ───────────────────────────────────────────────────────────────
    const C = {
      headerBg:  '1F4E78',
      accentBg:  'EBF3FB',
      altRowBg:  'F5F9FC',
      greenBg:   '1A7A4A',
      greenText: '155C38',
      redBg:     'C0392B',
      redText:   '922B21',
      borderClr: 'BDD7EE',
      white:     'FFFFFFFF',
      black:     'FF1A1A2E',
    };

    // ── Stil yardımcıları ─────────────────────────────────────────────────────
    const border = (clr = C.borderClr): ExcelJS.Border => ({ style: 'thin', color: { argb: `FF${clr}` } });
    const allBorders = (clr = C.borderClr) => ({ top: border(clr), left: border(clr), bottom: border(clr), right: border(clr) });

    const sectionHeader = (cell: ExcelJS.Cell, text: string, bgHex: string) => {
      cell.value = text;
      cell.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgHex}` } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(bgHex);
    };

    const labelCell = (cell: ExcelJS.Cell, text: string, bgHex = C.accentBg) => {
      cell.value = text;
      cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: C.black } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgHex}` } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      cell.border = allBorders();
    };

    const valueCell = (cell: ExcelJS.Cell, val: any, opts: { numFmt?: string; color?: string; bold?: boolean; bgHex?: string; align?: ExcelJS.Alignment['horizontal'] } = {}) => {
      cell.value = val;
      cell.font = { size: 10, name: 'Calibri', bold: opts.bold ?? false, color: { argb: opts.color ? `FF${opts.color}` : C.black } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bgHex ? `FF${opts.bgHex}` : C.white } };
      cell.alignment = { horizontal: opts.align ?? 'right', vertical: 'middle' };
      cell.border = allBorders();
      if (opts.numFmt) cell.numFmt = opts.numFmt;
    };

    const colHeader = (cell: ExcelJS.Cell, text: string, bgHex = C.headerBg) => {
      cell.value = text;
      cell.font = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgHex}` } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = allBorders(bgHex);
    };

    const dataCell = (cell: ExcelJS.Cell, val: any, opts: { numFmt?: string; align?: ExcelJS.Alignment['horizontal']; alt?: boolean } = {}) => {
      cell.value = val;
      cell.font = { size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.alt ? `FF${C.altRowBg}` : C.white } };
      cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', indent: opts.align !== 'right' ? 1 : 0 };
      cell.border = allBorders();
      if (opts.numFmt) cell.numFmt = opts.numFmt;
    };

    // ── Ek istatistikler hesapla ──────────────────────────────────────────────
    const { totalPayments, totalRefunds, netRevenue, paymentCount, refundCount } = reportData.periodStats;
    const avgPayment = paymentCount > 0 ? totalPayments / paymentCount : 0;
    const maxPayment = reportData.payments.reduce((m, p) => Math.max(m, p.paymentAmount || 0), 0);
    const minPayment = reportData.payments.length > 0
      ? reportData.payments.reduce((m, p) => Math.min(m, p.paymentAmount || Infinity), Infinity)
      : 0;

    // Tarih aralığı
    const payDates = reportData.payments.map(p => new Date(p.paymentDate || p.updatedAt || p.createdAt || '').getTime()).filter(Boolean);
    const periodStart = payDates.length ? new Date(Math.min(...payDates)).toLocaleDateString('tr-TR') : '-';
    const periodEnd   = payDates.length ? new Date(Math.max(...payDates)).toLocaleDateString('tr-TR') : '-';
    const dateRange   = payDates.length ? `${periodStart} – ${periodEnd}` : '-';

    // Ödeme yöntemi dağılımı
    const methodTotals: Record<string, { count: number; amount: number }> = {};
    reportData.payments.forEach(p => {
      if (p.paymentMethods && p.paymentMethods.length > 0) {
        p.paymentMethods.forEach((m: any) => {
          if ((m.amount || 0) > 0) {
            const lbl = getPaymentMethodLabel(m.method);
            if (!methodTotals[lbl]) methodTotals[lbl] = { count: 0, amount: 0 };
            methodTotals[lbl].amount += m.amount;
          }
        });
        const lbl0 = getPaymentMethodLabel(p.paymentMethods[0]?.method || 'nakit');
        if (!methodTotals[lbl0]) methodTotals[lbl0] = { count: 0, amount: 0 };
        methodTotals[lbl0].count += 1;
      } else {
        const lbl = getPaymentMethodLabel(p.paymentMethod || 'nakit');
        if (!methodTotals[lbl]) methodTotals[lbl] = { count: 0, amount: 0 };
        methodTotals[lbl].count += 1;
        methodTotals[lbl].amount += p.paymentAmount || 0;
      }
    });
    const methodEntries = Object.entries(methodTotals);

    // ── ÖZET SAYFASI ─────────────────────────────────────────────────────────
    const S = workbook.addWorksheet('Özet', { views: [{ showGridLines: false }] });
    S.columns = [{ width: 36 }, { width: 26 }];

    let row = 1;

    // Başlık
    S.mergeCells(`A${row}:B${row}`);
    const title = S.getCell(`A${row}`);
    title.value = `RTM Soft  ·  ${periodText} Muhasebe Raporu`;
    title.font = { bold: true, size: 15, color: { argb: C.white }, name: 'Calibri' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.headerBg}` } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.border = allBorders(C.headerBg);
    S.getRow(row).height = 40; row++;

    // Rapor bilgileri
    const infoData: [string, string][] = [
      ['Rapor Dönemi',   periodText],
      ['Rapor Tarihi',   currentDate],
      ['Kapsanan Tarihler', dateRange],
    ];
    infoData.forEach(([lbl, val]) => {
      labelCell(S.getCell(`A${row}`), lbl);
      valueCell(S.getCell(`B${row}`), val, { align: 'left' });
      S.getRow(row).height = 20; row++;
    });

    // Boşluk satırı (görsel ayraç — çok ince)
    S.getRow(row).height = 6; row++;

    // ─ Özet İstatistikler ─
    S.mergeCells(`A${row}:B${row}`);
    sectionHeader(S.getCell(`A${row}`), 'ÖZET İSTATİSTİKLER', C.headerBg);
    S.getRow(row).height = 24; row++;

    const statRows: [string, number, string, string][] = [
      ['Toplam Ödeme Sayısı',   paymentCount,  '#,##0 "adet"', C.greenText],
      ['Toplam Ödeme Tutarı',   totalPayments, '#,##0.00 ₺',  C.greenText],
      ['Ortalama Ödeme Tutarı', avgPayment,    '#,##0.00 ₺',  C.greenText],
      ['En Yüksek Ödeme',       maxPayment,    '#,##0.00 ₺',  C.greenText],
      ['En Düşük Ödeme',        minPayment === Infinity ? 0 : minPayment, '#,##0.00 ₺', C.greenText],
      ['Toplam İade Sayısı',    refundCount,   '#,##0 "adet"', C.redText],
      ['Toplam İade Tutarı',    totalRefunds,  '#,##0.00 ₺',  C.redText],
      ['Net Gelir',             netRevenue,    '#,##0.00 ₺',  C.headerBg],
    ];
    statRows.forEach(([lbl, val, fmt, color], i) => {
      const alt = i % 2 === 1;
      const bg = alt ? C.altRowBg : undefined;
      labelCell(S.getCell(`A${row}`), lbl, alt ? C.altRowBg : C.accentBg);
      valueCell(S.getCell(`B${row}`), val, { numFmt: fmt, color, bold: true, bgHex: bg });
      S.getRow(row).height = 22; row++;
    });

    // Boşluk satırı
    S.getRow(row).height = 6; row++;

    // ─ Ödeme Yöntemi Dağılımı ─
    if (methodEntries.length > 0) {
      S.mergeCells(`A${row}:B${row}`);
      sectionHeader(S.getCell(`A${row}`), 'ÖDEME YÖNTEMİ DAĞILIMI', C.headerBg);
      S.getRow(row).height = 24; row++;

      methodEntries.forEach(([method, data], i) => {
        const alt = i % 2 === 1;
        labelCell(S.getCell(`A${row}`), `${method} (${data.count} işlem)`, alt ? C.altRowBg : C.accentBg);
        valueCell(S.getCell(`B${row}`), data.amount, { numFmt: '#,##0.00 ₺', color: C.greenText, bold: true, bgHex: alt ? C.altRowBg : undefined });
        S.getRow(row).height = 20; row++;
      });
    }

    // ── ÖDEMELER SAYFASI ─────────────────────────────────────────────────────
    if (reportData.payments.length > 0) {
      const PS = workbook.addWorksheet('Ödemeler', { views: [{ showGridLines: false, state: 'frozen', ySplit: 2 }] });
      PS.columns = [
        { width: 26 }, // Hasta Adı
        { width: 15 }, // TC No
        { width: 15 }, // Telefon
        { width: 20 }, // Tutar
        { width: 14 }, // Tarih
        { width: 10 }, // Saat
        { width: 22 }, // Yöntem
      ];

      // Başlık
      PS.mergeCells('A1:G1');
      const ph = PS.getCell('A1');
      ph.value = `Ödeme Detayları  ·  ${periodText}  ·  ${currentDate}`;
      ph.font = { bold: true, size: 12, color: { argb: C.white }, name: 'Calibri' };
      ph.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.greenBg}` } };
      ph.alignment = { horizontal: 'center', vertical: 'middle' };
      ph.border = allBorders(C.greenBg);
      PS.getRow(1).height = 28;

      // Kolon başlıkları
      ['Hasta Adı', 'TC No', 'Telefon', 'Ödeme Tutarı', 'Tarih', 'Saat', 'Ödeme Yöntemi'].forEach((h, i) => {
        colHeader(PS.getRow(2).getCell(i + 1), h, C.greenBg);
      });
      PS.getRow(2).height = 22;

      // Veri satırları
      reportData.payments.forEach((p, idx) => {
        const alt = idx % 2 === 1;
        const r = PS.addRow([]);
        r.height = 20;
        dataCell(r.getCell(1), p.fullName, { alt });
        dataCell(r.getCell(2), p.tcNo || '-', { alt });
        dataCell(r.getCell(3), p.phone || '-', { alt });
        dataCell(r.getCell(4), p.paymentAmount || 0, { numFmt: '#,##0.00 ₺', align: 'right', alt });
        dataCell(r.getCell(5), p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('tr-TR') : '-', { align: 'center', alt });
        dataCell(r.getCell(6), p.paymentDate ? new Date(p.paymentDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-', { align: 'center', alt });
        dataCell(r.getCell(7), (p.paymentMethods?.length ?? 0) > 0 ? formatPaymentMethods(p.paymentMethods!) : getPaymentMethodLabel(p.paymentMethod || 'nakit'), { alt });
      });

      // Toplam satırı
      const tr = PS.addRow([]);
      tr.height = 24;
      ['TOPLAM', '', '', totalPayments, '', '', ''].forEach((v, i) => {
        const c = tr.getCell(i + 1);
        c.value = v || null;
        c.font = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.greenBg}` } };
        c.alignment = { horizontal: i === 3 ? 'right' : 'left', vertical: 'middle' };
        c.border = allBorders(C.greenBg);
        if (i === 3) c.numFmt = '#,##0.00 ₺';
      });
    }

    // ── İADELER SAYFASI ──────────────────────────────────────────────────────
    if (reportData.refunds.length > 0) {
      const RS = workbook.addWorksheet('İadeler', { views: [{ showGridLines: false, state: 'frozen', ySplit: 2 }] });
      RS.columns = [
        { width: 26 }, { width: 15 }, { width: 15 },
        { width: 20 }, { width: 14 }, { width: 10 }, { width: 22 },
      ];

      // Başlık
      RS.mergeCells('A1:G1');
      const rh = RS.getCell('A1');
      rh.value = `İade Detayları  ·  ${periodText}  ·  ${currentDate}`;
      rh.font = { bold: true, size: 12, color: { argb: C.white }, name: 'Calibri' };
      rh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.redBg}` } };
      rh.alignment = { horizontal: 'center', vertical: 'middle' };
      rh.border = allBorders(C.redBg);
      RS.getRow(1).height = 28;

      ['Hasta Adı', 'TC No', 'Telefon', 'İade Tutarı', 'Tarih', 'Saat', 'İade Yöntemi'].forEach((h, i) => {
        colHeader(RS.getRow(2).getCell(i + 1), h, C.redBg);
      });
      RS.getRow(2).height = 22;

      reportData.refunds.forEach((p, idx) => {
        const alt = idx % 2 === 1;
        const r = RS.addRow([]);
        r.height = 20;
        dataCell(r.getCell(1), p.fullName, { alt });
        dataCell(r.getCell(2), p.tcNo || '-', { alt });
        dataCell(r.getCell(3), p.phone || '-', { alt });
        dataCell(r.getCell(4), p.refundAmount || 0, { numFmt: '#,##0.00 ₺', align: 'right', alt });
        dataCell(r.getCell(5), p.refundDate ? new Date(p.refundDate).toLocaleDateString('tr-TR') : '-', { align: 'center', alt });
        dataCell(r.getCell(6), p.refundDate ? new Date(p.refundDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-', { align: 'center', alt });
        dataCell(r.getCell(7), (p.refundMethods?.length ?? 0) > 0 ? formatPaymentMethods(p.refundMethods!) : getPaymentMethodLabel(p.refundMethod || 'nakit'), { alt });
      });

      const tr = RS.addRow([]);
      tr.height = 24;
      ['TOPLAM', '', '', totalRefunds, '', '', ''].forEach((v, i) => {
        const c = tr.getCell(i + 1);
        c.value = v || null;
        c.font = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.redBg}` } };
        c.alignment = { horizontal: i === 3 ? 'right' : 'left', vertical: 'middle' };
        c.border = allBorders(C.redBg);
        if (i === 3) c.numFmt = '#,##0.00 ₺';
      });
    }

    // Dosyayı indir
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${periodText}_Muhasebe_Raporu_${currentDate.replace(/\./g, '-')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Excel export function for accounting data
  const exportToExcel = () => {
    const workbook = utils.book_new();
    
    // Stil tanımları
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    const titleStyle = {
      font: { bold: true, size: 14, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '203864' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const labelStyle = {
      font: { bold: true, size: 11, color: { rgb: '1F4E78' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    };

    const numberStyle = {
      numFmt: '#,##0.00',
      alignment: { horizontal: 'right', vertical: 'center' },
      border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    // Özet sayfası
    const summaryData = [
      ['MUHASEBE RAPORU - ÖZET', '', ''],
      ['', '', ''],
      ['Rapor Tarihi', new Date().toLocaleDateString('tr-TR'), ''],
      ['', '', ''],
      ['İSTATİSTİKLER', '', ''],
      ['Bekleyen Ödeme Sayısı', stats.totalPendingPayments, 'Adet'],
      ['Bugünkü Ödeme Sayısı', stats.todayPayments, 'Adet'],
      ['Toplam Gelir', stats.totalRevenue, 'TL'],
      ['Bekleyen Tutar', stats.pendingAmount, 'TL'],
      ['Toplam İade', stats.totalRefunds, 'TL'],
      ['İade Bekleyen Sayısı', stats.notAppliedTreatments, 'Adet'],
      ['', '', ''],
      ['BORÇ BİLGİLERİ', '', ''],
      ['Toplam Borçlu Hasta', stats.totalDebtPatients, 'Kişi'],
      ['Toplam Borç Tutarı', stats.totalDebtAmount, 'TL'],
    ];
    
    const summarySheet = utils.aoa_to_sheet(summaryData);
    
    // Başlık hücrelerini stillendir
    summarySheet['A1'].s = titleStyle;
    summarySheet['!merge'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    
    // Label ve veri hücrelerini stillendir
    for (let i = 2; i <= summaryData.length; i++) {
      if (summarySheet[`A${i}`]) summarySheet[`A${i}`].s = labelStyle;
      if (summarySheet[`B${i}`] && ![3, 4, 12].includes(i)) summarySheet[`B${i}`].s = numberStyle;
    }

    summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }];
    utils.book_append_sheet(workbook, summarySheet, 'Özet');

    // Bekleyen Ödemeler sayfası
    if (pendingPaymentPatients.length > 0) {
      const pendingData = pendingPaymentPatients.map(p => ({
        'Hasta Adı': p.fullName,
        'TC No': p.tcNo,
        'Telefon': p.phone,
        'Tedavi Tarihi': p.treatmentStartedAt ? new Date(p.treatmentStartedAt).toLocaleDateString('tr-TR') : '-',
        'Doktor': p.assignedDoctorName || 'Belirtilmemiş',
        'Borç Durumu': p.hasDebt && p.debtAmount ? p.debtAmount : 0,
      }));
      
      const pendingSheet = utils.json_to_sheet(pendingData);
      
      // Başlık stillendir
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach(cell => {
        if (pendingSheet[cell]) pendingSheet[cell].s = headerStyle;
      });

      // Sayı sütunlarını formatla
      for (let i = 2; i <= pendingData.length + 1; i++) {
        const cell = pendingSheet[`F${i}`];
        if (cell) {
          cell.s = numberStyle;
          cell.z = '#,##0.00';
        }
      }

      pendingSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
      pendingSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      utils.book_append_sheet(workbook, pendingSheet, 'Bekleyen Ödemeler');
    }

    // Tamamlanan Ödemeler sayfası
    if (paidPatients.length > 0) {
      const paidData = paidPatients.map(p => ({
        'Hasta Adı': p.fullName,
        'TC No': p.tcNo,
        'Telefon': p.phone,
        'Ödeme Tutarı': p.paymentAmount || 0,
        'Ödeme Tarihi': p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('tr-TR') : '-',
        'Ödeme Yöntemi': p.paymentMethods && p.paymentMethods.length > 0
          ? formatPaymentMethods(p.paymentMethods)
          : getPaymentMethodLabel(p.paymentMethod || 'nakit'),
        'Borç Durumu': p.hasDebt && p.debtAmount ? p.debtAmount : 0,
      }));
      
      const paidSheet = utils.json_to_sheet(paidData);
      
      // Başlık stillendir
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'].forEach(cell => {
        if (paidSheet[cell]) paidSheet[cell].s = headerStyle;
      });

      // Sayı sütunlarını formatla
      for (let i = 2; i <= paidData.length + 1; i++) {
        const d_cell = paidSheet[`D${i}`];
        const g_cell = paidSheet[`G${i}`];
        if (d_cell) {
          d_cell.s = numberStyle;
          d_cell.z = '#,##0.00';
        }
        if (g_cell) {
          g_cell.s = numberStyle;
          g_cell.z = '#,##0.00';
        }
      }

      paidSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }];
      paidSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      utils.book_append_sheet(workbook, paidSheet, 'Tamamlanan Ödemeler');
    }

    // İade Bekleyenler sayfası
    if (notAppliedTreatmentPatients.length > 0) {
      const refundData = notAppliedTreatmentPatients.map(p => ({
        'Hasta Adı': p.fullName,
        'TC No': p.tcNo,
        'Telefon': p.phone,
        'Ödeme Tutarı': p.paymentAmount || 0,
        'Ödeme Tarihi': p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('tr-TR') : '-',
        'İade Nedeni': p.treatmentNotAppliedReason || p.unselectedTreatmentReason || 'Belirtilmemiş',
        'Kısmi Tedavi': p.treatmentPartiallyApplied ? 'Evet' : 'Hayır'
      }));
      
      const refundSheet = utils.json_to_sheet(refundData);
      
      // Başlık stillendir
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'].forEach(cell => {
        if (refundSheet[cell]) refundSheet[cell].s = headerStyle;
      });

      // Sayı sütunlarını formatla
      for (let i = 2; i <= refundData.length + 1; i++) {
        const cell = refundSheet[`D${i}`];
        if (cell) {
          cell.s = numberStyle;
          cell.z = '#,##0.00';
        }
      }

      refundSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 12 }];
      refundSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      utils.book_append_sheet(workbook, refundSheet, 'İade Bekleyenler');
    }

    // Borçlu Hastalar sayfası
    if (debtPatients.length > 0) {
      const debtData = debtPatients.map(p => ({
        'Hasta Adı': p.fullName,
        'TC No': p.tcNo,
        'Telefon': p.phone,
        'Borç Tutarı': p.debtAmount || 0,
        'Borç Tarihi': p.debtDate ? new Date(p.debtDate).toLocaleDateString('tr-TR') : '-',
        'Borç Sebebi': p.debtReason || 'Belirtilmemiş'
      }));
      
      const debtSheet = utils.json_to_sheet(debtData);
      
      // Başlık stillendir
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach(cell => {
        if (debtSheet[cell]) debtSheet[cell].s = headerStyle;
      });

      // Sayı sütunlarını formatla
      for (let i = 2; i <= debtData.length + 1; i++) {
        const cell = debtSheet[`D${i}`];
        if (cell) {
          cell.s = numberStyle;
          cell.z = '#,##0.00';
        }
      }

      debtSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
      debtSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      utils.book_append_sheet(workbook, debtSheet, 'Borçlu Hastalar');
    }

    // Excel dosyasını indir
    const fileName = `Muhasebe_Raporu_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.xlsx`;
    writeFile(workbook, fileName);
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
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-green-500/25"
          >
            <span>📥</span>
            Raporu İndir
          </button>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-white/80 text-sm">Aktif</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Bekleyen Ödemeler */}
        <div className="bg-gradient-to-br from-amber-600/40 to-amber-700/50 backdrop-blur-xl border border-amber-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-amber-100/90 text-xs font-medium uppercase tracking-wide">Bekleyen Ödemeler</p>
              <div className="w-10 h-10 bg-amber-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">⏳</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-auto">{stats.totalPendingPayments}</p>
          </div>
        </div>

        {/* Bugünkü Ödemeler */}
        <div className="bg-gradient-to-br from-emerald-600/40 to-emerald-700/50 backdrop-blur-xl border border-emerald-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-emerald-100/90 text-xs font-medium uppercase tracking-wide">Bugünkü Ödemeler</p>
              <div className="w-10 h-10 bg-emerald-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-auto">{stats.todayPayments}</p>
          </div>
        </div>

        {/* Toplam Gelir */}
        <div className="bg-gradient-to-br from-sky-600/40 to-sky-700/50 backdrop-blur-xl border border-sky-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sky-100/90 text-xs font-medium uppercase tracking-wide">Toplam Gelir</p>
              <div className="w-10 h-10 bg-sky-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">💎</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-auto">{formatCurrency(stats.totalRevenue)}</p>
          </div>
        </div>

        {/* Bekleyen Tutar */}
        <div className="bg-gradient-to-br from-orange-600/40 to-orange-700/50 backdrop-blur-xl border border-orange-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-orange-100/90 text-xs font-medium uppercase tracking-wide">Bekleyen Tutar</p>
              <div className="w-10 h-10 bg-orange-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">💸</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-auto">{formatCurrency(stats.pendingAmount)}</p>
          </div>
        </div>

        {/* Toplam İade */}
        <div className="bg-gradient-to-br from-violet-600/40 to-violet-700/50 backdrop-blur-xl border border-violet-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-violet-100/90 text-xs font-medium uppercase tracking-wide">Toplam İade</p>
              <div className="w-10 h-10 bg-violet-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">🔄</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-auto">{formatCurrency(stats.totalRefunds)}</p>
          </div>
        </div>

        {/* İade Bekleyen */}
        <div className="bg-gradient-to-br from-slate-600/40 to-slate-700/50 backdrop-blur-xl border border-yellow-400/30 rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-yellow-100/90 text-xs font-medium uppercase tracking-wide">İade Bekleyen</p>
              <div className="w-10 h-10 bg-yellow-500/40 rounded-xl flex items-center justify-center">
                <span className="text-xl">⚠️</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-auto">{stats.notAppliedTreatments}</p>
          </div>
        </div>
      </div>

      {/* Debt Stats Card - Separate prominent display */}
      {stats.totalDebtPatients > 0 && (
        <div className="bg-gradient-to-r from-red-600/30 to-orange-600/30 backdrop-blur-xl border-2 border-red-400/50 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-red-500/30 rounded-xl flex items-center justify-center">
                <span className="text-3xl">💳</span>
              </div>
              <div>
                <p className="text-red-200 text-sm font-medium">Toplam Borçlu Hasta</p>
                <p className="text-3xl font-bold text-white">{stats.totalDebtPatients} Hasta</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-red-200 text-sm font-medium">Toplam Borç Tutarı</p>
              <p className="text-3xl font-bold text-red-100">{formatCurrency(stats.totalDebtAmount)}</p>
            </div>
            <button
              onClick={() => {
                setActiveListType('debt_patients');
                setTimeout(() => filterSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <span>💰</span>
              Borçları Gör
            </button>
          </div>
        </div>
      )}

      {/* List Filter Buttons */}
      <div ref={filterSectionRef} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
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

          <button
            onClick={() => setActiveListType('debt_patients')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeListType === 'debt_patients'
                ? 'bg-orange-500/30 border-2 border-orange-400 text-orange-200'
                : 'bg-white/5 border border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="text-lg">💳</span>
            Borçlu Hastalar ({debtPatients.length})
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
            ) : activeListType === 'debt_patients' ? (
              <>
                <span className="text-2xl">💳</span>
                Borçlu Hastalar
              </>
            ) : (
              <>
                <span className="text-2xl">⚠️</span>
                İade Bekleyen Tedaviler
              </>
            )}
          </h3>
          
          {/* Search filter for debt patients */}
          {activeListType === 'debt_patients' && (
            <div className="mt-3">
              <div className="relative">
                <input
                  type="text"
                  value={debtSearchQuery}
                  onChange={(e) => setDebtSearchQuery(e.target.value)}
                  placeholder="Hasta adı ile ara..."
                  className="w-full md:w-80 px-4 py-2 pl-10 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50">
                  🔍
                </span>
                {debtSearchQuery && (
                  <button
                    onClick={() => setDebtSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="divide-y divide-white/10">
          {(activeListType === 'pending_payment' ? pendingPaymentPatients : 
            activeListType === 'completed_payment' ? paidPatients : 
            activeListType === 'debt_patients' ? debtPatients.filter(p => 
              p.fullName?.toLowerCase().includes(debtSearchQuery.toLowerCase())
            ) :
            notAppliedTreatmentPatients).map((patient) => (
            <div key={patient.id} className="p-6 hover:bg-white/5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    activeListType === 'debt_patients' 
                      ? 'bg-gradient-to-br from-red-500 to-orange-500'
                      : 'bg-gradient-to-br from-blue-400 to-purple-500'
                  }`}>
                    {patient.fullName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">{patient.fullName}</h4>
                    <p className="text-white/60 text-sm">TC: {patient.tcNo}</p>
                    <p className="text-white/60 text-sm">📞 {patient.phone}</p>
                  </div>
                </div>

                <div className="text-right">
                  {activeListType === 'debt_patients' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-red-500/30 border border-red-400 rounded-full text-red-200 text-xs font-bold">
                          💳 BORÇLU
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-red-300">
                        {formatCurrency(patient.debtAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Borç Tarihi: {formatDate(patient.debtDate)}
                      </p>
                      {patient.debtReason && (
                        <p className="text-white/50 text-xs max-w-xs truncate">
                          {patient.debtReason}
                        </p>
                      )}
                    </div>
                  ) : activeListType === 'pending_payment' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3 py-1 bg-red-500/20 border border-red-400 rounded-full text-red-200 text-xs font-medium">
                          Ödeme Bekliyor
                        </span>
                        {patient.postTreatmentPayment && (
                          <span className="px-3 py-1 bg-emerald-500/30 border border-emerald-400 rounded-full text-emerald-200 text-xs font-bold animate-pulse">
                            🩺 TEDAVİ SONRASI ÖDEME
                          </span>
                        )}
                        {patient.additionalTreatmentPending && (
                          <span className="px-3 py-1 bg-purple-500/30 border border-purple-400 rounded-full text-purple-200 text-xs font-bold animate-pulse">
                            💊 EK TEDAVİ
                          </span>
                        )}
                        {patient.hasDebt && patient.debtAmount && patient.debtAmount > 0 && (
                          <span className="px-3 py-1 bg-orange-500/30 border border-orange-400 rounded-full text-orange-200 text-xs font-bold animate-pulse">
                            ⚠️ BORÇLU
                          </span>
                        )}
                      </div>
                      {patient.additionalTreatmentPending && patient.additionalTreatmentName && (
                        <p className="text-purple-300 text-sm font-medium">
                          Ek Tedavi: {patient.additionalTreatmentName}
                          {patient.additionalTreatmentPrice && patient.additionalTreatmentPrice > 0 && ` (${patient.additionalTreatmentPrice.toLocaleString('tr-TR')} TL)`}
                        </p>
                      )}
                      {patient.hasDebt && patient.debtAmount && patient.debtAmount > 0 && (
                        <p className="text-orange-300 text-sm font-medium">
                          Borç: {patient.debtAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                        </p>
                      )}
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
                        {patient.hasDebt && patient.debtAmount && patient.debtAmount > 0 && (
                          <span className="px-3 py-1 bg-orange-500/30 border border-orange-400 rounded-full text-orange-200 text-xs font-bold">
                            ⚠️ Borç: {patient.debtAmount.toLocaleString('tr-TR')} TL
                          </span>
                        )}
                      </div>
                      <p className="text-white/60 text-sm">
                        {formatCurrency(patient.paymentAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        {formatDate(patient.paymentDate)} • {patient.paymentMethods && patient.paymentMethods.length > 0
                          ? formatPaymentMethods(patient.paymentMethods)
                          : getPaymentMethodLabel(patient.paymentMethod || 'nakit')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3 py-1 bg-yellow-500/20 border border-yellow-400 rounded-full text-yellow-200 text-xs font-medium">
                          İade Bekliyor
                        </span>
                        {patient.treatmentPartiallyApplied && (
                          <span className="px-3 py-1 bg-orange-500/20 border border-orange-400 rounded-full text-orange-200 text-xs font-medium">
                            Kısmi Tedavi
                          </span>
                        )}
                      </div>
                      <p className="text-white/60 text-sm">
                        Ödeme: {formatCurrency(patient.paymentAmount || 0)}
                      </p>
                      <p className="text-white/60 text-sm">
                        Ödeme Tarihi: {formatDate(patient.paymentDate)}
                      </p>
                      {/* Show unselected treatments */}
                      {patient.unselectedTreatments && patient.unselectedTreatments.length > 0 && (
                        <div className="mt-2 p-2 bg-red-500/20 border border-red-400/30 rounded-lg">
                          <p className="text-red-200 text-xs font-medium mb-1">
                            ❌ Uygulanmayan Tedaviler:
                          </p>
                          <p className="text-red-100 text-xs">
                            {patient.unselectedTreatments.join(', ')}
                          </p>
                        </div>
                      )}
                      {/* Show applied treatments if partial */}
                      {patient.treatmentPartiallyApplied && patient.appliedTreatments && patient.appliedTreatments.length > 0 && (
                        <div className="mt-1 p-2 bg-green-500/20 border border-green-400/30 rounded-lg">
                          <p className="text-green-200 text-xs font-medium mb-1">
                            ✅ Uygulanan Tedaviler:
                          </p>
                          <p className="text-green-100 text-xs">
                            {patient.appliedTreatments.join(', ')}
                          </p>
                        </div>
                      )}
                      {patient.treatmentNotAppliedReason && !patient.treatmentPartiallyApplied && (
                        <p className="text-white/60 text-xs max-w-xs truncate">
                          Neden: {patient.treatmentNotAppliedReason}
                        </p>
                      )}
                      {patient.unselectedTreatmentReason && (
                        <p className="text-white/60 text-xs max-w-xs truncate">
                          Neden: {patient.unselectedTreatmentReason}
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
                        // Initialize selected applications with all applications
                        const allApplications = patient.treatmentOptions?.selectedMainApplications || [];
                        setSelectedApplications([...allApplications]);
                        setIncludeMuayene(true);
                        // Reset all payment and discount states
                        setPaymentAmount('');
                        setPayableAmount('');
                        setPaymentMethod('nakit');
                        setPaymentMethods([{ method: 'nakit', amount: 0 }]);
                        setDiscountPercent('');
                        setDiscountFixedAmount('');
                        setDiscountType('yuzde');
                        setIsDiscountActive(false);
                        setOriginalAmount('');
                        setIncludeDebtInPayment(true);
                        setIsPartialPayment(false);
                        setRemainingDebtAmount('');
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

                {activeListType === 'debt_patients' && (
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="text-right">
                      <p className="text-red-300 text-sm font-medium">Toplam Borç</p>
                      <p className="text-red-200 text-xl font-bold">{formatCurrency(patient.debtAmount || 0)}</p>
                      {patient.debtDate && (
                        <p className="text-white/50 text-xs">
                          {formatDate(patient.debtDate)}
                        </p>
                      )}
                      {patient.debtReason && (
                        <p className="text-white/50 text-xs max-w-[150px] truncate">
                          {patient.debtReason}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const debtAmount = patient.debtAmount || 0;
                        setSelectedPatient(patient);
                        setDebtPaymentAmount(debtAmount.toString());
                        setDebtPaymentMethods([{ method: 'nakit', amount: debtAmount }]);
                        setIsPartialPayment(false);
                        setRemainingDebtAmount('');
                        setIsDebtPaymentModalOpen(true);
                      }}
                      className="px-4 py-2 bg-green-500/20 border border-green-400 rounded-xl text-green-200 hover:bg-green-500/30 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-lg">💰</span>
                      Borç Öde
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
                          🎯 İndirim Aktif: {patient.indirim_tipi === 'tutar'
                            ? `${patient.indirim_tutar || 0} TL indirim uygulanacak`
                            : `%${patient.indirim_orani || 20} indirim uygulanacak`}
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
            activeListType === 'not_applied_treatment' ? notAppliedTreatmentPatients :
            debtPatients).length === 0 && (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">
                {activeListType === 'pending_payment' ? '⏳' : 
                 activeListType === 'completed_payment' ? '✅' : 
                 activeListType === 'not_applied_treatment' ? '⚠️' : '💳'}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {activeListType === 'pending_payment' ? 'Bekleyen Ödeme Yok' : 
                 activeListType === 'completed_payment' ? 'Henüz Tamamlanan Ödeme Yok' :
                 activeListType === 'not_applied_treatment' ? 'İade Bekleyen Tedavi Yok' :
                 'Borçlu Hasta Yok'}
              </h3>
              <p className="text-white/60">
                {activeListType === 'pending_payment' 
                  ? 'Şu anda ödeme bekleyen hasta bulunmuyor.'
                  : activeListType === 'completed_payment'
                  ? 'Henüz tamamlanan ödeme kaydı bulunmuyor.'
                  : activeListType === 'not_applied_treatment'
                  ? 'Şu anda iade bekleyen tedavi bulunmuyor.'
                  : 'Şu anda borcu olan hasta bulunmuyor.'
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
            {/* Debt Warning Banner - Shows at the very top if patient has debt */}
            {selectedPatient.hasDebt && selectedPatient.debtAmount && selectedPatient.debtAmount > 0 && (
              <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 rounded-t-2xl">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <span className="text-2xl">⚠️</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-lg flex items-center gap-2">
                      <span>🚨 BORÇ UYARISI</span>
                    </h4>
                    <p className="text-red-100 text-sm mt-1">
                      Bu hastanın önceki işlemlerden kalan borcu bulunmaktadır!
                    </p>
                    <div className="mt-3 bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-100 text-xs">Borç Tutarı</p>
                          <p className="text-white text-2xl font-bold">
                            {selectedPatient.debtAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-red-100 text-xs">Borç Tarihi</p>
                          <p className="text-white text-sm">
                            {selectedPatient.debtDate ? new Date(selectedPatient.debtDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}
                          </p>
                        </div>
                      </div>
                      {selectedPatient.debtReason && (
                        <p className="text-red-100 text-xs mt-2 border-t border-white/20 pt-2">
                          <span className="font-medium">Sebep:</span> {selectedPatient.debtReason}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeDebtInPayment}
                          onChange={(e) => setIncludeDebtInPayment(e.target.checked)}
                          className="w-4 h-4 rounded border-white/30 bg-white/20 text-red-500 focus:ring-red-400"
                        />
                        <span className="text-white text-sm font-medium">
                          Bu borcu mevcut ödemeye dahil et
                        </span>
                      </label>
                    </div>
                    {includeDebtInPayment && (
                      <p className="text-yellow-200 text-xs mt-2 flex items-center gap-1">
                        <span>💡</span>
                        Toplam ödenecek tutara {selectedPatient.debtAmount.toLocaleString('tr-TR')} TL borç eklenecektir.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className={`p-6 border-b border-gray-200 ${selectedPatient.hasDebt && selectedPatient.debtAmount ? '' : ''}`}>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                💳 Ödeme Alma
              </h3>
              <p className="text-gray-600">
                {selectedPatient.fullName} için ödeme işlemi
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Muayene (Ödeme Kalemi) */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                  <span className="text-lg">🩺</span>
                  Muayene
                </h4>
                <div 
                  onClick={() => setIncludeMuayene(!includeMuayene)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer transition-all duration-200 ${
                    includeMuayene 
                      ? 'bg-white border-emerald-300 hover:bg-emerald-50' 
                      : 'bg-gray-100 border-gray-300 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                    includeMuayene ? 'bg-emerald-500 text-white' : 'bg-gray-400 text-white'
                  }`}>
                    {includeMuayene ? '✓' : '✕'}
                  </div>
                  <span className={`font-medium ${
                    includeMuayene ? 'text-emerald-900' : 'text-gray-500 line-through'
                  }`}>
                    Muayene Ücreti
                  </span>
                  <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                    includeMuayene 
                      ? 'text-green-600 bg-green-100' 
                      : 'text-red-600 bg-red-100'
                  }`}>
                    {includeMuayene ? 'Dahil' : 'Hariç'}
                  </span>
                </div>
              </div>

              {/* Selected Applications Display - Clickable to toggle */}
              {selectedPatient.treatmentOptions?.selectedMainApplications && selectedPatient.treatmentOptions.selectedMainApplications.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏥</span>
                    Seçilen Ana Uygulamalar
                    <span className="text-xs font-normal text-blue-600 ml-2">
                      (Kaldırmak için tıklayın)
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {selectedPatient.treatmentOptions.selectedMainApplications.map((application: string, index: number) => {
                      const isSelected = selectedApplications.includes(application);
                      return (
                        <div 
                          key={index} 
                          onClick={() => {
                            if (isSelected) {
                              setSelectedApplications(prev => prev.filter(app => app !== application));
                            } else {
                              setSelectedApplications(prev => [...prev, application]);
                            }
                          }}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer transition-all duration-200 ${
                            isSelected 
                              ? 'bg-white border-blue-200 hover:bg-blue-50' 
                              : 'bg-gray-100 border-gray-300 opacity-60 hover:opacity-80'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                            isSelected ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'
                          }`}>
                            {isSelected ? index + 1 : '✕'}
                          </div>
                          <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-500 line-through'}`}>
                            {application}
                          </span>
                          <span className={`ml-auto text-xs px-2 py-1 rounded-full ${
                            isSelected 
                              ? 'text-green-600 bg-green-100' 
                              : 'text-red-600 bg-red-100'
                          }`}>
                            {isSelected ? 'Aktif' : 'Kaldırıldı'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {selectedApplications.length === 0 && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                      <span className="font-medium">⚠️ Uyarı:</span> En az bir uygulama seçmelisiniz.
                    </div>
                  )}
                  {selectedPatient.treatmentOptions?.protocolName && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">Protokol:</span> {selectedPatient.treatmentOptions.protocolName}
                      </p>
                    </div>
                  )}
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    <span className="font-medium">💡 Not:</span> Hasta istemediği uygulamaları kaldırabilirsiniz. Kaldırılan uygulamalar tedavi sırasında uygulanmayacaktır.
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
                        <span className="text-purple-900 font-medium">Meridyen Tarama</span>
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
                        <span className="text-purple-900 font-medium">Toksisite Ölçümü</span>
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
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => {
                      const newAmount = e.target.value;
                      setPaymentAmount(newAmount);

                      // Update payable amount only when discount is not active.
                      if (!isDiscountActive) {
                        setOriginalAmount(newAmount);
                        setPayableAmount(newAmount);
                      }

                      // Otomatik olarak ödeme yöntemi tutarını güncelle
                      if (paymentMethods.length > 0) {
                        const numAmount = parseFloat(!isDiscountActive ? newAmount : payableAmount) || 0;
                        setPaymentMethods([{
                          method: paymentMethods[0].method,
                          amount: numAmount
                        }]);
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="500"
                    min="0"
                    step="0.01"
                  />
                  {isDiscountActive && originalAmount && (
                    <div className="px-3 py-2 bg-red-50 border border-red-300 rounded-lg flex items-center gap-1 text-xs text-red-700 font-medium whitespace-nowrap">
                      <span>📍 Orijinal:</span>
                      <span>{parseFloat(originalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Discount Section */}
              <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-orange-900 flex items-center gap-2">
                    <span className="text-lg">🏷️</span>
                    İndirim Uygula
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      if (isDiscountActive) {
                        // Disable discount - restore payable amount to original
                        if (!originalAmount || parseFloat(originalAmount) <= 0) {
                          alert('⚠️ İndirim iptal edilemiyor. Lütfen baştan ödeme tutarını giriniz.');
                          return;
                        }
                        setIsDiscountActive(false);
                        setPayableAmount(originalAmount);
                        setDiscountPercent('');
                        setDiscountFixedAmount('');
                        setDiscountType('yuzde');
                      } else {
                        // Enable discount
                        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
                          alert('⚠️ Lütfen önce ödeme tutarını giriniz.');
                          return;
                        }
                        setIsDiscountActive(true);
                        setOriginalAmount(paymentAmount);
                        setPayableAmount(paymentAmount);
                        setDiscountPercent('');
                        setDiscountFixedAmount('');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isDiscountActive
                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                        : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {isDiscountActive ? '✓ İndirim Aktif' : 'İndirim Uygula'}
                  </button>
                </div>

                {isDiscountActive && (
                  <div className="space-y-3">
                    {/* Discount Type Toggle */}
                    <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-orange-200">
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountType('yuzde');
                          setDiscountFixedAmount('');
                          if (originalAmount) {
                            setPayableAmount(originalAmount);
                          }
                        }}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                          discountType === 'yuzde'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        % Yüzde
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountType('tutar');
                          setDiscountPercent('');
                          if (originalAmount) {
                            setPayableAmount(originalAmount);
                          }
                        }}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                          discountType === 'tutar'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        ₺ Tutar
                      </button>
                    </div>

                    {/* Percentage Discount Input */}
                    {discountType === 'yuzde' && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-orange-700 mb-1">
                            İndirim Oranı (%)
                          </label>
                          <input
                            type="number"
                            value={discountPercent}
                              onChange={(e) => {
                              const percent = e.target.value;
                              setDiscountPercent(percent);
                              if (percent && originalAmount) {
                                const discountValue = parseFloat(percent);
                                const original = parseFloat(originalAmount);
                                if (!isNaN(discountValue) && !isNaN(original) && discountValue >= 0 && discountValue <= 100) {
                                  const discountedAmount = original - (original * discountValue / 100);
                                  setPayableAmount(discountedAmount.toFixed(2));
                                } else if (discountValue > 100) {
                                  alert('⚠️ İndirim oranı %100 den fazla olamaz!');
                                  setDiscountPercent('100');
                                  setPayableAmount((0).toFixed(2));
                                }
                              }
                            }}
                            className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                            placeholder="10"
                            min="0"
                            max="100"
                          />
                        </div>
                        <div className="flex gap-1 pt-5 flex-wrap">
                          {[5, 10, 15, 20, 25].map((percent) => (
                            <button
                              key={percent}
                              type="button"
                                onClick={() => {
                                setDiscountPercent(percent.toString());
                                if (originalAmount) {
                                  const original = parseFloat(originalAmount);
                                  if (!isNaN(original)) {
                                    const discountedAmount = original - (original * percent / 100);
                                    setPayableAmount(discountedAmount.toFixed(2));
                                  }
                                }
                              }}
                              className={`px-2 py-1 text-xs rounded-md transition-all ${
                                discountPercent === percent.toString()
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'
                              }`}
                            >
                              %{percent}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fixed Amount Discount Input */}
                    {discountType === 'tutar' && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-orange-700 mb-1">
                            İndirim Tutarı (TL)
                          </label>
                          <input
                            type="number"
                            value={discountFixedAmount}
                            onChange={(e) => {
                              const amount = e.target.value;
                              setDiscountFixedAmount(amount);
                              if (amount && originalAmount) {
                                const discountValue = parseFloat(amount);
                                const original = parseFloat(originalAmount);
                                if (!isNaN(discountValue) && !isNaN(original) && discountValue >= 0) {
                                  if (discountValue > original) {
                                    alert(`⚠️ İndirim tutarı orijinal tutardan (${original.toLocaleString('tr-TR')} TL) fazla olamaz!`);
                                    setDiscountFixedAmount(original.toString());
                                    setPayableAmount((0).toFixed(2));
                                  } else {
                                    const discountedAmount = original - discountValue;
                                    setPayableAmount(discountedAmount.toFixed(2));
                                  }
                                }
                              }
                            }}
                            className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                            placeholder="100"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div className="flex gap-1 pt-5 flex-wrap">
                          {[50, 100, 200, 500].map((amount) => (
                            <button
                              key={amount}
                              type="button"
                                onClick={() => {
                                if (originalAmount) {
                                  const original = parseFloat(originalAmount);
                                  if (amount > original) {
                                    alert(`⚠️ İndirim tutarı orijinal tutardan (${original.toLocaleString('tr-TR')} TL) fazla olamaz!`);
                                    return;
                                  }
                                }
                                setDiscountFixedAmount(amount.toString());
                                if (originalAmount) {
                                  const original = parseFloat(originalAmount);
                                  if (!isNaN(original) && amount <= original) {
                                    const discountedAmount = original - amount;
                                    setPayableAmount(discountedAmount.toFixed(2));
                                  }
                                }
                              }}
                              className={`px-2 py-1 text-xs rounded-md transition-all ${
                                discountFixedAmount === amount.toString()
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'
                              }`}
                            >
                              {amount}₺
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Discount Summary - Percentage */}
                    {discountType === 'yuzde' && discountPercent && originalAmount && parseFloat(discountPercent) > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-orange-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Orijinal Tutar:</span>
                          <span className="text-gray-900 line-through">{parseFloat(originalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>İndirim (%{discountPercent}):</span>
                          <span>-{(parseFloat(originalAmount) * parseFloat(discountPercent) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-green-600 mt-1 pt-1 border-t border-orange-200">
                          <span>İndirimli Tutar:</span>
                          <span>{parseFloat(payableAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                      </div>
                    )}

                    {/* Discount Summary - Fixed Amount */}
                    {discountType === 'tutar' && discountFixedAmount && originalAmount && parseFloat(discountFixedAmount) > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-orange-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Orijinal Tutar:</span>
                          <span className="text-gray-900 line-through">{parseFloat(originalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>İndirim (Tutar):</span>
                          <span>-{parseFloat(discountFixedAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>İndirim Oranı:</span>
                          <span>%{((parseFloat(discountFixedAmount) / parseFloat(originalAmount)) * 100).toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-green-600 mt-1 pt-1 border-t border-orange-200">
                          <span>İndirimli Tutar:</span>
                          <span>{parseFloat(payableAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Multi Payment Method Selector */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <MultiPaymentMethodSelector
                  totalAmount={parseFloat(payableAmount) || 0}
                  originalAmount={originalAmount ? (parseFloat(originalAmount) || undefined) : undefined}
                  value={paymentMethods}
                  onChange={(methods) => {
                    setPaymentMethods(methods);
                    // Keep backwards compatibility - set primary method
                    if (methods.length > 0) {
                      setPaymentMethod(methods[0].method);
                    }
                  }}
                  disabled={loading}
                  showValidation={true}
                />
              </div>

              {/* Partial Payment Section - Explicit debt creation */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="partialPaymentCheckbox"
                    checked={isPartialPayment}
                    onChange={(e) => {
                      setIsPartialPayment(e.target.checked);
                      if (!e.target.checked) {
                        setRemainingDebtAmount('');
                      }
                    }}
                    className="w-5 h-5 rounded border-red-300 text-red-500 focus:ring-red-400"
                  />
                  <label htmlFor="partialPaymentCheckbox" className="font-semibold text-red-900 flex items-center gap-2 cursor-pointer">
                    <span className="text-lg">⚠️</span>
                    Hasta tamamını ödemedi
                  </label>
                </div>
                
                {isPartialPayment && (
                  <div className="mt-4 space-y-3">
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <label className="block text-sm font-medium text-red-700 mb-2">
                        Kalan Borç Tutarı (TL)
                      </label>
                      <input
                        type="number"
                        value={remainingDebtAmount}
                        onChange={(e) => setRemainingDebtAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Örn: 500"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-red-600 mt-2">
                        📌 Hastanın ne kadar borcu kaldığını girin. Bu tutar hastanın borç kaydına eklenecektir.
                      </p>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <label className="block text-sm font-medium text-red-700 mb-2">
                        Borç Notu (İsteğe Bağlı)
                      </label>
                      <textarea
                        value={debtNote}
                        onChange={(e) => setDebtNote(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-sm"
                        placeholder="Borçla ilgili not ekleyin... (örn: sonraki seansta ödenecek)"
                      />
                    </div>

                    {remainingDebtAmount && parseFloat(remainingDebtAmount) > 0 && (
                      <div className="bg-red-100 rounded-lg p-3 border border-red-300">
                        <div className="flex items-center gap-2 text-red-800">
                          <span className="text-xl">🚨</span>
                          <div>
                            <p className="font-bold">Borç Kaydı Oluşturulacak</p>
                            <p className="text-sm">
                              Ödeme alındıktan sonra hasta <strong>{parseFloat(remainingDebtAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</strong> borçlu olarak işaretlenecektir.
                            </p>
                            {debtNote.trim() && (
                              <p className="text-xs mt-1 text-red-700 italic">Not: {debtNote.trim()}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bilanço */}
              {(parseFloat(payableAmount) > 0 || isPartialPayment) && (
                <div className="bg-gray-900 text-white rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Ödeme Özeti (Bilanço)</h4>
                  {isDiscountActive && originalAmount && parseFloat(originalAmount) > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Orijinal Tutar</span>
                        <span className="line-through text-gray-400">{parseFloat(originalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                      </div>
                      <div className="flex justify-between text-sm text-orange-400">
                        <span>İndirim</span>
                        <span>- {(parseFloat(originalAmount) - parseFloat(payableAmount)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Ödenecek Tutar</span>
                    <span className="text-white font-medium">{parseFloat(payableAmount || '0').toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                  </div>
                  {(() => {
                    const paid = paymentMethods.reduce((s, m) => s + m.amount, 0);
                    return (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Ödenen Tutar</span>
                        <span className="text-green-400 font-medium">{paid.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                      </div>
                    );
                  })()}
                  {isPartialPayment && remainingDebtAmount && parseFloat(remainingDebtAmount) > 0 && (
                    <div className="flex justify-between text-sm border-t border-gray-700 pt-2 mt-1">
                      <span className="text-red-400">Oluşan Borç</span>
                      <span className="text-red-400 font-bold">{parseFloat(remainingDebtAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                    </div>
                  )}
                  {!isPartialPayment && (() => {
                    const paid = paymentMethods.reduce((s, m) => s + m.amount, 0);
                    const diff = paid - parseFloat(payableAmount || '0');
                    if (Math.abs(diff) < 0.01) return null;
                    return (
                      <div className="flex justify-between text-sm border-t border-gray-700 pt-2 mt-1">
                        <span className={diff > 0 ? 'text-blue-400' : 'text-yellow-400'}>{diff > 0 ? 'Para Üstü' : 'Eksik'}</span>
                        <span className={`font-bold ${diff > 0 ? 'text-blue-400' : 'text-yellow-400'}`}>{Math.abs(diff).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                      </div>
                    );
                  })()}
                </div>
              )}

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
                        🎯 İndirim Aktif: {selectedPatient.indirim_tipi === 'tutar'
                          ? `${selectedPatient.indirim_tutar || 0} TL indirim uygulanacak`
                          : `%${selectedPatient.indirim_orani || 20} indirim uygulanacak`}
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
                  setPayableAmount('');
                  setPaymentMethod('nakit');
                  setPaymentMethods([{ method: 'nakit', amount: 0 }]);
                  setSelectedApplications([]);
                  setIncludeMuayene(true);
                  setDiscountPercent('');
                  setDiscountFixedAmount('');
                  setDiscountType('yuzde');
                  setIsDiscountActive(false);
                  setOriginalAmount('');
                  setIncludeDebtInPayment(true);
                  setIsPartialPayment(false);
                  setRemainingDebtAmount('');
                  setDebtNote('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                  onClick={handleProcessPayment}
                disabled={
                  loading || 
                  !payableAmount || 
                  parseFloat(payableAmount) <= 0 || 
                  (selectedPatient?.treatmentOptions?.selectedMainApplications?.length > 0 && selectedApplications.length === 0) ||
                  (isDiscountActive && (!discountPercent && !discountFixedAmount))
                }
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  isDiscountActive && (!discountPercent && !discountFixedAmount)
                    ? 'İndirim seçtiniz. Lütfen indirim oranı veya tutarını seçiniz.'
                    : ''
                }
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
              {/* Partial Treatment Info - Show which treatments were/weren't applied */}
              {selectedPatient.treatmentPartiallyApplied && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    Kısmi Tedavi Uygulandı
                  </h4>
                  
                  {/* Applied Treatments */}
                  {selectedPatient.appliedTreatments && selectedPatient.appliedTreatments.length > 0 && (
                    <div className="mb-3">
                      <p className="text-green-700 font-medium text-sm mb-2">✅ Uygulanan Tedaviler:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedPatient.appliedTreatments.map((treatment: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {treatment}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Unselected Treatments */}
                  {selectedPatient.unselectedTreatments && selectedPatient.unselectedTreatments.length > 0 && (
                    <div className="mb-3">
                      <p className="text-red-700 font-medium text-sm mb-2">❌ Uygulanmayan Tedaviler (İade Gerekli):</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedPatient.unselectedTreatments.map((treatment: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                            {treatment}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedPatient.unselectedTreatmentReason && (
                    <p className="text-orange-700 text-sm mt-2 pt-2 border-t border-orange-200">
                      <span className="font-medium">Neden:</span> {selectedPatient.unselectedTreatmentReason}
                    </p>
                  )}
                </div>
              )}

              {/* Treatment Not Applied Reason - Only show if NO treatment was applied */}
              {!selectedPatient.treatmentPartiallyApplied && selectedPatient.treatmentNotAppliedReason && (
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
                  <p><span className="font-medium">Ödeme Yöntemi:</span> {selectedPatient.paymentMethods && selectedPatient.paymentMethods.length > 0
                    ? formatPaymentMethods(selectedPatient.paymentMethods)
                    : getPaymentMethodLabel(selectedPatient.paymentMethod || 'nakit')}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İade Tutarı (TL)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => {
                    const newAmount = e.target.value;
                    setRefundAmount(newAmount);
                    
                    // Otomatik olarak ödeme yöntemi tutarını güncelle
                    if (refundMethods.length > 0) {
                      const numAmount = parseFloat(newAmount) || 0;
                      setRefundMethods([{
                        method: refundMethods[0].method,
                        amount: numAmount
                      }]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder={selectedPatient.paymentAmount?.toString() || "0"}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Önerilen tutar: {formatCurrency(selectedPatient.paymentAmount || 0)}
                </p>
              </div>

              {/* Multi Payment Method Selector for Refund */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
                <MultiPaymentMethodSelector
                  totalAmount={parseFloat(refundAmount) || 0}
                  value={refundMethods}
                  onChange={(methods) => {
                    setRefundMethods(methods);
                    // Keep backwards compatibility - set primary method
                    if (methods.length > 0) {
                      setRefundMethod(methods[0].method);
                    }
                  }}
                  disabled={loading}
                  showValidation={true}
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
                  setRefundMethods([{ method: 'nakit', amount: 0 }]);
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

      {/* Debt Payment Modal */}
      {isDebtPaymentModalOpen && selectedPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-600 to-emerald-600">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <span className="text-2xl">💰</span>
                Borç Ödeme İşlemi
              </h3>
              <p className="text-green-100">
                {selectedPatient.fullName} için borç ödeme
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Current Debt Info */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <span className="text-lg">💳</span>
                  Mevcut Borç Bilgisi
                </h4>
                <div className="space-y-2 text-sm text-red-800">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Toplam Borç:</span>
                    <span className="text-xl font-bold text-red-600">{formatCurrency(selectedPatient.debtAmount || 0)}</span>
                  </div>
                  {selectedPatient.debtDate && (
                    <p><span className="font-medium">Borç Tarihi:</span> {formatDate(selectedPatient.debtDate)}</p>
                  )}
                  {selectedPatient.debtReason && (
                    <p><span className="font-medium">Borç Sebebi:</span> {selectedPatient.debtReason}</p>
                  )}
                </div>
              </div>

              {/* Debt Payment History */}
              {selectedPatient.debtPaymentHistory && selectedPatient.debtPaymentHistory.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 flex items-center gap-2">
                    <span className="text-base">🕓</span>
                    <h4 className="text-sm font-semibold text-gray-700">Ödeme Geçmişi ({selectedPatient.debtPaymentHistory.length} işlem)</h4>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {[...selectedPatient.debtPaymentHistory]
                      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((entry: any, idx: number) => (
                        <div key={idx} className="px-4 py-3 bg-white">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs text-gray-500">
                                {new Date(entry.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                {' '}
                                {new Date(entry.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {entry.methods?.map((m: any) => `${m.method === 'nakit' ? 'Nakit' : m.method === 'kartkredi' ? 'Kredi Kartı' : m.method === 'kartdebit' ? 'Banka Kartı' : m.method === 'havale' ? 'Havale/EFT' : m.method}`).join(', ')}
                              </p>
                              {entry.note && (
                                <p className="text-xs text-blue-600 mt-1 italic">"{entry.note}"</p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-sm font-bold text-green-600">+{entry.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                              <p className="text-xs text-gray-400 mt-0.5">Kalan: {entry.remainingDebtAfter.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                            </div>
                          </div>
                        </div>
                    ))}
                  </div>
                  <div className="bg-gray-50 px-4 py-2 flex justify-between text-xs text-gray-600 border-t border-gray-200">
                    <span>Toplam Ödenen:</span>
                    <span className="font-semibold text-green-700">
                      {selectedPatient.debtPaymentHistory.reduce((s: number, e: any) => s + (e.amount || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </span>
                  </div>
                </div>
              )}

              {/* Partial Payment Checkbox */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPartialPayment}
                    onChange={(e) => {
                      setIsPartialPayment(e.target.checked);
                      if (!e.target.checked) {
                        setRemainingDebtAmount('');
                        setDebtPaymentAmount(selectedPatient.debtAmount?.toString() || '');
                      }
                    }}
                    className="mt-1 h-5 w-5 text-yellow-600 rounded border-yellow-300 focus:ring-yellow-500"
                  />
                  <div>
                    <span className="font-medium text-yellow-900">Hasta borcun tamamını ödemiyor</span>
                    <p className="text-yellow-700 text-sm mt-1">
                      Hasta kısmi ödeme yapacaksa bu seçeneği işaretleyin.
                    </p>
                  </div>
                </label>
              </div>

              {/* Payment Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isPartialPayment ? 'Ödenen Tutar (TL)' : 'Ödeme Tutarı (TL)'}
                </label>
                <input
                  type="number"
                  value={debtPaymentAmount}
                  onChange={(e) => {
                    const newAmount = e.target.value;
                    setDebtPaymentAmount(newAmount);
                    
                    // Otomatik olarak ödeme yöntemi tutarını güncelle
                    if (debtPaymentMethods.length > 0) {
                      const numAmount = parseFloat(newAmount) || 0;
                      setDebtPaymentMethods([{
                        method: debtPaymentMethods[0].method,
                        amount: numAmount
                      }]);
                    }
                    
                    if (isPartialPayment && newAmount) {
                      const paid = parseFloat(newAmount) || 0;
                      const totalDebt = selectedPatient.debtAmount || 0;
                      const remaining = Math.max(0, totalDebt - paid);
                      setRemainingDebtAmount(remaining.toString());
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder={selectedPatient.debtAmount?.toString() || "0"}
                  min="0"
                  step="0.01"
                />
                {!isPartialPayment && (
                  <p className="text-xs text-gray-500 mt-1">
                    Toplam borç: {formatCurrency(selectedPatient.debtAmount || 0)}
                  </p>
                )}
              </div>

              {/* Remaining Debt (shown only for partial payment) */}
              {isPartialPayment && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-orange-700 mb-2">
                    Kalan Borç (Otomatik Hesaplanır)
                  </label>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(parseFloat(remainingDebtAmount) || (selectedPatient.debtAmount || 0) - (parseFloat(debtPaymentAmount) || 0))}
                  </div>
                  <p className="text-xs text-orange-600 mt-1">
                    Bu tutar hastanın yeni borç tutarı olarak kaydedilecektir.
                  </p>
                </div>
              )}

              {/* Multi Payment Method Selector for Debt Payment */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <MultiPaymentMethodSelector
                  totalAmount={parseFloat(debtPaymentAmount) || 0}
                  value={debtPaymentMethods}
                  onChange={(methods) => {
                    setDebtPaymentMethods(methods);
                    // Keep backwards compatibility - set primary method
                    if (methods.length > 0) {
                      setDebtPaymentMethod(methods[0].method);
                    }
                  }}
                  disabled={loading}
                  showValidation={true}
                />
              </div>

              {/* Payment Note */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ödeme Notu <span className="text-gray-400 font-normal">(İsteğe Bağlı)</span>
                </label>
                <textarea
                  value={debtPaymentNote}
                  onChange={(e) => setDebtPaymentNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-sm"
                  placeholder="Bu ödemeyle ilgili not ekleyin... (örn: nakit teslim edildi, fatura kesildi)"
                />
              </div>

              {/* Patient Info Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Hasta Bilgileri</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>Ad Soyad: {selectedPatient.fullName}</p>
                  <p>TC No: {selectedPatient.tcNo}</p>
                  <p>Telefon: {selectedPatient.phone}</p>
                </div>
              </div>

              {/* Summary Box */}
              <div className={`border rounded-lg p-4 ${isPartialPayment ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                <h4 className={`font-medium mb-2 ${isPartialPayment ? 'text-orange-900' : 'text-green-900'}`}>
                  İşlem Özeti
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mevcut Borç:</span>
                    <span className="font-medium text-red-600">{formatCurrency(selectedPatient.debtAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ödenecek Tutar:</span>
                    <span className="font-medium text-green-600">{formatCurrency(parseFloat(debtPaymentAmount) || 0)}</span>
                  </div>
                  <div className="border-t pt-1 mt-1">
                    <div className="flex justify-between">
                      <span className={`font-medium ${isPartialPayment ? 'text-orange-700' : 'text-green-700'}`}>
                        {isPartialPayment ? 'Kalan Borç:' : 'Sonuç:'}
                      </span>
                      <span className={`font-bold ${isPartialPayment ? 'text-orange-600' : 'text-green-600'}`}>
                        {isPartialPayment 
                          ? formatCurrency(Math.max(0, (selectedPatient.debtAmount || 0) - (parseFloat(debtPaymentAmount) || 0)))
                          : 'Borç Kapatılacak ✓'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsDebtPaymentModalOpen(false);
                  setSelectedPatient(null);
                  setDebtPaymentAmount('');
                  setDebtPaymentMethod('nakit');
                  setDebtPaymentMethods([{ method: 'nakit', amount: 0 }]);
                  setIsPartialPayment(false);
                  setRemainingDebtAmount('');
                  setDebtPaymentNote('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                İptal
              </button>
              <button
                onClick={handleProcessDebtPayment}
                disabled={loading || !debtPaymentAmount || parseFloat(debtPaymentAmount) <= 0}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    💰 Borç Ödemesini Kaydet
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
                            <p className="text-xs text-gray-600">{payment.paymentMethods && payment.paymentMethods.length > 0
                              ? formatPaymentMethods(payment.paymentMethods)
                              : getPaymentMethodLabel(payment.paymentMethod || 'nakit')}</p>
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
                            <p className="text-xs text-gray-600">{refund.refundMethods && refund.refundMethods.length > 0
                              ? formatPaymentMethods(refund.refundMethods)
                              : getPaymentMethodLabel(refund.refundMethod || 'nakit')}</p>
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
                onClick={generateExcelReport}
                disabled={reportData.payments.length === 0 && reportData.refunds.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📥 Excel İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingScreen;