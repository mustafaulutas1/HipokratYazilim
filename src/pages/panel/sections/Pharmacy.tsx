import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, deleteDoc, doc, where, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import MultiPaymentMethodSelector from '../../../components/UI/MultiPaymentMethodSelector';
import type { PaymentMethodEntry } from '../../../components/UI/MultiPaymentMethodSelector';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, writeFile } from 'xlsx';
import { loadTurkishPdfFont } from '../../../utils/pdfFont';

interface Medication {
  id?: string;
  name: string;
  protocolName?: string;
  description: string;
  dosageForm: string; // Tablet, Syrup, Injection, etc.
  manufacturer: string;
  price: number;
  barcode: string;
  category: string;
  prescriptionRequired: boolean;
  stockQuantity: number;
  minStockLevel: number;
  expiryDate?: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface SavedMedication extends Medication {
  id: string;
}

interface DoctorProfile {
  clinicId: string;
  fullName: string;
}

interface MedicalDevice {
  id?: string;
  name: string;
  description: string;
  deviceType: string;
  manufacturer: string;
  price: number;
  serialNumber: string;
  category: string;
  maintenanceRequired: boolean;
  stockQuantity: number;
  minStockLevel: number;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface SavedMedicalDevice extends MedicalDevice {
  id: string;
}

interface TreatmentPhase {
  treatment: string;
  dosage: string;
}

interface SavedProtocol {
  phases: {
    remember?: TreatmentPhase;
    regeneration1?: TreatmentPhase;
    regeneration2?: TreatmentPhase;
    regeneration3?: TreatmentPhase;
    regeneration4?: TreatmentPhase;
    mainTreatments: { treatment: string; description: string }[];
  };
}

interface PharmacyPatient {
  id: string;
  fullName: string;
  tcNo: string;
  status: string;
  pharmacyStatus?: string;
  updatedAt: string;
  createdAt: string;
  treatmentCompletedAt?: string;
  treatmentStartedAt?: string;
  treatmentOptions?: {
    protocolName?: string;
    selectedProtocol?: SavedProtocol;
    customizedProtocol?: SavedProtocol;
  };
  // Pharmacy-specific debt tracking fields (separate from treatment debts)
  pharmacyHasDebt?: boolean;
  pharmacyDebtAmount?: number;
  pharmacyDebtDate?: string;
  pharmacyDebtReason?: string;
  phone?: string;
  // Prescription change tracking (set by call-center/doctor/assistant via patient profile)
  prescriptionMedications?: Array<{ name: string; dosage?: string; type?: string }>;
  prescriptionChanged?: boolean;
  prescriptionChangedAt?: string;
  pharmacyChangeNote?: string;
  prescriptionChanges?: Array<{
    changedAt: string;
    changedBy: string;
    changedByRole?: string;
    instructedBy?: string;
    previousMeds: Array<{ name: string; dosage?: string }>;
    newMeds: Array<{ name: string; dosage?: string }>;
    reason?: string;
  }>;
  // Patient-level "always apply discount" preference (shared with Add/Edit patient).
  indirim_check?: boolean;
  indirim_tipi?: 'yuzde' | 'tutar';
  indirim_orani?: number;
  indirim_tutar?: number;
  // Manual "Alındı / Alınmadı" marks set from the patient panel (keyed by med name).
  prescriptionReceiptOverrides?: Record<string, 'received' | 'not_received'>;
  // Most recent pharmacy sale (overwritten each sale, used for sale-detail display).
  pharmacySoldItems?: Array<{ name: string; price?: number; quantity?: number; category?: string }>;
  // Cumulative list of everything the patient has ever purchased from the pharmacy,
  // across all sales / prescription changes. Drives "already bought" detection so a
  // changed prescription only asks the patient to buy the newly-added medication.
  pharmacyPurchasedItems?: Array<{ name: string; price?: number; quantity?: number; category?: string }>;
}

const Pharmacy: React.FC<{ doctorProfile: DoctorProfile | null }> = ({ doctorProfile }) => {
  const [activeTab, setActiveTab] = useState<'medications' | 'devices' | 'patients' | 'pharmacy_debt' | 'direct_sale' | 'prescription_changes'>('medications');
  const [prescriptionChangePatients, setPrescriptionChangePatients] = useState<PharmacyPatient[]>([]);
  const [prescriptionChangeSearch, setPrescriptionChangeSearch] = useState('');
  const [savedMedications, setSavedMedications] = useState<SavedMedication[]>([]);
  const [savedDevices, setSavedDevices] = useState<SavedMedicalDevice[]>([]);
  const [protocolNames, setProtocolNames] = useState<string[]>([]);
  const [waitingPatients, setWaitingPatients] = useState<PharmacyPatient[]>([]);
  const [patientsWithDebt, setPatientsWithDebt] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMedication, setEditingMedication] = useState<SavedMedication | null>(null);
  const [editingDevice, setEditingDevice] = useState<SavedMedicalDevice | null>(null);
  const [selectedPatientForSale, setSelectedPatientForSale] = useState<PharmacyPatient | null>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPriceUpdateSection, setShowPriceUpdateSection] = useState(false);
  const [percentageIncrease, setPercentageIncrease] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  // Payment modal states
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pharmacyPaymentAmount, setPharmacyPaymentAmount] = useState<string>('');
  const [pharmacyPaymentMethod, setPharmacyPaymentMethod] = useState<string>('nakit');
  const [pharmacyPaymentMethods, setPharmacyPaymentMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [pendingSoldItems, setPendingSoldItems] = useState<any[]>([]);
  const [selectedMedicines, setSelectedMedicines] = useState<string[]>([]);
  const [isPharmacyPartialPayment, setIsPharmacyPartialPayment] = useState<boolean>(false);
  const [pharmacyRemainingDebt, setPharmacyRemainingDebt] = useState<string>('');
  // Debt history panel states
  const [patientDebtHistory, setPatientDebtHistory] = useState<any[]>([]);
  const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
  const [loadingDebtHistory, setLoadingDebtHistory] = useState(false);
  const [debtsAddedToPayment, setDebtsAddedToPayment] = useState<boolean>(false);
  // Pharmacy debt list states
  const [loadingPharmacyDebts, setLoadingPharmacyDebts] = useState(false);
  const [pharmacyDebtSearchTerm, setPharmacyDebtSearchTerm] = useState('');
  const [pharmacyDebtSortBy, setPharmacyDebtSortBy] = useState<'name' | 'amount' | 'date'>('date');
  const [pharmacyDebtTypeFilter, setPharmacyDebtTypeFilter] = useState<'all' | 'direct_sale' | 'treatment_patient'>('all');
  // Sale detail modal state
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null);
  // Extra medicine picker state
  const [showExtraMedicinePicker, setShowExtraMedicinePicker] = useState(false);
  const [extraMedicineSearch, setExtraMedicineSearch] = useState('');
  const [pickerQuantities, setPickerQuantities] = useState<Record<string, number>>({});
  // Sale note state
  const [pharmacyNote, setPharmacyNote] = useState<string>('');
  // Pharmacy payment discount marking (mirrors patient doc's indirim_* fields)
  const [pharmacyDiscountCheck, setPharmacyDiscountCheck] = useState<boolean>(false);
  const [, setPharmacyDiscountType] = useState<'yuzde' | 'tutar'>('yuzde');
  // Independent enable flags: both can be active at the same time
  const [pharmacyDiscountYuzdeEnabled, setPharmacyDiscountYuzdeEnabled] = useState<boolean>(false);
  const [pharmacyDiscountTutarEnabled, setPharmacyDiscountTutarEnabled] = useState<boolean>(false);
  const [pharmacyDiscountRate, setPharmacyDiscountRate] = useState<number>(20);
  const [pharmacyDiscountValue, setPharmacyDiscountValue] = useState<number>(0);
  const [pharmacyDiscountApplied, setPharmacyDiscountApplied] = useState<boolean>(false);
  // Direct sale tab states
  const [dsCustomerMode, setDsCustomerMode] = useState<'existing' | 'new'>('existing');
  const [dsPatientSearch, setDsPatientSearch] = useState('');
  const [dsAllPatients, setDsAllPatients] = useState<PharmacyPatient[]>([]);
  const [dsSelectedPatient, setDsSelectedPatient] = useState<PharmacyPatient | null>(null);
  const [dsNewCustomerName, setDsNewCustomerName] = useState('');
  const [dsNewCustomerPhone, setDsNewCustomerPhone] = useState('');
  const [dsNewCustomerTcNo, setDsNewCustomerTcNo] = useState('');
  const [dsNewCustomerAddress, setDsNewCustomerAddress] = useState('');
  const [dsNewCustomerLocked, setDsNewCustomerLocked] = useState(false);
  // After-sale success indicator { name, savedAsPatient }
  const [dsRecentSaveInfo, setDsRecentSaveInfo] = useState<{ name: string; savedAsPatient: boolean } | null>(null);
  const [dsSaleItems, setDsSaleItems] = useState<{ medication: SavedMedication; quantity: number }[]>([]);
  const [dsAppSearch, setDsAppSearch] = useState('');
  const [dsPaymentMethods, setDsPaymentMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [dsNote, setDsNote] = useState('');
  const [dsPartialPayment, setDsPartialPayment] = useState(false);
  const [dsRemainingDebt, setDsRemainingDebt] = useState('');
  const [dsLoading, setDsLoading] = useState(false);
  const [dsPaymentModalOpen, setDsPaymentModalOpen] = useState(false);
  const [dsView, setDsView] = useState<'sale' | 'history'>('sale');
  const [dsHistorySales, setDsHistorySales] = useState<any[]>([]);
  const [dsHistoryLoading, setDsHistoryLoading] = useState(false);
  const [dsHistorySearch, setDsHistorySearch] = useState('');
  const [dsSelectedHistorySale, setDsSelectedHistorySale] = useState<any | null>(null);
  // Borçlular modal states
  const [showDebtorsModal, setShowDebtorsModal] = useState(false);
  const [selectedDebtorForPayment, setSelectedDebtorForPayment] = useState<any | null>(null);
  const [debtorPaymentMethods, setDebtorPaymentMethods] = useState<PaymentMethodEntry[]>([{ method: 'nakit', amount: 0 }]);
  const [debtorPaymentLoading, setDebtorPaymentLoading] = useState(false);
  // Borç ödeme indirim state'leri
  const [debtorDiscountCheck, setDebtorDiscountCheck] = useState<boolean>(false);
  const [debtorDiscountYuzdeEnabled, setDebtorDiscountYuzdeEnabled] = useState<boolean>(false);
  const [debtorDiscountTutarEnabled, setDebtorDiscountTutarEnabled] = useState<boolean>(false);
  const [debtorDiscountRate, setDebtorDiscountRate] = useState<number>(20);
  const [debtorDiscountValue, setDebtorDiscountValue] = useState<number>(0);
  const [debtorDiscountApplied, setDebtorDiscountApplied] = useState<boolean>(false);
  const [formData, setFormData] = useState<Medication>({
    name: '',
    protocolName: '',
    description: '',
    dosageForm: '',
    manufacturer: '',
    price: 0,
    barcode: '',
    category: '',
    prescriptionRequired: false,
    stockQuantity: 0,
    minStockLevel: 0,
    clinicId: doctorProfile?.clinicId || '',
    createdBy: doctorProfile?.fullName || '',
    createdAt: new Date().toISOString()
  });
  const [deviceFormData, setDeviceFormData] = useState<MedicalDevice>({
    name: '',
    description: '',
    deviceType: '',
    manufacturer: '',
    price: 0,
    serialNumber: '',
    category: '',
    maintenanceRequired: false,
    stockQuantity: 0,
    minStockLevel: 0,
    clinicId: doctorProfile?.clinicId || '',
    createdBy: doctorProfile?.fullName || '',
    createdAt: new Date().toISOString()
  });

  // Available medication categories
  const MEDICATION_CATEGORIES = [
    'Ağrı Kesici',
    'Antibiyotik',
    'Vitamin/Mineral',
    'Kalp İlacı',
    'Hipertansiyon İlacı',
    'Diyabet İlacı',
    'Antidepresan',
    'Sakinleştirici',
    'Mide İlacı',
    'Soğuk Algınlığı',
    'Alerji İlacı',
    'Cilt İlacı',
    'Göz Damlası',
    'Burun Spreyi',
    'Diğer'
  ];

  // Available dosage forms - currently unused but kept for future use
  // const DOSAGE_FORMS = [
  //   'Tablet',
  //   'Kapsül',
  //   'Şurup',
  //   'İnjeke',
  //   'Krem',
  //   'Merhem',
  //   'Damla',
  //   'Toz',
  //   'Fitil',
  //   'Şampuan',
  //   'Jel',
  //   'Sprey',
  //   'Transdermal Plaster',
  //   'Diğer'
  // ];

  // Available device categories
  const DEVICE_CATEGORIES = [
    'Tansiyon Aleti',
    'Şeker Ölçüm Cihazı',
    'Termometre',
    'Nebulizatör',
    'EKG Cihazı',
    'Ultrason Cihazı',
    'Oksijen Konsantratörü',
    'Pulse Oksimetre',
    'Sterilizatör',
    'Otoskop',
    'Oftalmoskop',
    'Stetoskop',
    'Defibrilatör',
    'Aspiratör',
    'Diğer'
  ];

  // Available device types
  const DEVICE_TYPES = [
    'Tanı Cihazı',
    'Tedavi Cihazı',
    'Monitör',
    'Laboratuvar Cihazı',
    'Cerrahi Alet',
    'Görüntüleme Cihazı',
    'Sterilizasyon',
    'Acil Müdahale',
    'Diğer'
  ];

  const fetchMedications = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      setLoading(true);
      console.log('🔍 Pharmacy: Refetching medications for clinicId:', doctorProfile.clinicId);
      
      const medicationsRef = collection(db, 'medications');
      
      // Use only where clause without orderBy to avoid compound index requirement
      const q = query(
        medicationsRef,
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const querySnapshot = await getDocs(q);
      const medications: SavedMedication[] = [];
      
      querySnapshot.forEach((doc) => {
        medications.push({
          id: doc.id,
          ...doc.data()
        } as SavedMedication);
      });
      
      // Manual sort by creation date (newest first)
      medications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('✅ Pharmacy: Refetched medications:', medications.length);
      setSavedMedications(medications);
    } catch (error) {
      console.error('❌ Pharmacy: Error refetching medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      setLoading(true);
      console.log('🔍 Pharmacy: Refetching devices for clinicId:', doctorProfile.clinicId);
      
      const devicesRef = collection(db, 'medicalDevices');
      
      const q = query(
        devicesRef,
        where('clinicId', '==', doctorProfile.clinicId)
      );
      
      const querySnapshot = await getDocs(q);
      const devices: SavedMedicalDevice[] = [];
      
      querySnapshot.forEach((doc) => {
        devices.push({
          id: doc.id,
          ...doc.data()
        } as SavedMedicalDevice);
      });
      
      devices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('✅ Pharmacy: Refetched devices:', devices.length);
      setSavedDevices(devices);
    } catch (error) {
      console.error('❌ Pharmacy: Error refetching devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    if (!doctorProfile?.clinicId) return;
    try {
      const patientsRef = collection(db, 'patients');
      const patientsQuery = query(
        patientsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('pharmacyStatus', '==', 'waiting')
      );
      
      const patientsSnapshot = await getDocs(patientsQuery);
      const patients: PharmacyPatient[] = [];
      
      patientsSnapshot.forEach((doc) => {
        patients.push({
          id: doc.id,
          ...doc.data()
        } as PharmacyPatient);
      });
      
      patients.sort((a, b) => new Date(b.treatmentStartedAt || b.updatedAt || b.createdAt).getTime() - new Date(a.treatmentStartedAt || a.updatedAt || a.createdAt).getTime());
      setWaitingPatients(patients);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  // Fetch all patients that have at least one prescription change (for reporting).
  const fetchPrescriptionChanges = async () => {
    if (!doctorProfile?.clinicId) return;
    try {
      const patientsRef = collection(db, 'patients');
      const patientsQuery = query(patientsRef, where('clinicId', '==', doctorProfile.clinicId));
      const snapshot = await getDocs(patientsQuery);
      const patients: PharmacyPatient[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as PharmacyPatient;
        if (data.prescriptionChanges && data.prescriptionChanges.length > 0) {
          patients.push({ ...data, id: doc.id });
        }
      });
      patients.sort((a, b) => new Date(b.prescriptionChangedAt || b.updatedAt || b.createdAt).getTime() - new Date(a.prescriptionChangedAt || a.updatedAt || a.createdAt).getTime());
      setPrescriptionChangePatients(patients);
    } catch (error) {
      console.error('Error fetching prescription changes:', error);
    }
  };

  // Flatten all changes across patients into report rows (newest first).
  const prescriptionChangeRows = prescriptionChangePatients
    .flatMap((p) => (p.prescriptionChanges || []).map((c) => ({ patient: p, change: c })))
    .filter(({ patient }) => {
      const q = prescriptionChangeSearch.trim().toLowerCase();
      if (!q) return true;
      return (patient.fullName || '').toLowerCase().includes(q) || (patient.tcNo || '').toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.change.changedAt).getTime() - new Date(a.change.changedAt).getTime());

  const medsToText = (meds: Array<{ name: string; dosage?: string }>) =>
    meds.map((m) => (m.dosage ? `${m.name} (${m.dosage})` : m.name)).join(', ');

  const exportPrescriptionChangesExcel = () => {
    const rows = prescriptionChangeRows.map(({ patient, change }) => ({
      'Hasta Adı': patient.fullName,
      'TC No': patient.tcNo || '-',
      'Değişiklik Tarihi': new Date(change.changedAt).toLocaleString('tr-TR'),
      'Önceki İlaçlar': medsToText(change.previousMeds || []),
      'Yeni İlaçlar': medsToText(change.newMeds || []),
      'Değiştiren': change.changedBy + (change.changedByRole ? ` (${change.changedByRole})` : ''),
      'Talimatı Veren': change.instructedBy || '-',
      'Neden': change.reason || '-',
    }));
    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = [22, 14, 20, 30, 30, 22, 20, 30].map((w) => ({ wch: w }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Reçete Değişiklikleri');
    writeFile(wb, `Recete_Degisiklikleri_${new Date().toISOString().split('T')[0]}.xlsx`);
  };




  // Fetch patient's debt history (unpaid pharmacy purchases)
  const fetchPatientDebtHistory = async (patient: PharmacyPatient) => {
    if (!doctorProfile?.clinicId || !patient.tcNo) return;
    
    setLoadingDebtHistory(true);
    try {
      // Query for pharmacy_debts collection for this patient
      const debtsRef = collection(db, 'pharmacy_debts');
      const debtsQuery = query(
        debtsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('patientTcNo', '==', patient.tcNo),
        where('isPaid', '==', false)
      );
      
      const debtsSnapshot = await getDocs(debtsQuery);
      const debts: any[] = [];
      
      debtsSnapshot.forEach((docSnap) => {
        debts.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      
      // Sort by date, oldest first
      debts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setPatientDebtHistory(debts);
    } catch (error) {
      console.error('Error fetching patient debt history:', error);
      setPatientDebtHistory([]);
    } finally {
      setLoadingDebtHistory(false);
    }
  };

  // Toggle debt selection
  const handleDebtToggle = (debtId: string) => {
    setSelectedDebts(prev => 
      prev.includes(debtId) 
        ? prev.filter(id => id !== debtId)
        : [...prev, debtId]
    );
  };

  // Select all debts
  const handleSelectAllDebts = () => {
    if (selectedDebts.length === patientDebtHistory.length) {
      setSelectedDebts([]);
    } else {
      setSelectedDebts(patientDebtHistory.map(d => d.id));
    }
  };

  // Calculate total selected debt amount
  const calculateSelectedDebtTotal = () => {
    return patientDebtHistory
      .filter(d => selectedDebts.includes(d.id))
      .reduce((sum, d) => sum + (d.amount || 0), 0);
  };

  // Fetch all patients with outstanding pharmacy debts
  const fetchAllPatientsForDirectSale = async () => {
    if (!doctorProfile?.clinicId) return;
    try {
      const snap = await getDocs(query(collection(db, 'patients'), where('clinicId', '==', doctorProfile.clinicId)));
      const patients: PharmacyPatient[] = [];
      snap.forEach((d) => patients.push({ id: d.id, ...d.data() } as PharmacyPatient));
      patients.sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
      setDsAllPatients(patients);
    } catch (e) {
      console.error('Error fetching all patients:', e);
    }
  };

  const fetchPatientsWithPharmacyDebts = async () => {
    if (!doctorProfile?.clinicId) return;
    
    setLoadingPharmacyDebts(true);
    try {
      // Query for all unpaid debts in pharmacy_debts collection
      const debtsRef = collection(db, 'pharmacy_debts');
      const debtsQuery = query(
        debtsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('isPaid', '==', false)
      );
      
      const debtsSnapshot = await getDocs(debtsQuery);
      const debtsByPatient: { [key: string]: any } = {};
      
      debtsSnapshot.forEach((docSnap) => {
        const debt = docSnap.data();
        const patientKey = debt.patientTcNo;
        
        if (!debtsByPatient[patientKey]) {
          debtsByPatient[patientKey] = {
            tcNo: debt.patientTcNo,
            patientName: debt.patientName || 'Bilinmiyor',
            phone: debt.patientPhone || '',
            totalDebt: 0,
            debtCount: 0,
            lastDebtDate: '',
            debts: [],
            patientId: debt.patientId || null,
            isNewCustomer: debt.isNewCustomer || false,
          };
        }
        
        debtsByPatient[patientKey].totalDebt += (debt.amount || 0);
        debtsByPatient[patientKey].debtCount += 1;
        
        // Keep the latest debt date
        if (!debtsByPatient[patientKey].lastDebtDate || 
            new Date(debt.createdAt) > new Date(debtsByPatient[patientKey].lastDebtDate)) {
          debtsByPatient[patientKey].lastDebtDate = debt.createdAt;
        }
        
        debtsByPatient[patientKey].debts.push({
          id: docSnap.id,
          ...debt
        });
      });
      
      setPatientsWithDebt(Object.values(debtsByPatient));
    } catch (error) {
      console.error('Error fetching patients with pharmacy debts:', error);
      setPatientsWithDebt([]);
    } finally {
      setLoadingPharmacyDebts(false);
    }
  };

  // ── Borç ödeme indirim fonksiyonları ─────────────────────────────────────

  // indirim tipi/oranı değişince applied'ı sıfırla
  // (useEffect tanımı bileşen içinde olmalı ama burada helper fonksiyonlar olarak tutuyoruz)

  const computeDebtorDiscount = (totalDebt: number): { total: number; yuzde: number; tutar: number } => {
    if (!debtorDiscountCheck) return { total: 0, yuzde: 0, tutar: 0 };
    const base = totalDebt;
    const discountYuzde = debtorDiscountYuzdeEnabled
      ? Math.round(base * (Number(debtorDiscountRate) || 0)) / 100
      : 0;
    const afterYuzde = Math.max(0, base - discountYuzde);
    const discountTutar = debtorDiscountTutarEnabled
      ? Math.min(Number(debtorDiscountValue) || 0, afterYuzde)
      : 0;
    const total = Math.min(Math.round((discountYuzde + discountTutar) * 100) / 100, base);
    return {
      total: Math.max(0, total),
      yuzde: Math.round(discountYuzde * 100) / 100,
      tutar: Math.round(discountTutar * 100) / 100,
    };
  };

  const applyDebtorDiscountToAmount = (totalDebt: number) => {
    if (!debtorDiscountCheck) return;
    if (!debtorDiscountYuzdeEnabled && !debtorDiscountTutarEnabled) return;
    const { total: discount } = computeDebtorDiscount(totalDebt);
    if (discount <= 0) return;
    const next = Math.max(0, Math.round((totalDebt - discount) * 100) / 100);
    setDebtorPaymentMethods([{ method: debtorPaymentMethods[0]?.method || 'nakit', amount: next }]);
    setDebtorDiscountApplied(true);
  };

  const removeDebtorDiscountFromAmount = (totalDebt: number) => {
    setDebtorPaymentMethods([{ method: debtorPaymentMethods[0]?.method || 'nakit', amount: totalDebt }]);
    setDebtorDiscountApplied(false);
  };

  const handleDebtorPayment = async () => {
    if (!selectedDebtorForPayment || !doctorProfile?.clinicId) return;

    const totalPaid = debtorPaymentMethods.reduce((s, m) => s + (m.amount || 0), 0);
    const totalDebt = selectedDebtorForPayment.totalDebt;
    // İndirim uygulandıysa gerçek borç miktarını indirimli olarak hesapla
    const appliedDiscount = debtorDiscountApplied
      ? computeDebtorDiscount(totalDebt).total
      : 0;
    const effectiveDebt = Math.max(0, Math.round((totalDebt - appliedDiscount) * 100) / 100);

    if (totalPaid <= 0) {
      alert('Lütfen ödeme tutarı girin.');
      return;
    }

    setDebtorPaymentLoading(true);
    try {
      const batch = writeBatch(db);

      // Mark all debt entries for this patient as paid
      for (const debt of selectedDebtorForPayment.debts) {
        const debtRef = doc(db, 'pharmacy_debts', debt.id);
        batch.update(debtRef, {
          isPaid: true,
          paidAt: new Date().toISOString(),
          paidAmount: debt.amount,
          paymentMethods: debtorPaymentMethods.filter(m => m.amount > 0),
          ...(appliedDiscount > 0 ? { discountApplied: appliedDiscount } : {}),
        });
      }

      // Kalan borç: indirimli tutar üzerinden hesapla
      const remainingDebt = Math.max(0, Math.round((effectiveDebt - totalPaid) * 100) / 100);

      // If partial payment, record remainder as a new debt entry (inherit source from existing debts)
      if (remainingDebt > 0) {
        const inheritedSource = selectedDebtorForPayment.debts.find((d: any) => d.debtSource)?.debtSource
          || (selectedDebtorForPayment.debts.some((d: any) => d.reason?.includes('Direkt')) ? 'direct_sale' : 'treatment_patient');
        const newDebtRef = doc(collection(db, 'pharmacy_debts'));
        batch.set(newDebtRef, {
          clinicId: doctorProfile.clinicId,
          patientTcNo: selectedDebtorForPayment.tcNo,
          patientName: selectedDebtorForPayment.patientName,
          amount: remainingDebt,
          reason: 'Kısmi ödeme sonrası kalan borç',
          debtSource: inheritedSource,
          isPaid: false,
          createdAt: new Date().toISOString(),
        });
      }

      // Update patient debt status
      const patientsRef = collection(db, 'patients');
      const patientQuery = query(
        patientsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('tcNo', '==', selectedDebtorForPayment.tcNo)
      );
      const patientSnap = await getDocs(patientQuery);
      if (!patientSnap.empty) {
        const patientDocRef = doc(db, 'patients', patientSnap.docs[0].id);
        if (remainingDebt > 0) {
          batch.update(patientDocRef, {
            pharmacyHasDebt: true,
            pharmacyDebtAmount: remainingDebt,
            pharmacyDebtDate: new Date().toISOString(),
            pharmacyDebtReason: `Kısmi ödeme sonrası kalan borç: ${remainingDebt.toFixed(2)} TL`,
          });
        } else {
          batch.update(patientDocRef, {
            pharmacyHasDebt: false,
            pharmacyDebtAmount: 0,
            pharmacyDebtReason: '',
            pharmacyDebtDate: null,
          });
        }
      }

      await batch.commit();

      const discountNote = appliedDiscount > 0 ? ` (${appliedDiscount.toFixed(2)} TL indirim uygulandı)` : '';
      const msg = remainingDebt > 0
        ? `Ödeme kaydedildi: ${totalPaid.toFixed(2)} TL${discountNote}. Kalan borç: ${remainingDebt.toFixed(2)} TL`
        : `Borç tamamen ödendi: ${totalPaid.toFixed(2)} TL${discountNote}`;
      alert(msg);

      setSelectedDebtorForPayment(null);
      setDebtorPaymentMethods([{ method: 'nakit', amount: 0 }]);
      setDebtorDiscountCheck(false);
      setDebtorDiscountYuzdeEnabled(false);
      setDebtorDiscountTutarEnabled(false);
      setDebtorDiscountApplied(false);
      await fetchPatientsWithPharmacyDebts();
    } catch (error) {
      console.error('Borç ödeme hatası:', error);
      alert('Ödeme kaydedilirken bir hata oluştu.');
    } finally {
      setDebtorPaymentLoading(false);
    }
  };

  const handleOpenDebtPaymentFromDebtList = async (patient: any) => {
    // Always use the unified debtor payment modal for all patients
    setSelectedDebtorForPayment(patient);
    setDebtorPaymentMethods([{ method: 'nakit', amount: patient.totalDebt }]);
    setDebtorDiscountCheck(false);
    setDebtorDiscountYuzdeEnabled(false);
    setDebtorDiscountTutarEnabled(false);
    setDebtorDiscountRate(20);
    setDebtorDiscountValue(0);
    setDebtorDiscountApplied(false);
    setShowDebtorsModal(true);
  };

  // Determine debt source type for a list of debt entries
  const getPatientDebtType = (debts: any[]): 'treatment_patient' | 'direct_sale' | 'mixed' => {
    const hasTreatment = debts.some(d =>
      d.debtSource === 'treatment_patient' ||
      (!d.debtSource && d.reason && !d.reason.includes('Direkt') && !d.reason.includes('direkt'))
    );
    const hasDirect = debts.some(d =>
      d.debtSource === 'direct_sale' ||
      (!d.debtSource && d.reason && (d.reason.includes('Direkt') || d.reason.includes('direkt')))
    );
    if (hasTreatment && hasDirect) return 'mixed';
    if (hasDirect) return 'direct_sale';
    return 'treatment_patient';
  };

  const DebtTypeBadge: React.FC<{ debts: any[] }> = ({ debts }) => {
    const type = getPatientDebtType(debts);
    if (type === 'treatment_patient') return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
        💊 Tedavi Hastası
      </span>
    );
    if (type === 'direct_sale') return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
        🛒 Eczane Satışı
      </span>
    );
    return (
      <>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">💊 Tedavi</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">🛒 Eczane</span>
      </>
    );
  };

  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchMedications();
      fetchDevices();
      fetchPatients();
      fetchPrescriptionChanges();

      // Fetch treatment protocol names for medication name dropdown
      const fetchProtocolNames = async () => {
        try {
          const snap = await getDocs(collection(db, 'treatmentProtocols'));
          const names = snap.docs
            .map(d => (d.data() as any).name as string)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'tr'));
          setProtocolNames(Array.from(new Set(names)));
        } catch (e) {
          console.error('Protocol names fetch error:', e);
        }
      };
      fetchProtocolNames();
    }
  }, [doctorProfile?.clinicId]);

  // Auto-calculate remaining debt in direct sale payment modal
  useEffect(() => {
    if (dsPartialPayment) {
      const total = dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0);
      const paid = dsPaymentMethods.reduce((s, m) => s + (m.amount || 0), 0);
      const remaining = Math.max(0, total - paid);
      setDsRemainingDebt(remaining.toFixed(2));
    }
  }, [dsPartialPayment, dsPaymentMethods, dsSaleItems]);

  // Extract the protocol name for display — uses stored protocolName first,
  // then tries to match the start of description against known protocol names,
  // then falls back to the full description, then to name (barcode).
  const getMedicationDisplayName = (medication: SavedMedication): string => {
    if (medication.protocolName) return medication.protocolName;
    const desc = (medication.description || '').trim();
    for (const pName of protocolNames) {
      if (desc.toUpperCase().startsWith(pName.toUpperCase())) return pName;
    }
    return desc || medication.name;
  };

  // Find a saved medication by protocol/display name or barcode name
  const findMedicationByName = (medName: string) => {
    const norm = (s?: string) => (s || '').toLowerCase().replace(/\s*-\s*/g, '-').trim();
    const lower = norm(medName);
    if (!lower) return undefined;

    // 1) Prefer an exact match on display / protocol / barcode name.
    const exact = savedMedications.find(sm =>
      norm(getMedicationDisplayName(sm)) === lower ||
      norm(sm.protocolName) === lower ||
      norm(sm.name) === lower
    );
    if (exact) return exact;

    // 2) Fall back to a loose contains match — but skip empty fields, otherwise
    //    `lower.includes('')` is always true and every empty-field medication
    //    would match every prescription.
    return savedMedications.find(sm => {
      const displayLower = norm(getMedicationDisplayName(sm));
      const protocolLower = norm(sm.protocolName);
      const nameLower = norm(sm.name);
      return (displayLower && (displayLower.includes(lower) || lower.includes(displayLower)))
        || (protocolLower && (protocolLower.includes(lower) || lower.includes(protocolLower)))
        || (nameLower && (nameLower.includes(lower) || lower.includes(nameLower)));
    });
  };

  const getPrescribedMedicines = (patient: PharmacyPatient) => {
    // A call-center/doctor/assistant edit overrides the protocol-derived list.
    if (patient.prescriptionMedications && patient.prescriptionMedications.length > 0) {
      return patient.prescriptionMedications.map(m => ({
        name: m.name,
        dosage: m.dosage || '',
        type: m.type || 'Değişiklik',
      }));
    }

    const protocol = patient.treatmentOptions?.customizedProtocol || patient.treatmentOptions?.selectedProtocol;
    if (!protocol?.phases) return [];

    const medicines: { name: string; dosage: string; type: string }[] = [];

    const addMed = (name: string, dosage: string, type: string) => {
      if (name && name !== '-') {
        medicines.push({ name, dosage, type });
      }
    };

    if (protocol.phases.remember) addMed(protocol.phases.remember.treatment, protocol.phases.remember.dosage, 'Remember');
    if (protocol.phases.regeneration1) addMed(protocol.phases.regeneration1.treatment, protocol.phases.regeneration1.dosage, 'Regeneration 1');
    if (protocol.phases.regeneration2) addMed(protocol.phases.regeneration2.treatment, protocol.phases.regeneration2.dosage, 'Regeneration 2');
    if (protocol.phases.regeneration3) addMed(protocol.phases.regeneration3.treatment, protocol.phases.regeneration3.dosage, 'Regeneration 3');
    if (protocol.phases.regeneration4) addMed(protocol.phases.regeneration4.treatment, protocol.phases.regeneration4.dosage, 'Regeneration 4');

    return medicines;
  };

  // Normalize a medication name for loose comparison (case, spacing, hyphens).
  const normalizeMedName = (s?: string) =>
    (s || '').toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();

  // The cumulative set of items the patient has actually purchased. Falls back to
  // the last sale for patients that predate cumulative tracking.
  const getPurchasedItems = (patient: PharmacyPatient) =>
    (patient.pharmacyPurchasedItems && patient.pharmacyPurchasedItems.length > 0)
      ? patient.pharmacyPurchasedItems
      : (patient.pharmacySoldItems || []);

  // Whether a prescribed medication has already been picked up — so we don't ask the
  // patient to re-buy it after a prescription change. A manual "Alındı / Alınmadı" mark
  // from the patient panel wins; otherwise it's derived from past pharmacy sales.
  const isMedAlreadyPurchased = (patient: PharmacyPatient, medName: string): boolean => {
    const match = findMedicationByName(medName);
    const resolved = match ? getMedicationDisplayName(match) : medName;
    const b = normalizeMedName(resolved);
    if (!b) return false;
    const looseEq = (other?: string) => {
      const a = normalizeMedName(other);
      return !!a && (a === b || a.includes(b) || b.includes(a));
    };

    // 1) Manual override (mirrors the patient panel's getReceiptStatus).
    const overrides = patient.prescriptionReceiptOverrides ?? {};
    const ovKey = Object.keys(overrides).find(k => looseEq(k) || normalizeMedName(k) === normalizeMedName(medName));
    if (ovKey) return overrides[ovKey] === 'received';

    // 2) Otherwise, derive from what was actually sold in past visits.
    return getPurchasedItems(patient).some(it => looseEq(it.name));
  };

  // Merge a completed sale's items into the cumulative purchased list, deduping by
  // normalized name (keeping the most recent price/quantity for an existing entry).
  const mergePurchasedItems = (
    existing: Array<{ name: string; price?: number; quantity?: number; category?: string }>,
    sold: Array<{ name: string; price?: number; quantity?: number; category?: string }>,
  ) => {
    const merged = [...existing];
    for (const item of sold) {
      const key = normalizeMedName(item.name);
      const idx = merged.findIndex(m => normalizeMedName(m.name) === key);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], name: item.name, price: item.price, category: item.category };
      } else {
        merged.push(item);
      }
    }
    return merged;
  };

  const handleOpenSaleModal = (patient: PharmacyPatient) => {
    setSelectedPatientForSale(patient);
    setIsSaleModalOpen(true);
  };

  // Open payment modal when clicking "Satışı Tamamla"
  const handleOpenPaymentModal = (soldItems: any[]) => {
    const itemsWithQty = soldItems.map(item => ({ ...item, quantity: item.quantity || 1 }));
    setPendingSoldItems(itemsWithQty);
    // Pre-select only meds the patient hasn't already purchased. After a prescription
    // change, kept meds stay in the list (greyed/deselected) but only the newly-added
    // ones are selected for sale, so the patient isn't asked to re-buy anything.
    const p = selectedPatientForSale;
    const initiallySelected = itemsWithQty
      .filter(item => !(p && isMedAlreadyPurchased(p, item.name)))
      .map(item => item.name);
    setSelectedMedicines(initiallySelected);
    // Calculate total from the initially selected (sellable) items only.
    const total = itemsWithQty
      .filter(item => initiallySelected.includes(item.name))
      .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    setPharmacyPaymentAmount(total.toFixed(2));
    setPharmacyPaymentMethods([{ method: 'nakit', amount: total }]);
    // Reset debt selection
    setSelectedDebts([]);
    // Manual discount only — always start fresh (not loaded from / saved to the patient)
    setPharmacyDiscountCheck(false);
    setPharmacyDiscountType('yuzde');
    setPharmacyDiscountYuzdeEnabled(false);
    setPharmacyDiscountTutarEnabled(false);
    setPharmacyDiscountRate(20);
    setPharmacyDiscountValue(0);
    setPharmacyDiscountApplied(false);
    // Fetch patient debt history when modal opens
    if (selectedPatientForSale) {
      fetchPatientDebtHistory(selectedPatientForSale);
    }
    setIsPaymentModalOpen(true);
  };

  // Only debts explicitly added via "Ödemeye Ekle" belong in the payment amount.
  const getPharmacyDebtInPayment = () =>
    debtsAddedToPayment ? calculateSelectedDebtTotal() : 0;

  // Recalculate total when selection changes.
  const recalculatePharmacyTotal = (selected: string[], items?: any[]) => {
    const sourceItems = items || pendingSoldItems;
    const base = sourceItems
      .filter(item => selected.includes(item.name))
      .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const debtInPayment = getPharmacyDebtInPayment();
    const total = base + debtInPayment;
    setPharmacyPaymentAmount(total.toFixed(2));
    setPharmacyPaymentMethods([{ method: (pharmacyPaymentMethods[0]?.method) || 'nakit', amount: total }]);
    setPharmacyDiscountApplied(false);
  };

  // Selected-medicines total (discount base, excludes any added past debt).
  const pharmacyItemsBase = () =>
    pendingSoldItems
      .filter(item => selectedMedicines.includes(item.name))
      .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

  // Compute the combined discount in TL.
  // When both types active: first apply percentage, then fixed amount from remainder.
  // Result is capped at the base (never negative).
  const computePharmacyDiscount = (): { total: number; yuzde: number; tutar: number } => {
    if (!pharmacyDiscountCheck) return { total: 0, yuzde: 0, tutar: 0 };
    const base = pharmacyItemsBase();

    const discountYuzde = pharmacyDiscountYuzdeEnabled
      ? Math.round(base * (Number(pharmacyDiscountRate) || 0)) / 100
      : 0;

    const afterYuzde = Math.max(0, base - discountYuzde);
    const discountTutar = pharmacyDiscountTutarEnabled
      ? Math.min(Number(pharmacyDiscountValue) || 0, afterYuzde)
      : 0;

    const total = Math.min(Math.round((discountYuzde + discountTutar) * 100) / 100, base);
    return {
      total: Math.max(0, total),
      yuzde: Math.round(discountYuzde * 100) / 100,
      tutar: Math.round(discountTutar * 100) / 100,
    };
  };

  // Mirrors AccountingScreen.setPayableTo exactly.
  const setPharmacyPayableTo = (amount: number) => {
    const formatted = amount.toFixed(2);
    setPharmacyPaymentAmount(formatted);
    setPharmacyPaymentMethods(prev => [{ method: prev[0]?.method || 'nakit', amount }]);
  };

  // Apply — derives fresh from base every time (never delta arithmetic).
  const applyPharmacyDiscountToAmount = () => {
    if (!pharmacyDiscountCheck) return;
    if (!pharmacyDiscountYuzdeEnabled && !pharmacyDiscountTutarEnabled) return;
    const { total: discount } = computePharmacyDiscount();
    if (discount <= 0) return;
    const base = pharmacyItemsBase();
    const debtInPayment = getPharmacyDebtInPayment();
    setPharmacyPayableTo(Math.max(0, Math.round((base - discount + debtInPayment) * 100) / 100));
    setPharmacyDiscountApplied(true);
  };

  // Restore the full (non-discounted) amount.
  const removePharmacyDiscountFromAmount = () => {
    const base = pharmacyItemsBase();
    const debtInPayment = getPharmacyDebtInPayment();
    setPharmacyPayableTo(Math.max(0, Math.round((base + debtInPayment) * 100) / 100));
    setPharmacyDiscountApplied(false);
  };

  const togglePharmacyDiscount = () => {
    if (pharmacyDiscountApplied) removePharmacyDiscountFromAmount();
    else applyPharmacyDiscountToAmount();
  };

  // When discount marking changes, invalidate any previously applied amount.
  useEffect(() => {
    setPharmacyDiscountApplied(false);
  }, [pharmacyDiscountCheck, pharmacyDiscountYuzdeEnabled, pharmacyDiscountTutarEnabled, pharmacyDiscountRate, pharmacyDiscountValue]);

  // Keep primary payment method amount synced with pharmacyPaymentAmount (mirrors AccountingScreen).
  useEffect(() => {
    if (pharmacyPaymentMethods.length === 1) {
      const parsed = parseFloat(pharmacyPaymentAmount) || 0;
      if (Math.abs(pharmacyPaymentMethods[0].amount - parsed) > 0.001) {
        setPharmacyPaymentMethods(prev =>
          prev.map((m, i) => (i === 0 ? { ...m, amount: parsed } : m))
        );
      }
    }
  }, [pharmacyPaymentAmount]);

  // Update quantity of a pending item
  const handleUpdateQuantity = (itemIndex: number, delta: number) => {
    setPendingSoldItems(prev => {
      const updated = prev.map((item, idx) => {
        if (idx === itemIndex) {
          const newQty = Math.max(1, (item.quantity || 1) + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      });
      // Recalculate total with updated quantities
      const selected = selectedMedicines;
      const base = updated
        .filter(item => selected.includes(item.name))
        .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
      const total = base + getPharmacyDebtInPayment();
      setPharmacyPaymentAmount(total.toFixed(2));
      setPharmacyPaymentMethods([{ method: (pharmacyPaymentMethods[0]?.method) || 'nakit', amount: total }]);
      setPharmacyDiscountApplied(false);
      return updated;
    });
  };

  // Toggle medicine selection
  const handleMedicineToggle = (medicineName: string) => {
    setSelectedMedicines(prev => {
      const newSelection = prev.includes(medicineName)
        ? prev.filter(name => name !== medicineName)
        : [...prev, medicineName];
      recalculatePharmacyTotal(newSelection);
      return newSelection;
    });
  };

  // Add extra medicine from clinic inventory
  const handleAddExtraMedicine = (medication: SavedMedication, qty?: number) => {
    const addQty = Math.max(1, qty || pickerQuantities[medication.id!] || 1);

    // Check if already in pending items - if so, increase quantity
    const existingItem = pendingSoldItems.find(item => item.medicationId === medication.id);
    if (existingItem) {
      setPendingSoldItems(prev => {
        const updated = prev.map(item => {
          if (item.medicationId === medication.id) {
            return { ...item, quantity: (item.quantity || 1) + addQty };
          }
          return item;
        });
        const base = updated
          .filter(item => selectedMedicines.includes(item.name))
          .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
        const total = base + getPharmacyDebtInPayment();
        setPharmacyPaymentAmount(total.toFixed(2));
        setPharmacyPaymentMethods([{ method: (pharmacyPaymentMethods[0]?.method) || 'nakit', amount: total }]);
        setPharmacyDiscountApplied(false);
        return updated;
      });
      setPickerQuantities(prev => { const n = { ...prev }; delete n[medication.id!]; return n; });
      setShowExtraMedicinePicker(false);
      setExtraMedicineSearch('');
      return;
    }

    const newItem = {
      name: getMedicationDisplayName(medication),
      dosage: medication.dosageForm,
      type: 'extra',
      medicationId: medication.id,
      price: medication.price,
      quantity: addQty
    };

    setPendingSoldItems(prev => {
      const updated = [...prev, newItem];
      const newSelection = [...selectedMedicines, getMedicationDisplayName(medication)];
      const base = updated
        .filter(item => newSelection.includes(item.name))
        .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
      const total = base + getPharmacyDebtInPayment();
      setPharmacyPaymentAmount(total.toFixed(2));
      setPharmacyPaymentMethods([{ method: (pharmacyPaymentMethods[0]?.method) || 'nakit', amount: total }]);
      setPharmacyDiscountApplied(false);
      return updated;
    });
    setSelectedMedicines(prev => [...prev, getMedicationDisplayName(medication)]);
    setPickerQuantities(prev => { const n = { ...prev }; delete n[medication.id!]; return n; });
    setShowExtraMedicinePicker(false);
    setExtraMedicineSearch('');
  };

  // Remove extra medicine from pending items
  const handleRemoveExtraMedicine = (itemIndex: number) => {
    setPendingSoldItems(prev => prev.filter((_item, idx) => idx !== itemIndex));
    setSelectedMedicines(prev => {
      const removedItem = pendingSoldItems[itemIndex];
      const newSelection = prev.filter(name => name !== removedItem.name);
      recalculatePharmacyTotal(newSelection);
      return newSelection;
    });
  };

  // Process the actual payment and complete sale
  const handleProcessPharmacyPayment = async () => {
    if (!selectedPatientForSale || !pharmacyPaymentAmount) return;

    try {
      setLoading(true);
      
      // Filter to only selected medicines
      const approvedMedicines = pendingSoldItems.filter(item => selectedMedicines.includes(item.name));
      const removedMedicines = pendingSoldItems.filter(item => !selectedMedicines.includes(item.name));
      
      // Calculate amounts
      const selectedDebtTotal = calculateSelectedDebtTotal();
      const totalPaymentReceived = parseFloat(pharmacyPaymentAmount) || 0;
      
      // Calculate new debt from this sale (if partial payment)
      const newDebtAmount = isPharmacyPartialPayment && pharmacyRemainingDebt ? parseFloat(pharmacyRemainingDebt) : 0;
      
      const batch = writeBatch(db);
      const patientRef = doc(db, 'patients', selectedPatientForSale.id);
      
      // 1. Mark selected past debts as paid
      if (selectedDebts.length > 0) {
        for (const debtId of selectedDebts) {
          const debtRecord = patientDebtHistory.find(d => d.id === debtId);
          
          // Update debt in pharmacy_debts collection
          const debtRef = doc(db, 'pharmacy_debts', debtId);
          batch.update(debtRef, {
            isPaid: true,
            paidAt: new Date().toISOString(),
            paidAmount: debtRecord?.amount || 0,
            paymentMethod: pharmacyPaymentMethod
          });
        }
      }
      
      // 2. If there's new debt from this sale, save it as a debt record
      if (newDebtAmount > 0) {
        const newDebtRef = doc(collection(db, 'pharmacy_debts'));
        batch.set(newDebtRef, {
          clinicId: doctorProfile?.clinicId,
          patientId: selectedPatientForSale.id,
          patientTcNo: selectedPatientForSale.tcNo,
          patientName: selectedPatientForSale.fullName,
          amount: newDebtAmount,
          items: approvedMedicines.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity || 1
          })),
          reason: 'Eczane eksik ödeme',
          debtSource: 'treatment_patient',
          isPaid: false,
          createdAt: new Date().toISOString(),
          saleDate: new Date().toISOString()
        });
      }
      
      // 3. Calculate remaining total debt for the patient
      // Start with debts that were NOT selected (still unpaid)
      const remainingOldDebts = patientDebtHistory
        .filter(d => !selectedDebts.includes(d.id))
        .reduce((sum, d) => sum + (d.amount || 0), 0);
      
      // Add new debt from this sale
      const totalRemainingDebt = remainingOldDebts + newDebtAmount;
      
      // 4. Prepare patient update data
      const updateData: any = {
        pharmacyStatus: 'completed',
        pharmacySaleCompletedAt: new Date().toISOString(),
        pharmacySaleDate: new Date().toISOString(),
        // The (possibly changed) prescription has now been dispensed.
        prescriptionChanged: false,
        pharmacySoldItems: approvedMedicines,
        // Append this sale's items to the cumulative purchased list so a future
        // prescription change won't ask the patient to re-buy them.
        pharmacyPurchasedItems: mergePurchasedItems(
          selectedPatientForSale.pharmacyPurchasedItems || selectedPatientForSale.pharmacySoldItems || [],
          approvedMedicines,
        ),
        pharmacyRemovedItems: removedMedicines,
        pharmacyPaymentAmount: totalPaymentReceived,
        pharmacyPaymentMethod: pharmacyPaymentMethod,
        // Multi-payment method support
        pharmacyPaymentMethods: pharmacyPaymentMethods.filter(m => m.amount > 0),
        pharmacyPaymentDate: new Date().toISOString(),
        // Optional note for this sale
        pharmacyNote: pharmacyNote.trim() || null,
        // Record what debts were paid in this transaction
        lastDebtPayment: selectedDebts.length > 0 ? {
          paidDebts: selectedDebts,
          paidAmount: selectedDebtTotal,
          paidAt: new Date().toISOString()
        } : null,
        // Manual discount applied to this pharmacy sale only (not saved to the patient)
        pharmacyDiscountAmount: pharmacyDiscountApplied ? computePharmacyDiscount().total : 0,
      };
      
      // Update patient pharmacy debt status (separate from treatment debts)
      if (totalRemainingDebt > 0) {
        updateData.pharmacyHasDebt = true;
        updateData.pharmacyDebtAmount = Math.round(totalRemainingDebt * 100) / 100;
        updateData.pharmacyDebtDate = new Date().toISOString();
        if (newDebtAmount > 0) {
          updateData.pharmacyDebtReason = `Eczane borcu: ${newDebtAmount.toFixed(2)} TL`;
        }
      } else {
        // All pharmacy debts are paid off
        updateData.pharmacyHasDebt = false;
        updateData.pharmacyDebtAmount = 0;
        updateData.pharmacyDebtReason = '';
        updateData.pharmacyDebtDate = null;
      }
      
      batch.update(patientRef, updateData);
      
      // Commit all changes
      await batch.commit();

      // Show success message
      let message = 'İlaç satışı başarıyla tamamlandı!';
      if (selectedDebts.length > 0) {
        message += ` ${selectedDebts.length} eski borç ödendi (${selectedDebtTotal.toFixed(2)} TL).`;
      }
      if (newDebtAmount > 0) {
        message += ` Yeni borç kaydedildi: ${newDebtAmount.toFixed(2)} TL.`;
      }
      if (totalRemainingDebt > 0) {
        message += ` Kalan toplam borç: ${totalRemainingDebt.toFixed(2)} TL.`;
      }
      alert(message);
      
      // Close modals and reset states
      setIsPaymentModalOpen(false);
      setIsSaleModalOpen(false);
      setSelectedPatientForSale(null);
      setPendingSoldItems([]);
      setSelectedMedicines([]);
      setPharmacyPaymentAmount('');
      setPharmacyPaymentMethod('nakit');
      setPharmacyPaymentMethods([{ method: 'nakit', amount: 0 }]);
      setIsPharmacyPartialPayment(false);
      setPharmacyRemainingDebt('');
      setPatientDebtHistory([]);
      setSelectedDebts([]);
      setDebtsAddedToPayment(false);
      setShowExtraMedicinePicker(false);
      setExtraMedicineSearch('');
      setPharmacyNote('');
      setPharmacyDiscountApplied(false);

      fetchPatients();

    } catch (error) {
      console.error('Error completing sale:', error);
      alert('Satış işlemi sırasında bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectSales = async () => {
    if (!doctorProfile?.clinicId) return;
    try {
      setDsHistoryLoading(true);
      const snap = await getDocs(
        query(
          collection(db, 'direct_sales'),
          where('clinicId', '==', doctorProfile.clinicId)
        )
      );
      const sales: any[] = [];
      snap.forEach((d) => sales.push({ id: d.id, ...d.data() }));
      sales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDsHistorySales(sales.slice(0, 100));
    } catch (e) {
      console.error('Error fetching direct sales:', e);
    } finally {
      setDsHistoryLoading(false);
    }
  };

  const exportDirectSalesPdf = () => {
    const filtered = dsHistorySales.filter(s =>
      !dsHistorySearch.trim() ||
      (s.customerName || '').toLowerCase().includes(dsHistorySearch.toLowerCase())
    );
    if (filtered.length === 0) { alert('Dışa aktarılacak kayıt bulunamadı.'); return; }

    const doc2 = new jsPDF({ orientation: 'landscape' });

    // Title
    doc2.setFontSize(16);
    doc2.setTextColor(5, 150, 105);
    doc2.text('Eczane Direkt Satış Raporu', 14, 16);
    doc2.setFontSize(9);
    doc2.setTextColor(100);
    doc2.text(`Klinik: ${doctorProfile?.clinicId || ''}   Tarih: ${new Date().toLocaleDateString('tr-TR')}   Toplam: ${filtered.length} kayıt`, 14, 23);

    const saleDiscount = (s: any) => Math.max(
      0,
      typeof s.discountAmount === 'number'
        ? s.discountAmount
        : (s.totalAmount || 0) - (s.paidAmount || 0) - (s.remainingDebt || 0)
    );

    autoTable(doc2, {
      startY: 28,
      head: [['Tarih', 'Müşteri', 'Ürünler', 'Toplam (TL)', 'İndirim (TL)', 'Ödeme Yöntemi', 'Not']],
      body: filtered.map(s => {
        const tarih = s.createdAt ? new Date(s.createdAt).toLocaleString('tr-TR') : '-';
        const urunler = (s.items || []).map((i: any) => `${i.name} ×${i.quantity} (${(i.price * i.quantity).toFixed(2)} TL)`).join('\n');
        const toplam = (s.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        const indirim = saleDiscount(s);
        const indirimStr = indirim > 0 ? indirim.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-';
        const odeme = (s.paymentMethods || []).length > 0
          ? (s.paymentMethods as PaymentMethodEntry[]).map((m) => `${m.method === 'nakit' ? 'Nakit' : m.method === 'kredi_karti' ? 'Kredi Kartı' : m.method === 'banka_karti' ? 'Banka Kartı' : m.method === 'havale' ? 'Havale/EFT' : m.method === 'cari' ? 'Cari' : m.method}: ${m.amount.toFixed(2)} TL`).join('\n')
          : '-';
        return [tarih, s.customerName || '-', urunler, toplam, indirimStr, odeme, s.note || '-'];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      columnStyles: { 2: { cellWidth: 65 }, 5: { cellWidth: 40 } },
      alternateRowStyles: { fillColor: [240, 253, 250] },
    });

    // Summary row
    const totalRevenue = filtered.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const totalDiscount = filtered.reduce((s, sale) => s + saleDiscount(sale), 0);
    const finalY = (doc2 as any).lastAutoTable.finalY + 6;
    doc2.setFontSize(10);
    doc2.setTextColor(5, 150, 105);
    doc2.text(`Toplam Gelir: ${totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 14, finalY);
    doc2.setTextColor(220, 38, 38);
    doc2.text(`Toplam İndirim: ${totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 14, finalY + 7);

    doc2.save(`eczane-satis-raporu-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportSingleSalePdf = async (sale: any) => {
    const doc2 = new jsPDF();
    let fontName = 'helvetica';
    try {
      const fontData = await loadTurkishPdfFont();
      if (fontData) {
        doc2.addFileToVFS('Roboto-Regular.ttf', fontData);
        doc2.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        fontName = 'Roboto';
      }
    } catch { /* varsayılan font kullan */ }

    doc2.setFont(fontName, 'normal');
    doc2.setFontSize(18);
    doc2.setTextColor(5, 150, 105);
    doc2.text('Satis Fisi', 14, 20);

    doc2.setFont(fontName, 'normal');
    doc2.setFontSize(10);
    doc2.setTextColor(60);
    doc2.text(`Musteri: ${sale.customerName || '-'}`, 14, 32);
    doc2.text(`Tarih: ${sale.createdAt ? new Date(sale.createdAt).toLocaleString('tr-TR') : '-'}`, 14, 39);
    if (sale.customerTcNo) doc2.text(`TC: ${sale.customerTcNo}`, 14, 46);

    const startY = sale.customerTcNo ? 54 : 48;
    autoTable(doc2, {
      startY,
      head: [['Urun / Uygulama', 'Adet', 'Birim Fiyat', 'Toplam']],
      body: (sale.items || []).map((i: any) => [
        i.name,
        i.quantity,
        `${(i.price || 0).toFixed(2)} TL`,
        `${(i.price * i.quantity).toFixed(2)} TL`,
      ]),
      styles: { font: fontName, fontSize: 9 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, font: fontName },
      columnStyles: { 0: { cellWidth: 90 } },
    });

    const finalY = (doc2 as any).lastAutoTable.finalY + 6;
    doc2.setFont(fontName, 'normal');
    doc2.setFontSize(11);
    doc2.setTextColor(5, 150, 105);
    doc2.text(`Toplam: ${(sale.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 14, finalY);

    const odeme = (sale.paymentMethods || []).length > 0
      ? (sale.paymentMethods as PaymentMethodEntry[]).map((m) => `${m.method === 'nakit' ? 'Nakit' : m.method === 'kredi_karti' ? 'Kredi Karti' : m.method === 'banka_karti' ? 'Banka Karti' : m.method === 'havale' ? 'Havale/EFT' : m.method === 'cari' ? 'Cari' : m.method}: ${m.amount.toFixed(2)} TL`).join(' | ')
      : '-';
    doc2.setFont(fontName, 'normal');
    doc2.setFontSize(9);
    doc2.setTextColor(80);
    doc2.text(`Odeme: ${odeme}`, 14, finalY + 7);
    if (sale.note) doc2.text(`Not: ${sale.note}`, 14, finalY + 14);

    doc2.save(`satis-fisi-${sale.id?.slice(0, 8) || 'export'}.pdf`);
  };

  const handleDirectSaleComplete = async () => {
    const customerName = dsCustomerMode === 'existing'
      ? dsSelectedPatient?.fullName || ''
      : dsNewCustomerName.trim();

    if (!customerName) {
      alert('Lütfen müşteri adı girin veya sistemden bir hasta seçin.');
      return;
    }
    if (dsSaleItems.length === 0) {
      alert('Lütfen en az bir ilaç/uygulama ekleyin.');
      return;
    }
    const totalAmount = dsSaleItems.reduce((sum, i) => sum + i.medication.price * i.quantity, 0);
    const enteredAmount = dsPaymentMethods.reduce((sum, m) => sum + (m.amount || 0), 0);
    if (enteredAmount <= 0) {
      alert('Lütfen ödeme tutarı girin.');
      return;
    }

    try {
      setDsLoading(true);
      const batch = writeBatch(db);

      // If this is a Yeni Müşteri, create a clinic-scoped patient record so they
      // appear in "Mevcut Hastalar" next time. All extra fields are optional.
      let newPatientId: string | null = null;
      if (dsCustomerMode === 'new' && doctorProfile?.clinicId) {
        const newPatientRef = doc(collection(db, 'patients'));
        batch.set(newPatientRef, {
          clinicId: doctorProfile.clinicId,
          fullName: customerName,
          phone: dsNewCustomerPhone.trim() || '',
          tcNo: dsNewCustomerTcNo.trim() || '',
          address: dsNewCustomerAddress.trim() || '',
          source: 'pharmacy_walkin',
          createdAt: new Date().toISOString(),
          createdBy: doctorProfile.fullName || 'Eczane',
        });
        newPatientId = newPatientRef.id;
      }

      const saleRef = doc(collection(db, 'direct_sales'));
      batch.set(saleRef, {
        clinicId: doctorProfile?.clinicId,
        createdBy: doctorProfile?.fullName,
        customerType: dsCustomerMode,
        customerName,
        customerTcNo: dsCustomerMode === 'existing' ? (dsSelectedPatient?.tcNo || '') : dsNewCustomerTcNo.trim(),
        customerPhone: dsCustomerMode === 'existing' ? (dsSelectedPatient?.phone || '') : dsNewCustomerPhone.trim(),
        customerAddress: dsCustomerMode === 'existing' ? '' : dsNewCustomerAddress.trim(),
        patientId: dsCustomerMode === 'existing' ? (dsSelectedPatient?.id || null) : newPatientId,
        items: dsSaleItems.map(i => ({
          name: getMedicationDisplayName(i.medication),
          medicationId: i.medication.id,
          price: i.medication.price,
          quantity: i.quantity,
          total: i.medication.price * i.quantity,
        })),
        totalAmount,
        paymentMethods: dsPaymentMethods.filter(m => m.amount > 0),
        paidAmount: enteredAmount,
        // Discount = catalog total minus what was actually charged, excluding any
        // portion deferred as debt. Surfaces as "İndirim" in the eczane report.
        discountAmount: Math.max(0, Math.round((totalAmount - enteredAmount - (dsPartialPayment && dsRemainingDebt ? parseFloat(dsRemainingDebt) : 0)) * 100) / 100),
        note: dsNote.trim() || null,
        isPartialPayment: dsPartialPayment,
        remainingDebt: dsPartialPayment && dsRemainingDebt ? parseFloat(dsRemainingDebt) : 0,
        createdAt: new Date().toISOString(),
        saleType: 'direct',
      });

      if (dsPartialPayment && dsRemainingDebt) {
        const debtAmount = parseFloat(dsRemainingDebt);
        if (debtAmount > 0) {
          const debtRef = doc(collection(db, 'pharmacy_debts'));
          if (dsCustomerMode === 'existing' && dsSelectedPatient) {
            batch.set(debtRef, {
              clinicId: doctorProfile?.clinicId,
              patientId: dsSelectedPatient.id,
              patientTcNo: dsSelectedPatient.tcNo,
              patientName: dsSelectedPatient.fullName,
              amount: debtAmount,
              items: dsSaleItems.map(i => ({ name: getMedicationDisplayName(i.medication), price: i.medication.price, quantity: i.quantity })),
              reason: 'Direkt eczane satışı eksik ödeme',
              debtSource: 'direct_sale',
              isNewCustomer: false,
              isPaid: false,
              createdAt: new Date().toISOString(),
              saleDate: new Date().toISOString(),
              saleId: saleRef.id,
            });
            batch.update(doc(db, 'patients', dsSelectedPatient.id), {
              pharmacyHasDebt: true,
              pharmacyDebtAmount: debtAmount,
              pharmacyDebtDate: new Date().toISOString(),
              pharmacyDebtReason: `Direkt eczane satışı borcu: ${debtAmount.toFixed(2)} TL`,
            });
          } else if (dsCustomerMode === 'new') {
            batch.set(debtRef, {
              clinicId: doctorProfile?.clinicId,
              patientId: newPatientId,
              patientTcNo: dsNewCustomerTcNo.trim() || `DIREKT_${saleRef.id}`,
              patientName: dsNewCustomerName.trim(),
              amount: debtAmount,
              items: dsSaleItems.map(i => ({ name: getMedicationDisplayName(i.medication), price: i.medication.price, quantity: i.quantity })),
              reason: 'Direkt eczane satışı eksik ödeme (Yeni Müşteri)',
              debtSource: 'direct_sale',
              isNewCustomer: true,
              isPaid: false,
              createdAt: new Date().toISOString(),
              saleDate: new Date().toISOString(),
              saleId: saleRef.id,
            });
          }
        }
      }

      await batch.commit();
      alert(`Satış başarıyla tamamlandı! Toplam: ${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`);

      setDsRecentSaveInfo({
        name: customerName,
        savedAsPatient: dsCustomerMode === 'new' && !!newPatientId,
      });
      setTimeout(() => setDsRecentSaveInfo(null), 6000);

      setDsSelectedPatient(null);
      setDsNewCustomerName('');
      setDsNewCustomerPhone('');
      setDsNewCustomerTcNo('');
      setDsNewCustomerAddress('');
      setDsNewCustomerLocked(false);
      setDsPatientSearch('');
      setDsSaleItems([]);
      setDsAppSearch('');
      setDsPaymentMethods([{ method: 'nakit', amount: 0 }]);
      setDsNote('');
      setDsPartialPayment(false);
      setDsRemainingDebt('');
      setDsPaymentModalOpen(false);
      fetchDirectSales();
      fetchAllPatientsForDirectSale();
    } catch (e) {
      console.error('Error completing direct sale:', e);
      alert('Satış tamamlanırken bir hata oluştu.');
    } finally {
      setDsLoading(false);
    }
  };

  // Legacy function - kept for compatibility but now opens payment modal
  // const handleCompleteSale = async (soldItems: any[]) => {
  //   handleOpenPaymentModal(soldItems);
  // };

  const saveMedication = async () => {
    if (!formData.name.trim()) {
      alert('Lütfen ilaç adı girin.');
      return;
    }
    
    if (formData.price <= 0) {
      alert('Lütfen geçerli bir fiyat girin.');
      return;
    }

    try {
      setLoading(true);
      
      if (editingMedication) {
        // Update existing medication
        const medicationRef = doc(db, 'medications', editingMedication.id);
        await updateDoc(medicationRef, {
          name: formData.name,
          protocolName: formData.protocolName || '',
          description: formData.description,
          dosageForm: formData.dosageForm,
          manufacturer: formData.manufacturer,
          price: formData.price,
          barcode: formData.barcode,
          category: formData.category,
          prescriptionRequired: formData.prescriptionRequired,
          stockQuantity: formData.stockQuantity,
          minStockLevel: formData.minStockLevel,
          expiryDate: formData.expiryDate,
          updatedAt: new Date().toISOString()
        });
        alert('İlaç başarıyla güncellendi!');
      } else {
        // Create new medication
        const medicationsRef = collection(db, 'medications');
        await addDoc(medicationsRef, {
          ...formData,
          clinicId: doctorProfile?.clinicId || '',
          createdAt: new Date().toISOString()
        });
        alert('İlaç başarıyla kaydedildi!');
      }

      setShowAddForm(false);
      setEditingMedication(null);
      resetForm();
      fetchMedications();
      
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('İlaç kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const editMedication = (medication: SavedMedication) => {
    setEditingMedication(medication);
    setFormData({
      name: medication.name,
      protocolName: medication.protocolName || '',
      description: medication.description,
      dosageForm: medication.dosageForm || '',
      manufacturer: medication.manufacturer || '',
      price: medication.price || 0,
      barcode: medication.barcode || '',
      category: medication.category || '',
      prescriptionRequired: medication.prescriptionRequired || false,
      stockQuantity: medication.stockQuantity || 0,
      minStockLevel: medication.minStockLevel || 0,
      expiryDate: medication.expiryDate || '',
      clinicId: medication.clinicId,
      createdBy: medication.createdBy,
      createdAt: medication.createdAt
    });
    setShowAddForm(true);
  };

  const deleteMedication = async (medicationId: string) => {
    if (window.confirm('Bu ilacı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'medications', medicationId));
        fetchMedications();
        alert('İlaç başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting medication:', error);
        alert('İlaç silinirken bir hata oluştu.');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      protocolName: '',
      description: '',
      dosageForm: '',
      manufacturer: '',
      price: 0,
      barcode: '',
      category: '',
      prescriptionRequired: false,
      stockQuantity: 0,
      minStockLevel: 0,
      clinicId: doctorProfile?.clinicId || '',
      createdBy: doctorProfile?.fullName || '',
      createdAt: new Date().toISOString()
    });
    setEditingMedication(null);
  };

  const saveDevice = async () => {
    if (!deviceFormData.name.trim()) {
      alert('Lütfen cihaz adı girin.');
      return;
    }
    
    if (deviceFormData.price <= 0) {
      alert('Lütfen geçerli bir fiyat girin.');
      return;
    }

    try {
      setLoading(true);
      
      if (editingDevice) {
        const deviceRef = doc(db, 'medicalDevices', editingDevice.id);
        await updateDoc(deviceRef, {
          name: deviceFormData.name,
          description: deviceFormData.description,
          deviceType: deviceFormData.deviceType,
          manufacturer: deviceFormData.manufacturer,
          price: deviceFormData.price,
          serialNumber: deviceFormData.serialNumber,
          category: deviceFormData.category,
          maintenanceRequired: deviceFormData.maintenanceRequired,
          stockQuantity: deviceFormData.stockQuantity,
          minStockLevel: deviceFormData.minStockLevel,
          lastMaintenanceDate: deviceFormData.lastMaintenanceDate,
          nextMaintenanceDate: deviceFormData.nextMaintenanceDate,
          updatedAt: new Date().toISOString()
        });
        alert('Cihaz başarıyla güncellendi!');
      } else {
        const devicesRef = collection(db, 'medicalDevices');
        await addDoc(devicesRef, {
          ...deviceFormData,
          clinicId: doctorProfile?.clinicId || '',
          createdAt: new Date().toISOString()
        });
        alert('Cihaz başarıyla kaydedildi!');
      }

      setShowAddForm(false);
      setEditingDevice(null);
      resetDeviceForm();
      fetchDevices();
      
    } catch (error) {
      console.error('Error saving device:', error);
      alert('Cihaz kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const editDevice = (device: SavedMedicalDevice) => {
    setEditingDevice(device);
    setDeviceFormData({
      name: device.name,
      description: device.description,
      deviceType: device.deviceType || '',
      manufacturer: device.manufacturer || '',
      price: device.price || 0,
      serialNumber: device.serialNumber || '',
      category: device.category || '',
      maintenanceRequired: device.maintenanceRequired || false,
      stockQuantity: device.stockQuantity || 0,
      minStockLevel: device.minStockLevel || 0,
      lastMaintenanceDate: device.lastMaintenanceDate || '',
      nextMaintenanceDate: device.nextMaintenanceDate || '',
      clinicId: device.clinicId,
      createdBy: device.createdBy,
      createdAt: device.createdAt
    });
    setShowAddForm(true);
  };

  const deleteDevice = async (deviceId: string) => {
    if (window.confirm('Bu cihazı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'medicalDevices', deviceId));
        fetchDevices();
        alert('Cihaz başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting device:', error);
        alert('Cihaz silinirken bir hata oluştu.');
      }
    }
  };

  const resetDeviceForm = () => {
    setDeviceFormData({
      name: '',
      description: '',
      deviceType: '',
      manufacturer: '',
      price: 0,
      serialNumber: '',
      category: '',
      maintenanceRequired: false,
      stockQuantity: 0,
      minStockLevel: 0,
      clinicId: doctorProfile?.clinicId || '',
      createdBy: doctorProfile?.fullName || '',
      createdAt: new Date().toISOString()
    });
    setEditingDevice(null);
  };

  const applyPercentageIncrease = async () => {
    const percentage = parseFloat(percentageIncrease);

    if (isNaN(percentage) || percentage === 0) {
      alert('Lütfen geçerli bir yüzde değeri girin.');
      return;
    }

    if (savedMedications.length === 0) {
      alert('Güncellenecek ilaç bulunamadı.');
      return;
    }

    if (!window.confirm(`Tüm ilaç fiyatlarını %${percentage} ${percentage > 0 ? 'artırmak' : 'azaltmak'} istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      setLoading(true);

      const updatePromises = savedMedications.map(async (medication) => {
        const newPrice = medication.price * (1 + percentage / 100);
        const medicationRef = doc(db, 'medications', medication.id);
        return updateDoc(medicationRef, {
          price: Math.round(newPrice * 100) / 100, // Round to 2 decimal places
          updatedAt: new Date().toISOString()
        });
      });

      await Promise.all(updatePromises);

      alert(`${savedMedications.length} ilacın fiyatı başarıyla güncellendi!`);
      setPercentageIncrease('');
      setShowPriceUpdateSection(false);
      fetchMedications();

    } catch (error) {
      console.error('Error updating prices:', error);
      alert('Fiyatlar güncellenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const calculateNewPrices = () => {
    const percentage = parseFloat(percentageIncrease);
    if (isNaN(percentage) || percentage === 0) return [];

    return savedMedications.map(med => ({
      name: med.name,
      oldPrice: med.price,
      newPrice: Math.round(med.price * (1 + percentage / 100) * 100) / 100
    }));
  };

  // Filter and sort medications
  const filteredAndSortedMedications = savedMedications
    .filter(med => {
      const displayName = getMedicationDisplayName(med).toLowerCase();
      const term = searchTerm.toLowerCase();
      const matchesSearch = displayName.includes(term) ||
                           med.name.toLowerCase().includes(term) ||
                           med.barcode.toLowerCase().includes(term) ||
                           (med.protocolName && med.protocolName.toLowerCase().includes(term)) ||
                           (med.description && med.description.toLowerCase().includes(term)) ||
                           (med.manufacturer && med.manufacturer.toLowerCase().includes(term));
      const matchesCategory = filterCategory === 'all' || med.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sortBy === 'price') {
        return sortOrder === 'asc' ? a.price - b.price : b.price - a.price;
      } else if (sortBy === 'stock') {
        return sortOrder === 'asc' ? a.stockQuantity - b.stockQuantity : b.stockQuantity - a.stockQuantity;
      } else {
        // Default sort by createdAt
        return sortOrder === 'asc' ? 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // Filter and sort devices
  const filteredAndSortedDevices = savedDevices
    .filter(dev => {
      const matchesSearch = dev.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           dev.serialNumber.includes(searchTerm) ||
                           (dev.manufacturer && dev.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = filterCategory === 'all' || dev.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sortBy === 'price') {
        return sortOrder === 'asc' ? a.price - b.price : b.price - a.price;
      } else if (sortBy === 'stock') {
        return sortOrder === 'asc' ? a.stockQuantity - b.stockQuantity : b.stockQuantity - a.stockQuantity;
      } else {
        return sortOrder === 'asc' ? 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // Get expired or soon-to-expire medications
  const expiredMedications = savedMedications.filter(
    med => med.expiryDate && new Date(med.expiryDate) < new Date()
  );

  const soonToExpireMedications = savedMedications.filter(
    med => med.expiryDate && 
           new Date(med.expiryDate) >= new Date() && 
           new Date(med.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  );

  // Low-stock alarm: stock fully depleted (0), or at/below the configured min level.
  // A min level of 0 means "no threshold set", so we only alarm on it when stock hits 0.
  const isLowStock = (item: { stockQuantity: number; minStockLevel: number }) =>
    item.stockQuantity <= 0 || (item.minStockLevel > 0 && item.stockQuantity <= item.minStockLevel);

  // Get low stock medications
  const lowStockMedications = savedMedications.filter(isLowStock);

  // Get low stock devices
  const lowStockDevices = savedDevices.filter(isLowStock);

  // Get devices needing maintenance
  const devicesNeedingMaintenance = savedDevices.filter(
    dev => dev.maintenanceRequired && dev.nextMaintenanceDate && new Date(dev.nextMaintenanceDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  );

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            💊 Eczane Yönetimi
          </h1>
          <p className="text-white/70 text-lg">
            İlaç tanımlama, stok takibi ve fiyat yönetimi
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              setActiveTab('medications');
              setShowAddForm(false);
              setSearchTerm('');
              setFilterCategory('all');
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'medications'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            💊 İlaçlar
          </button>
{/* Tıbbi Cihazlar tab hidden
          <button
            onClick={() => {
              setActiveTab('devices');
              setShowAddForm(false);
              setSearchTerm('');
              setFilterCategory('all');
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'devices'
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            🏥 Tıbbi Cihazlar
          </button>
          */}
          <button
            onClick={() => {
              setActiveTab('patients');
              setShowAddForm(false);
              setSearchTerm('');
              setFilterCategory('all');
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 relative ${
              activeTab === 'patients'
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            👥 Bekleyen Hastalar
            {waitingPatients.length > 0 && (
              <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full border-2 border-[#1a1f37]">
                {waitingPatients.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('pharmacy_debt');
              setShowAddForm(false);
              setPharmacyDebtSearchTerm('');
              fetchPatientsWithPharmacyDebts();
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 relative ${
              activeTab === 'pharmacy_debt'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            💳 Borçlu Hastalar
            {patientsWithDebt.length > 0 && (
              <span className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 text-red-600 text-xs font-bold flex items-center justify-center rounded-full border-2 border-[#1a1f37]">
                {patientsWithDebt.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('direct_sale');
              setShowAddForm(false);
              fetchAllPatientsForDirectSale();
              fetchDirectSales();
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'direct_sale'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            🛒 Eczane Satış
          </button>

          <button
            onClick={() => {
              setActiveTab('prescription_changes');
              setShowAddForm(false);
              fetchPrescriptionChanges();
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'prescription_changes'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            🔁 Reçete Değişiklikleri
          </button>
        </div>
      </div>

      {!showAddForm ? (
        <>
          {/* Stats Overview */}
          {activeTab === 'medications' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-2xl p-4">
                <div className="text-blue-300 text-2xl mb-1">💊</div>
                <div className="text-white text-2xl font-bold">{savedMedications.length}</div>
                <div className="text-white/70 text-sm">Toplam İlaç</div>
              </div>

              <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-2xl p-4">
                <div className="text-yellow-300 text-2xl mb-1">⚠️</div>
                <div className="text-white text-2xl font-bold">{lowStockMedications.length}</div>
                <div className="text-white/70 text-sm">Düşük Stok</div>
              </div>

              <div className="bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/30 rounded-2xl p-4">
                <div className="text-red-300 text-2xl mb-1">📅</div>
                <div className="text-white text-2xl font-bold">{expiredMedications.length}</div>
                <div className="text-white/70 text-sm">Süresi Dolmuş</div>
              </div>
              
              <div className="bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-2xl p-4">
                <div className="text-orange-300 text-2xl mb-1">⏰</div>
                <div className="text-white text-2xl font-bold">{soonToExpireMedications.length}</div>
                <div className="text-white/70 text-sm">Yakında Bitiyor</div>
              </div>
            </div>
          ) : activeTab === 'devices' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-2xl p-4">
                <div className="text-purple-300 text-2xl mb-1">🏥</div>
                <div className="text-white text-2xl font-bold">{savedDevices.length}</div>
                <div className="text-white/70 text-sm">Toplam Cihaz</div>
              </div>
              
              <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-2xl p-4">
                <div className="text-yellow-300 text-2xl mb-1">⚠️</div>
                <div className="text-white text-2xl font-bold">{lowStockDevices.length}</div>
                <div className="text-white/70 text-sm">Düşük Stok</div>
              </div>
              
              <div className="bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-2xl p-4">
                <div className="text-orange-300 text-2xl mb-1">🔧</div>
                <div className="text-white text-2xl font-bold">{devicesNeedingMaintenance.length}</div>
                <div className="text-white/70 text-sm">Bakım Gerekli</div>
              </div>
              
              <div className="bg-gradient-to-r from-green-500/20 to-green-600/20 border border-green-500/30 rounded-2xl p-4">
                <div className="text-green-300 text-2xl mb-1">✅</div>
                <div className="text-white text-2xl font-bold">{savedDevices.filter(d => d.maintenanceRequired).length}</div>
                <div className="text-white/70 text-sm">Bakım Takipli</div>
              </div>
            </div>
          ) : activeTab === 'patients' ? (
            // Patient Stats
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-4">
                <div className="text-cyan-300 text-2xl mb-1">👥</div>
                <div className="text-white text-2xl font-bold">{waitingPatients.length}</div>
                <div className="text-white/70 text-sm">Bekleyen Hastalar</div>
              </div>
              
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-600/20 border border-green-500/30 rounded-2xl p-4">
                <div className="text-green-300 text-2xl mb-1">💊</div>
                <div className="text-white text-2xl font-bold">{savedMedications.length}</div>
                <div className="text-white/70 text-sm">Mevcut İlaç Çeşidi</div>
              </div>
            </div>
          ) : activeTab === 'pharmacy_debt' ? (
            // Pharmacy Debt Stats
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/30 rounded-2xl p-4">
                <div className="text-red-300 text-2xl mb-1">💳</div>
                <div className="text-white text-2xl font-bold">{patientsWithDebt.length}</div>
                <div className="text-white/70 text-sm">Borçlu Hasta</div>
              </div>
              
              <div className="bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-500/30 rounded-2xl p-4">
                <div className="text-orange-300 text-2xl mb-1">📊</div>
                <div className="text-white text-2xl font-bold">
                  {patientsWithDebt.reduce((sum, p) => sum + p.totalDebt, 0).toLocaleString('tr-TR')} TL
                </div>
                <div className="text-white/70 text-sm">Toplam Borç</div>
              </div>
              
              <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-2xl p-4">
                <div className="text-yellow-300 text-2xl mb-1">📝</div>
                <div className="text-white text-2xl font-bold">
                  {patientsWithDebt.reduce((sum, p) => sum + p.debtCount, 0)}
                </div>
                <div className="text-white/70 text-sm">Toplam Borç İşlemi</div>
              </div>
            </div>
          ) : activeTab === 'direct_sale' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-r from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 rounded-2xl p-4">
                <div className="text-emerald-300 text-2xl mb-1">🛒</div>
                <div className="text-white text-2xl font-bold">{savedMedications.length}</div>
                <div className="text-white/70 text-sm">Satışa Hazır İlaç</div>
              </div>
              <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-2xl p-4">
                <div className="text-blue-300 text-2xl mb-1">👥</div>
                <div className="text-white text-2xl font-bold">{dsAllPatients.length}</div>
                <div className="text-white/70 text-sm">Kayıtlı Hasta</div>
              </div>
              <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-2xl p-4">
                <div className="text-purple-300 text-2xl mb-1">💵</div>
                <div className="text-white text-2xl font-bold">
                  {dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                </div>
                <div className="text-white/70 text-sm">Güncel Sepet Tutarı</div>
              </div>
            </div>
          ) : null}

          {/* Action Buttons and Filters - Only for medications and devices tabs */}
          {activeTab !== 'patients' && activeTab !== 'pharmacy_debt' && activeTab !== 'direct_sale' && (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowAddForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
              >
                ➕ {activeTab === 'medications' ? 'Yeni İlaç Ekle' : 'Yeni Cihaz Ekle'}
              </button>

              {activeTab === 'medications' && savedMedications.length > 0 && (
                <button
                  onClick={() => setShowPriceUpdateSection(!showPriceUpdateSection)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  📊 {showPriceUpdateSection ? 'Gizle' : 'Toplu Fiyat Güncelle'}
                </button>
              )}
              
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={activeTab === 'medications' ? 'İlaç adı, barkod veya üretici ara...' : 'Cihaz adı, seri no veya üretici ara...'}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all" className="text-gray-900 bg-white">Tüm Kategoriler</option>
                {(activeTab === 'medications' ? MEDICATION_CATEGORIES : DEVICE_CATEGORIES).map(category => (
                  <option key={category} value={category} className="text-gray-900 bg-white">{category}</option>
                ))}
              </select>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="createdAt" className="text-gray-900 bg-white">Tarih</option>
                <option value="name" className="text-gray-900 bg-white">İsim</option>
                <option value="price" className="text-gray-900 bg-white">Fiyat</option>
                <option value="stock" className="text-gray-900 bg-white">Stok</option>
              </select>
              
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-200"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {/* Percentage Increase Section */}
            {activeTab === 'medications' && showPriceUpdateSection && savedMedications.length > 0 && (
              <div className="mb-6 p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-400/30 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  📊 Toplu Fiyat Güncelleme
                </h3>
                <p className="text-white/70 text-sm mb-4">
                  Tüm ilaçların fiyatlarını belirtilen yüzde kadar artırın veya azaltın
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[250px]">
                    <label className="block text-white/80 text-sm font-medium mb-2">
                      Artış/Azalış Yüzdesi (%)
                    </label>
                    <input
                      type="number"
                      value={percentageIncrease}
                      onChange={(e) => setPercentageIncrease(e.target.value)}
                      placeholder="Örn: 10 (artış için) veya -10 (azalış için)"
                      step="0.1"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      disabled={loading}
                    />

                    {/* Price Preview */}
                    {percentageIncrease && parseFloat(percentageIncrease) !== 0 && !isNaN(parseFloat(percentageIncrease)) && (
                      <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded-lg max-h-48 overflow-y-auto">
                        <div className="text-xs text-white/60 mb-2 font-medium">Önizleme:</div>
                        <div className="space-y-1.5">
                          {calculateNewPrices().map((item, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-white/70 truncate max-w-[150px]">{item.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-white/50 line-through">{item.oldPrice} TL</span>
                                <span className="text-white">→</span>
                                <span className={`font-medium ${item.newPrice > item.oldPrice ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.newPrice} TL
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={applyPercentageIncrease}
                    disabled={!percentageIncrease || loading}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg whitespace-nowrap"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                        Güncelleniyor...
                      </>
                    ) : (
                      '💸 Uygula'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <span className="ml-3 text-white">{activeTab === 'medications' ? 'İlaçlar' : 'Cihazlar'} yükleniyor...</span>
                </div>
              ) : activeTab === 'medications' ? (
                filteredAndSortedMedications.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">💊</div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {searchTerm || filterCategory !== 'all' ? 'Arama kriterlerinize uygun ilaç bulunamadı' : 'Henüz ilaç eklenmemiş'}
                    </h3>
                    <p className="text-white/60">
                      {searchTerm || filterCategory !== 'all' ? 'Farklı bir arama deneyin' : 'İlk ilacınızı eklemek için yukarıdaki butonu kullanın'}
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-4">
                      📋 İlaçlar ({filteredAndSortedMedications.length})
                    </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAndSortedMedications.map((medication) => (
                      <div 
                        key={medication.id} 
                        className={`bg-white/5 border rounded-xl p-4 transition-all duration-200 hover:bg-white/10 ${
                          isLowStock(medication)
                            ? 'border-yellow-500/50 bg-yellow-500/10'
                            : medication.expiryDate && new Date(medication.expiryDate) < new Date()
                              ? 'border-red-500/50 bg-red-500/10'
                              : 'border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-semibold text-white">{getMedicationDisplayName(medication)}</h4>
                              <span className="px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full text-green-300 text-sm font-medium">
                                💰 {medication.price.toFixed(2)} TL
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mb-2">
                              {medication.category && (
                                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                                  {medication.category}
                                </span>
                              )}
                              {medication.dosageForm && (
                                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                                  {medication.dosageForm}
                                </span>
                              )}
                              {medication.prescriptionRequired && (
                                <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                                  📝 Reçete Gerekli
                                </span>
                              )}
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                isLowStock(medication)
                                  ? medication.stockQuantity <= 0
                                    ? 'bg-red-500/30 text-red-200'
                                    : 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-green-500/20 text-green-300'
                              }`}>
                                {isLowStock(medication) && medication.stockQuantity > 0 ? '⚠️ ' : ''}
                                {medication.stockQuantity <= 0
                                  ? '📦 Stok Tükendi'
                                  : `📦 Stok: ${medication.stockQuantity}${medication.minStockLevel > 0 ? ` (min ${medication.minStockLevel})` : ''}`}
                              </span>
                            </div>
                            
                            {medication.barcode && (
                              <p className="text-white/70 text-sm mb-1">Barkod: {medication.barcode}</p>
                            )}
                            
                            {medication.manufacturer && (
                              <p className="text-white/70 text-sm mb-1">{medication.manufacturer}</p>
                            )}
                            
                            {medication.expiryDate && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  new Date(medication.expiryDate) < new Date()
                                    ? 'bg-red-500/20 text-red-300'
                                    : new Date(medication.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                      ? 'bg-orange-500/20 text-orange-300'
                                      : 'bg-blue-500/20 text-blue-300'
                                }`}>
                                  📅 {new Date(medication.expiryDate).toLocaleDateString('tr-TR')}
                                </span>
                              </div>
                            )}
                            
                            {medication.description && (
                              <p className="text-white/70 text-sm mt-2 line-clamp-2">{medication.description}</p>
                            )}
                            
                            <div className="flex items-center gap-4 text-xs text-white/50 mt-3">
                              <span>👨‍⚕️ {medication.createdBy}</span>
                              <span>📅 {new Date(medication.createdAt).toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => editMedication(medication)}
                              className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm"
                            >
                              ✏️ Düzenle
                            </button>
                            <button
                              onClick={() => deleteMedication(medication.id)}
                              className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200 text-sm"
                            >
                              🗑️ Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
              ) : activeTab === 'devices' ? (
                filteredAndSortedDevices.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🏥</div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {searchTerm || filterCategory !== 'all' ? 'Arama kriterlerinize uygun cihaz bulunamadı' : 'Henüz cihaz eklenmemiş'}
                    </h3>
                    <p className="text-white/60">
                      {searchTerm || filterCategory !== 'all' ? 'Farklı bir arama deneyin' : 'İlk cihazınızı eklemek için yukarıdaki butonu kullanın'}
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-4">
                      📋 Tıbbi Cihazlar ({filteredAndSortedDevices.length})
                    </h3>
                  
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredAndSortedDevices.map((device) => (
                        <div 
                          key={device.id} 
                          className={`bg-white/5 border rounded-xl p-4 transition-all duration-200 hover:bg-white/10 ${
                            isLowStock(device)
                              ? 'border-yellow-500/50 bg-yellow-500/10'
                              : device.maintenanceRequired && device.nextMaintenanceDate && new Date(device.nextMaintenanceDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                ? 'border-orange-500/50 bg-orange-500/10'
                                : 'border-white/20'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-lg font-semibold text-white">{device.name}</h4>
                                <span className="px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full text-green-300 text-sm font-medium">
                                  💰 {device.price.toFixed(2)} TL
                                </span>
                              </div>
                              
                              <div className="flex flex-wrap gap-2 mb-2">
                                {device.category && (
                                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                                    {device.category}
                                  </span>
                                )}
                                {device.deviceType && (
                                  <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                                    {device.deviceType}
                                  </span>
                                )}
                                {device.maintenanceRequired && (
                                  <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                                    🔧 Bakım Takipli
                                  </span>
                                )}
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  isLowStock(device)
                                    ? device.stockQuantity <= 0
                                      ? 'bg-red-500/30 text-red-200'
                                      : 'bg-yellow-500/20 text-yellow-300'
                                    : 'bg-green-500/20 text-green-300'
                                }`}>
                                  {isLowStock(device) && device.stockQuantity > 0 ? '⚠️ ' : ''}
                                  {device.stockQuantity <= 0
                                    ? '📦 Stok Tükendi'
                                    : `📦 Stok: ${device.stockQuantity}${device.minStockLevel > 0 ? ` (min ${device.minStockLevel})` : ''}`}
                                </span>
                              </div>
                              
                              {device.serialNumber && (
                                <p className="text-white/70 text-sm mb-1">Seri No: {device.serialNumber}</p>
                              )}
                              
                              {device.manufacturer && (
                                <p className="text-white/70 text-sm mb-1">{device.manufacturer}</p>
                              )}
                              

                              
                              {device.description && (
                                <p className="text-white/70 text-sm mt-2 line-clamp-2">{device.description}</p>
                              )}
                              
                              <div className="flex items-center gap-4 text-xs text-white/50 mt-3">
                                <span>👨‍⚕️ {device.createdBy}</span>
                                <span>📅 {new Date(device.createdAt).toLocaleDateString('tr-TR')}</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => editDevice(device)}
                                className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm"
                              >
                                ✏️ Düzenle
                              </button>
                              <button
                                onClick={() => deleteDevice(device.id)}
                                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200 text-sm"
                              >
                                🗑️ Sil
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              ) : null}
            </div>
          </div>
          )}

          {/* Patients Waiting for Pharmacy */}
          {activeTab === 'patients' && (
            <div className="space-y-4">
              {waitingPatients.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">👥</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Bekleyen Hasta Yok
                  </h3>
                  <p className="text-white/60">
                    Şu anda eczanede bekleyen hasta bulunmamaktadır.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    👥 Bekleyen Hastalar ({waitingPatients.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {waitingPatients.map((patient) => (
                      <div
                        key={patient.id}
                        className={`bg-white/5 border rounded-xl p-6 transition-all duration-200 hover:bg-white/10 ${
                          patient.pharmacyHasDebt && patient.pharmacyDebtAmount && patient.pharmacyDebtAmount > 0
                            ? 'border-red-400/50 bg-red-500/10'
                            : 'border-white/20'
                        }`}
                      >
                        {/* Pharmacy Debt Warning Badge */}
                        {patient.pharmacyHasDebt && patient.pharmacyDebtAmount && patient.pharmacyDebtAmount > 0 && (
                          <div className="mb-3 p-2 bg-red-500/20 border border-red-400/30 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">⚠️</span>
                              <div>
                                <p className="text-red-200 text-xs font-bold">ECZANE BORCU</p>
                                <p className="text-red-100 text-sm font-medium">
                                  {patient.pharmacyDebtAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Prescription Changed Badge */}
                        {patient.prescriptionChanged && (
                          <div className="mb-3 p-2 bg-orange-500/20 border border-orange-400/40 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🔁</span>
                              <div>
                                <p className="text-orange-200 text-xs font-bold">REÇETE DEĞİŞTİ</p>
                                {patient.pharmacyChangeNote && (
                                  <p className="text-orange-100 text-xs">{patient.pharmacyChangeNote}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl text-white ${
                            patient.pharmacyHasDebt && patient.pharmacyDebtAmount && patient.pharmacyDebtAmount > 0
                              ? 'bg-gradient-to-br from-red-500 to-orange-600'
                              : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                          }`}>
                            👤
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-white">{patient.fullName}</h4>
                            <p className="text-white/60 text-sm">TC: {patient.tcNo}</p>
                          </div>
                        </div>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Geliş Tarihi:</span>
                            <span className="text-white">{new Date(patient.createdAt).toLocaleDateString('tr-TR')}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Tedavi Bitiş:</span>
                            <span className="text-white">{patient.treatmentCompletedAt ? new Date(patient.treatmentCompletedAt).toLocaleDateString('tr-TR') : '-'}</span>
                          </div>
                        </div>
                        <button
                          className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                          onClick={() => handleOpenSaleModal(patient)}
                        >
                          💊 İlaç Satışı Yap
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Prescription Changes Report */}
          {activeTab === 'prescription_changes' && (
            <div className="space-y-4">
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex-1 min-w-[250px]">
                    <input
                      type="text"
                      value={prescriptionChangeSearch}
                      onChange={(e) => setPrescriptionChangeSearch(e.target.value)}
                      placeholder="Hasta adı veya TC No ile ara..."
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchPrescriptionChanges()}
                      className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-200"
                    >
                      🔄 Yenile
                    </button>
                    <button
                      onClick={exportPrescriptionChangesExcel}
                      disabled={prescriptionChangeRows.length === 0}
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-white font-medium transition-all duration-200"
                    >
                      📊 Excel İndir
                    </button>
                  </div>
                </div>
              </div>

              {prescriptionChangeRows.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔁</div>
                  <h3 className="text-xl font-semibold text-white mb-2">Reçete Değişikliği Yok</h3>
                  <p className="text-white/60">Henüz hiçbir hasta için reçete değişikliği yapılmamış.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white">
                    🔁 Reçete Değişiklikleri ({prescriptionChangeRows.length})
                  </h3>
                  <div className="space-y-3">
                    {prescriptionChangeRows.map(({ patient, change }, idx) => (
                      <div key={`${patient.id}-${idx}`} className="bg-white/5 border border-white/20 rounded-xl p-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                          <div>
                            <h4 className="text-white font-semibold">{patient.fullName}</h4>
                            <p className="text-white/50 text-xs">TC: {patient.tcNo || '-'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white/70 text-sm">{new Date(change.changedAt).toLocaleString('tr-TR')}</p>
                            <p className="text-white/40 text-xs">
                              {change.changedBy}{change.changedByRole ? ` (${change.changedByRole})` : ''}
                              {change.instructedBy ? ` • Talimat: ${change.instructedBy}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-white/40 text-xs mb-1">Önceki İlaçlar</p>
                            <div className="flex flex-wrap gap-1">
                              {(change.previousMeds || []).length > 0 ? change.previousMeds.map((m, j) => (
                                <span key={j} className="px-2 py-0.5 bg-red-500/15 text-red-200 border border-red-400/30 rounded text-xs line-through">
                                  {m.name}{m.dosage ? ` (${m.dosage})` : ''}
                                </span>
                              )) : <span className="text-white/30 text-xs">-</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs mb-1">Yeni İlaçlar</p>
                            <div className="flex flex-wrap gap-1">
                              {(change.newMeds || []).map((m, j) => (
                                <span key={j} className="px-2 py-0.5 bg-green-500/15 text-green-200 border border-green-400/30 rounded text-xs">
                                  {m.name}{m.dosage ? ` (${m.dosage})` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {change.reason && <p className="text-white/60 text-xs mt-2">📝 {change.reason}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Patients with Pharmacy Debts */}
          {activeTab === 'pharmacy_debt' && (
            <div className="space-y-4">
              {/* Search and Sort */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[250px]">
                    <input
                      type="text"
                      value={pharmacyDebtSearchTerm}
                      onChange={(e) => setPharmacyDebtSearchTerm(e.target.value)}
                      placeholder="Hasta adı veya TC No ile ara..."
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>

                  <select
                    value={pharmacyDebtSortBy}
                    onChange={(e) => setPharmacyDebtSortBy(e.target.value as 'name' | 'amount' | 'date')}
                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="date" className="text-gray-900 bg-white">En Yeni Borç</option>
                    <option value="amount" className="text-gray-900 bg-white">Borç Tutarı (Yüksek)</option>
                    <option value="name" className="text-gray-900 bg-white">İsim</option>
                  </select>

                  <button
                    onClick={() => fetchPatientsWithPharmacyDebts()}
                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-200"
                  >
                    🔄 Yenile
                  </button>
                </div>

                {/* Debt Type Filter Buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10">
                  <span className="text-white/50 text-sm mr-1">Borç Türü:</span>
                  <button
                    onClick={() => setPharmacyDebtTypeFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      pharmacyDebtTypeFilter === 'all'
                        ? 'bg-white/30 text-white border border-white/50'
                        : 'bg-white/10 text-white/60 border border-white/20 hover:bg-white/20'
                    }`}
                  >
                    🔵 Tümü
                  </button>
                  <button
                    onClick={() => setPharmacyDebtTypeFilter('direct_sale')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      pharmacyDebtTypeFilter === 'direct_sale'
                        ? 'bg-teal-600/70 text-white border border-teal-400/70'
                        : 'bg-teal-900/30 text-teal-300 border border-teal-500/30 hover:bg-teal-700/40'
                    }`}
                  >
                    🛒 Eczane Satış
                  </button>
                  <button
                    onClick={() => setPharmacyDebtTypeFilter('treatment_patient')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      pharmacyDebtTypeFilter === 'treatment_patient'
                        ? 'bg-purple-600/70 text-white border border-purple-400/70'
                        : 'bg-purple-900/30 text-purple-300 border border-purple-500/30 hover:bg-purple-700/40'
                    }`}
                  >
                    💊 Tedavi Hastası
                  </button>
                </div>
              </div>

              {loadingPharmacyDebts ? (
                <div className="text-center py-12">
                  <div className="inline-block">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-white/70 mt-4">Borçlu hastalar yükleniyor...</p>
                </div>
              ) : patientsWithDebt.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Borçlu Hasta Yok
                  </h3>
                  <p className="text-white/60">
                    Eczanede bekleyen borçlu hasta bulunmamaktadır.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    💳 Borçlu Hastalar ({patientsWithDebt.filter(p => {
                      const type = getPatientDebtType(p.debts);
                      if (pharmacyDebtTypeFilter === 'all') return true;
                      if (pharmacyDebtTypeFilter === 'direct_sale') return type === 'direct_sale' || type === 'mixed';
                      return type === 'treatment_patient' || type === 'mixed';
                    }).length})
                  </h3>
                  <div className="space-y-3">
                    {patientsWithDebt
                      .filter(patient => {
                        const matchesSearch =
                          patient.patientName.toLowerCase().includes(pharmacyDebtSearchTerm.toLowerCase()) ||
                          patient.tcNo.includes(pharmacyDebtSearchTerm);
                        if (!matchesSearch) return false;
                        if (pharmacyDebtTypeFilter === 'all') return true;
                        const type = getPatientDebtType(patient.debts);
                        if (pharmacyDebtTypeFilter === 'direct_sale') return type === 'direct_sale' || type === 'mixed';
                        return type === 'treatment_patient' || type === 'mixed';
                      })
                      .sort((a, b) => {
                        if (pharmacyDebtSortBy === 'amount') {
                          return b.totalDebt - a.totalDebt;
                        } else if (pharmacyDebtSortBy === 'date') {
                          return new Date(b.lastDebtDate).getTime() - new Date(a.lastDebtDate).getTime();
                        } else {
                          return a.patientName.localeCompare(b.patientName);
                        }
                      })
                      .map((patient) => (
                        <div
                          key={patient.tcNo}
                          className="bg-white/5 border border-red-400/30 hover:border-red-400/50 rounded-xl p-5 transition-all duration-200 hover:bg-white/10"
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            {/* Patient Info */}
                            <div className="flex items-start gap-4 flex-1">
                              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white bg-gradient-to-br from-red-500 to-orange-600">
                                👤
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-lg font-semibold text-white">{patient.patientName}</h4>
                                  <DebtTypeBadge debts={patient.debts} />
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/60">
                                  <span>TC: {patient.tcNo}</span>
                                  {patient.phone && <span>📱 {patient.phone}</span>}
                                  <span>Son Borç: {new Date(patient.lastDebtDate).toLocaleDateString('tr-TR')}</span>
                                </div>
                              </div>
                            </div>

                            {/* Debt Stats */}
                            <div className="flex flex-wrap items-center gap-4 md:flex-col md:items-end">
                              <div className={`rounded-lg px-4 py-2 text-white font-semibold ${
                                getPatientDebtType(patient.debts) === 'direct_sale'
                                  ? 'bg-teal-700'
                                  : getPatientDebtType(patient.debts) === 'mixed'
                                  ? 'bg-orange-700'
                                  : 'bg-purple-700'
                              }`}>
                                <div className="text-xs opacity-70">Toplam Borç</div>
                                <div className="text-lg">
                                  {patient.totalDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                                </div>
                              </div>
                              <div className="bg-yellow-600 rounded-lg px-4 py-2 text-white font-semibold">
                                <div className="text-xs text-yellow-200">İşlem Sayısı</div>
                                <div className="text-lg">{patient.debtCount}</div>
                              </div>
                            </div>
                          </div>

                          {/* Debt Details + Pay Button */}
                          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3">
                            <button
                              onClick={() => handleOpenDebtPaymentFromDebtList(patient)}
                              className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-green-500/25"
                            >
                              💳 Borç Öde
                            </button>
                            <details className="cursor-pointer group">
                              <summary className="flex items-center justify-between text-sm text-white/70 hover:text-white transition-colors">
                                <span className="flex items-center gap-2">
                                  <span>📝</span>
                                  Borç Detayları ({patient.debtCount})
                                </span>
                                <span className="text-lg group-open:rotate-180 transition-transform">›</span>
                              </summary>
                              <div className="mt-3 space-y-2">
                                {patient.debts.map((debt: any, idx: number) => (
                                  <div key={idx} className={`rounded-lg p-3 border ${
                                    (debt.debtSource === 'direct_sale' || debt.reason?.includes('Direkt'))
                                      ? 'bg-teal-900/30 border-teal-500/20'
                                      : 'bg-purple-900/30 border-purple-500/20'
                                  }`}>
                                    <div className="flex items-center justify-between">
                                      <div className="text-sm">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          {(debt.debtSource === 'direct_sale' || debt.reason?.includes('Direkt'))
                                            ? <span className="text-teal-300 text-xs">🛒 Eczane Satışı</span>
                                            : <span className="text-purple-300 text-xs">💊 Tedavi Hastası</span>
                                          }
                                        </div>
                                        <p className="text-white font-medium">
                                          {debt.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                                        </p>
                                        <p className="text-white/50 text-xs">
                                          {new Date(debt.createdAt).toLocaleDateString('tr-TR')} {new Date(debt.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                      {debt.reason && (
                                        <div className="text-right">
                                          <p className="text-white/60 text-xs">{debt.reason}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}



          {/* ─── ECZANE SATIŞ TAB ─── */}
          {activeTab === 'direct_sale' && (
            <>
            {/* View Toggle */}
            <div className="flex gap-3 mb-2">
              <button
                onClick={() => setDsView('sale')}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  dsView === 'sale'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                🛒 Yeni Satış
              </button>
              <button
                onClick={() => { setDsView('history'); fetchDirectSales(); }}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  dsView === 'history'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                📋 Geçmiş Satışlar
                {dsHistorySales.length > 0 && (
                  <span className="ml-2 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                    {dsHistorySales.length}
                  </span>
                )}
              </button>
            </div>

            {/* ── GEÇMIŞ SATIŞLAR VIEW ── */}
            {dsView === 'history' && (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <input
                      type="text"
                      value={dsHistorySearch}
                      onChange={(e) => setDsHistorySearch(e.target.value)}
                      placeholder="Müşteri adı ile ara..."
                      className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <button
                    onClick={fetchDirectSales}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white/80 text-sm transition-all flex items-center gap-2"
                  >
                    🔄 Yenile
                  </button>
                  <button
                    onClick={exportDirectSalesPdf}
                    disabled={dsHistorySales.length === 0}
                    className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all shadow-md flex items-center gap-2"
                  >
                    📄 PDF İndir
                  </button>
                </div>

                {dsHistoryLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mr-3"></div>
                    <span className="text-white/60">Yükleniyor...</span>
                  </div>
                ) : (() => {
                  const filtered = dsHistorySales.filter(s =>
                    !dsHistorySearch.trim() ||
                    (s.customerName || '').toLowerCase().includes(dsHistorySearch.toLowerCase())
                  );
                  return filtered.length === 0 ? (
                    <div className="text-center py-16 text-white/40">
                      <div className="text-5xl mb-3">📋</div>
                      <p className="text-lg font-medium">
                        {dsHistorySales.length === 0 ? 'Henüz satış kaydı yok' : 'Arama sonucu yok'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Summary stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-r from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 rounded-2xl p-4">
                          <div className="text-emerald-300 text-xl mb-1">🧾</div>
                          <div className="text-white text-2xl font-bold">{filtered.length}</div>
                          <div className="text-white/60 text-sm">Toplam Satış</div>
                        </div>
                        <div className="bg-gradient-to-r from-blue-500/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl p-4">
                          <div className="text-blue-300 text-xl mb-1">💰</div>
                          <div className="text-white text-2xl font-bold">
                            {filtered.reduce((s, x) => s + (x.totalAmount || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                          </div>
                          <div className="text-white/60 text-sm">Toplam Gelir</div>
                        </div>
                        <div className="bg-gradient-to-r from-orange-500/20 to-red-600/20 border border-orange-500/30 rounded-2xl p-4">
                          <div className="text-orange-300 text-xl mb-1">🏷️</div>
                          <div className="text-white text-2xl font-bold">
                            {filtered.reduce((s, x) => s + Math.max(0, typeof x.discountAmount === 'number' ? x.discountAmount : (x.totalAmount || 0) - (x.paidAmount || 0) - (x.remainingDebt || 0)), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                          </div>
                          <div className="text-white/60 text-sm">Toplam İndirim</div>
                        </div>
                        <div className="bg-gradient-to-r from-purple-500/20 to-pink-600/20 border border-purple-500/30 rounded-2xl p-4">
                          <div className="text-purple-300 text-xl mb-1">💊</div>
                          <div className="text-white text-2xl font-bold">
                            {filtered.reduce((s, x) => s + (x.items?.length || 0), 0)}
                          </div>
                          <div className="text-white/60 text-sm">Toplam Ürün Kalemi</div>
                        </div>
                      </div>

                      {/* Sales list */}
                      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-white/10">
                            <tr>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide">Tarih</th>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide">Müşteri</th>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide">Ürünler</th>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide">Tutar</th>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide">Ödeme</th>
                              <th className="px-4 py-3 text-white/60 text-xs font-medium uppercase tracking-wide"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filtered.map((sale) => (
                              <tr key={sale.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 text-white/70 text-sm whitespace-nowrap">
                                  {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('tr-TR') : '-'}
                                  <div className="text-white/40 text-xs">
                                    {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-white font-medium text-sm">{sale.customerName || '-'}</p>
                                  {sale.customerTcNo && <p className="text-white/40 text-xs">TC: {sale.customerTcNo}</p>}
                                  {sale.customerType === 'new' && (
                                    <span className="inline-block mt-0.5 bg-purple-500/20 text-purple-300 text-xs px-1.5 py-0.5 rounded">Yeni Müşteri</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 max-w-[220px]">
                                  {(sale.items || []).slice(0, 2).map((item: any, i: number) => (
                                    <div key={i} className="text-white/80 text-sm truncate">
                                      {item.name} <span className="text-white/40">×{item.quantity}</span>
                                    </div>
                                  ))}
                                  {(sale.items || []).length > 2 && (
                                    <div className="text-white/40 text-xs">+{sale.items.length - 2} daha</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-emerald-400 font-bold text-sm">
                                    {(sale.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                                  </span>
                                  {(() => {
                                    const d = Math.max(0, typeof sale.discountAmount === 'number' ? sale.discountAmount : (sale.totalAmount || 0) - (sale.paidAmount || 0) - (sale.remainingDebt || 0));
                                    return d > 0 ? (
                                      <div className="text-orange-300 text-xs mt-0.5">🏷️ İndirim: {d.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
                                    ) : null;
                                  })()}
                                  {sale.isPartialPayment && (
                                    <div className="text-orange-400 text-xs mt-0.5">⚠️ Eksik ödeme</div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {(sale.paymentMethods || []).length > 0 ? (
                                    <div className="space-y-0.5">
                                      {(sale.paymentMethods as PaymentMethodEntry[]).map((m, i) => (
                                        <div key={i} className="flex items-center gap-1">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                            m.method === 'nakit' ? 'bg-green-500/20 text-green-300'
                                            : m.method === 'kredi_karti' ? 'bg-blue-500/20 text-blue-300'
                                            : m.method === 'banka_karti' ? 'bg-purple-500/20 text-purple-300'
                                            : m.method === 'havale' ? 'bg-yellow-500/20 text-yellow-300'
                                            : 'bg-orange-500/20 text-orange-300'
                                          }`}>
                                            {m.method === 'nakit' ? '💵 Nakit' : m.method === 'kredi_karti' ? '💳 Kredi' : m.method === 'banka_karti' ? '💳 Banka' : m.method === 'havale' ? '🏦 Havale' : '📋 Cari'}
                                          </span>
                                          <span className="text-white/50 text-xs">{m.amount.toFixed(2)} TL</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <span className="text-white/30 text-xs">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => setDsSelectedHistorySale(sale)}
                                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-lg text-xs transition-all"
                                  >
                                    Detay
                                  </button>
                                  <button
                                    onClick={() => exportSingleSalePdf(sale)}
                                    className="ml-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 rounded-lg text-xs transition-all"
                                  >
                                    📄 Fiş
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── YENİ SATIŞ VIEW ── */}
            {dsView === 'sale' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

              {/* COL 1: Hasta Seçimi */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl flex flex-col" style={{ minHeight: '60vh', maxHeight: '72vh' }}>
                <div className="p-4 border-b border-white/10 flex-shrink-0">
                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => { setDsCustomerMode('existing'); setDsNewCustomerName(''); }}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                        dsCustomerMode === 'existing'
                          ? 'bg-teal-600 text-white shadow-md'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      👥 Mevcut Hastalar
                    </button>
                    <button
                      onClick={() => { setDsCustomerMode('new'); setDsSelectedPatient(null); setDsPatientSearch(''); setDsNewCustomerLocked(false); }}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                        dsCustomerMode === 'new'
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      ✏️ Yeni Müşteri
                    </button>
                  </div>

                  {dsCustomerMode === 'existing' ? (
                    <input
                      type="text"
                      value={dsPatientSearch}
                      onChange={(e) => setDsPatientSearch(e.target.value)}
                      placeholder="İsim veya TC ile ara..."
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  ) : dsNewCustomerLocked ? (
                    <div className="bg-emerald-500/15 border-2 border-emerald-400/40 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-semibold">
                          🔒 Müşteri Kaydedildi
                        </span>
                        <button
                          type="button"
                          onClick={() => setDsNewCustomerLocked(false)}
                          className="text-white/60 hover:text-white text-xs underline"
                        >
                          ✏️ Düzenle
                        </button>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-white font-semibold truncate">{dsNewCustomerName || '—'}</p>
                        {dsNewCustomerTcNo && <p className="text-white/70 text-xs">TC: {dsNewCustomerTcNo}</p>}
                        {dsNewCustomerPhone && <p className="text-white/70 text-xs">☎ {dsNewCustomerPhone}</p>}
                        {dsNewCustomerAddress && <p className="text-white/70 text-xs truncate">📍 {dsNewCustomerAddress}</p>}
                        {!dsNewCustomerTcNo && !dsNewCustomerPhone && !dsNewCustomerAddress && (
                          <p className="text-white/40 text-xs italic">İletişim bilgisi yok</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={dsNewCustomerName}
                        onChange={(e) => setDsNewCustomerName(e.target.value)}
                        placeholder="Müşteri adı soyadı..."
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={dsNewCustomerTcNo}
                        onChange={(e) => setDsNewCustomerTcNo(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="TC Kimlik No (opsiyonel)"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                      <input
                        type="text"
                        inputMode="tel"
                        value={dsNewCustomerPhone}
                        onChange={(e) => setDsNewCustomerPhone(e.target.value)}
                        placeholder="Telefon (opsiyonel)"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                      <textarea
                        rows={2}
                        value={dsNewCustomerAddress}
                        onChange={(e) => setDsNewCustomerAddress(e.target.value)}
                        placeholder="Adres (opsiyonel)"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!dsNewCustomerName.trim()) {
                            alert('Lütfen önce müşteri adını girin.');
                            return;
                          }
                          setDsNewCustomerLocked(true);
                        }}
                        disabled={!dsNewCustomerName.trim()}
                        className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        💾 Müşteriyi Kaydet
                      </button>
                      <p className="text-white/40 text-xs leading-snug">
                        ℹ️ İletişim bilgileri opsiyoneldir. Müşteri, satış tamamlandığında klinik hasta listesine eklenir.
                      </p>
                    </div>
                  )}
                </div>

                {dsRecentSaveInfo && (
                  <div className="mx-4 mb-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-3 py-2.5 flex items-start gap-2 animate-pulse">
                    <span className="text-emerald-300 text-lg leading-none">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-emerald-200 text-sm font-semibold truncate">Satış tamamlandı</p>
                      <p className="text-emerald-300/80 text-xs truncate">
                        {dsRecentSaveInfo.savedAsPatient
                          ? `${dsRecentSaveInfo.name} müşteri olarak kaydedildi`
                          : `${dsRecentSaveInfo.name}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Patient list */}
                {dsCustomerMode === 'existing' ? (
                  <div className="flex-1 overflow-y-auto">
                    {dsAllPatients
                      .filter(p =>
                        !dsPatientSearch.trim() ||
                        p.fullName.toLowerCase().includes(dsPatientSearch.toLowerCase()) ||
                        (p.tcNo || '').includes(dsPatientSearch)
                      )
                      .map(p => (
                        <button
                          key={p.id}
                          onClick={() => setDsSelectedPatient(dsSelectedPatient?.id === p.id ? null : p)}
                          className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition-all ${
                            dsSelectedPatient?.id === p.id
                              ? 'bg-teal-500/25 border-l-4 border-l-teal-400'
                              : 'hover:bg-white/8'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                              dsSelectedPatient?.id === p.id ? 'bg-teal-500 text-white' : 'bg-white/10 text-white/60'
                            }`}>
                              {p.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${dsSelectedPatient?.id === p.id ? 'text-teal-300' : 'text-white'}`}>
                                {p.fullName}
                              </p>
                              {p.tcNo && <p className="text-white/40 text-xs">TC: {p.tcNo}</p>}
                            </div>
                            {dsSelectedPatient?.id === p.id && (
                              <span className="text-teal-400 text-xl flex-shrink-0">✓</span>
                            )}
                          </div>
                        </button>
                      ))
                    }
                    {dsAllPatients.filter(p =>
                      !dsPatientSearch.trim() ||
                      p.fullName.toLowerCase().includes(dsPatientSearch.toLowerCase()) ||
                      (p.tcNo || '').includes(dsPatientSearch)
                    ).length === 0 && (
                      <div className="flex flex-col items-center justify-center h-40 text-white/40">
                        <span className="text-3xl mb-2">👥</span>
                        <p className="text-sm">Hasta bulunamadı</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-white/50 p-6">
                      <div className="text-5xl mb-3">✏️</div>
                      {dsNewCustomerName.trim()
                        ? <p className="text-white font-semibold text-lg">{dsNewCustomerName}</p>
                        : <p className="text-sm">Yukarıya müşteri adını yazın</p>
                      }
                    </div>
                  </div>
                )}

                {(dsCustomerMode === 'existing' ? dsSelectedPatient : dsNewCustomerName.trim()) && (
                  <div className="flex-shrink-0 px-4 py-2 bg-teal-500/15 border-t border-teal-500/20">
                    <p className="text-teal-300 text-xs font-medium text-center truncate">
                      ✓ {dsCustomerMode === 'existing' ? dsSelectedPatient!.fullName : dsNewCustomerName.trim()}
                    </p>
                  </div>
                )}
              </div>

              {/* COL 2: İlaçlar + Sepet */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl flex flex-col" style={{ minHeight: '60vh', maxHeight: '72vh' }}>
                {/* Medications header */}
                <div className="p-4 border-b border-white/10 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <span>💊</span> İlaçlar
                    </h3>
                    <span className="text-white/40 text-xs">{savedMedications.length} kayıt</span>
                  </div>
                  <input
                    type="text"
                    value={dsAppSearch}
                    onChange={(e) => setDsAppSearch(e.target.value)}
                    placeholder="İlaç adı ara..."
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                {/* Medications list */}
                <div className="flex-1 overflow-y-auto">
                  {savedMedications
                    .filter(m => {
                      const display = getMedicationDisplayName(m).toLowerCase();
                      const term = dsAppSearch.toLowerCase();
                      return !term || display.includes(term) || (m.barcode || '').includes(term);
                    })
                    .map(m => {
                      const inCart = dsSaleItems.find(i => i.medication.id === m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setDsSaleItems(prev => {
                              const idx = prev.findIndex(i => i.medication.id === m.id);
                              if (idx >= 0) {
                                const updated = [...prev];
                                updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
                                return updated;
                              }
                              return [...prev, { medication: m, quantity: 1 }];
                            });
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition-all hover:bg-white/10 flex items-center justify-between gap-3 ${
                            inCart ? 'bg-emerald-500/10' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${inCart ? 'text-emerald-300' : 'text-white'}`}>
                              {getMedicationDisplayName(m)}
                            </p>
                            {m.category && <p className="text-white/40 text-xs truncate">{m.category}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-emerald-400 font-bold text-sm whitespace-nowrap">{m.price.toFixed(2)} TL</span>
                            {inCart ? (
                              <span className="bg-emerald-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold shadow">
                                {inCart.quantity}
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-white/40 text-sm">+</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  }
                  {savedMedications.filter(m => {
                    const display = getMedicationDisplayName(m).toLowerCase();
                    const term = dsAppSearch.toLowerCase();
                    return !term || display.includes(term) || (m.barcode || '').includes(term);
                  }).length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-white/40">
                      <span className="text-3xl mb-2">💊</span>
                      <p className="text-sm">{savedMedications.length === 0 ? 'İlaç bulunamadı' : 'Arama sonucu yok'}</p>
                    </div>
                  )}
                </div>

                {/* Cart summary + Ödeme Yap button */}
                {dsSaleItems.length > 0 && (
                  <div className="flex-shrink-0 border-t border-white/10 bg-white/5 p-4 space-y-3">
                    {/* Compact cart list */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {dsSaleItems.map((item, idx) => (
                        <div key={item.medication.id} className="flex items-center gap-2">
                          <span className="text-white/70 text-xs flex-1 truncate">{getMedicationDisplayName(item.medication)}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setDsSaleItems(prev => {
                                const updated = [...prev];
                                if (updated[idx].quantity > 1) {
                                  updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 };
                                } else { updated.splice(idx, 1); }
                                return updated;
                              })}
                              className="w-5 h-5 bg-white/10 hover:bg-red-500/30 rounded text-white text-xs transition-colors flex items-center justify-center"
                            >−</button>
                            <span className="text-white text-xs w-4 text-center">{item.quantity}</span>
                            <button
                              onClick={() => setDsSaleItems(prev => {
                                const updated = [...prev];
                                updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
                                return updated;
                              })}
                              className="w-5 h-5 bg-white/10 hover:bg-green-500/30 rounded text-white text-xs transition-colors flex items-center justify-center"
                            >+</button>
                            <button
                              onClick={() => setDsSaleItems(prev => prev.filter((_, i) => i !== idx))}
                              className="ml-1 text-white/30 hover:text-red-400 text-sm transition-colors"
                            >✕</button>
                          </div>
                          <span className="text-emerald-400 text-xs w-16 text-right flex-shrink-0">
                            {(item.medication.price * item.quantity).toFixed(2)} TL
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Total + Payment button */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <div>
                        <p className="text-white/50 text-xs">Toplam</p>
                        <p className="text-white font-bold text-lg">
                          {dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const customer = dsCustomerMode === 'existing' ? dsSelectedPatient?.fullName : dsNewCustomerName.trim();
                          if (!customer) { alert('Lütfen önce bir hasta/müşteri seçin.'); return; }
                          setDsPaymentModalOpen(true);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2"
                      >
                        💳 Ödeme Yap
                      </button>
                    </div>
                  </div>
                )}

                {dsSaleItems.length === 0 && (
                  <div className="flex-shrink-0 p-4 border-t border-white/10 text-center text-white/30 text-sm">
                    Listeden uygulama seçin
                  </div>
                )}
              </div>

            </div>
            )}

            {/* ─── ÖDEME MODALI ─── */}
            {/* ─── SATIŞ DETAY MODALI ─── */}
            {dsSelectedHistorySale && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
                <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-bold text-lg">Satış Detayı</h3>
                      <p className="text-white/80 text-sm">{dsSelectedHistorySale.customerName}</p>
                    </div>
                    <button
                      onClick={() => setDsSelectedHistorySale(null)}
                      className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all"
                    >✕</button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
                    {/* Info */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-gray-400 text-xs mb-0.5">Tarih</p>
                        <p className="text-gray-800 font-medium">
                          {dsSelectedHistorySale.createdAt ? new Date(dsSelectedHistorySale.createdAt).toLocaleString('tr-TR') : '-'}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-gray-400 text-xs mb-0.5">Müşteri Tipi</p>
                        <p className="text-gray-800 font-medium">
                          {dsSelectedHistorySale.customerType === 'existing' ? '📋 Kayıtlı Hasta' : '✏️ Yeni Müşteri'}
                        </p>
                      </div>
                      {dsSelectedHistorySale.customerTcNo && (
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-0.5">TC No</p>
                          <p className="text-gray-800 font-medium">{dsSelectedHistorySale.customerTcNo}</p>
                        </div>
                      )}
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-gray-400 text-xs mb-0.5">Toplam Tutar</p>
                        <p className="text-emerald-700 font-bold text-lg">
                          {(dsSelectedHistorySale.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                        </p>
                      </div>
                    </div>
                    {/* Items */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 mb-2">Satılan Ürünler</h4>
                      <div className="space-y-2">
                        {(dsSelectedHistorySale.items || []).map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-gray-800 font-medium text-sm">{item.name}</p>
                              <p className="text-gray-400 text-xs">{item.quantity} adet × {(item.price || 0).toFixed(2)} TL</p>
                            </div>
                            <span className="text-emerald-700 font-bold text-sm">
                              {(item.price * item.quantity).toFixed(2)} TL
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Payment */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 mb-2">Ödeme Yöntemi</h4>
                      <div className="flex flex-wrap gap-2">
                        {(dsSelectedHistorySale.paymentMethods || []).map((m: PaymentMethodEntry, i: number) => (
                          <span key={i} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${
                            m.method === 'nakit' ? 'bg-green-100 text-green-700'
                            : m.method === 'kredi_karti' ? 'bg-blue-100 text-blue-700'
                            : m.method === 'banka_karti' ? 'bg-purple-100 text-purple-700'
                            : m.method === 'havale' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-orange-100 text-orange-700'
                          }`}>
                            {m.method === 'nakit' ? '💵 Nakit' : m.method === 'kredi_karti' ? '💳 Kredi Kartı' : m.method === 'banka_karti' ? '💳 Banka Kartı' : m.method === 'havale' ? '🏦 Havale/EFT' : '📋 Cari'}: {m.amount.toFixed(2)} TL
                          </span>
                        ))}
                      </div>
                      {dsSelectedHistorySale.isPartialPayment && (
                        <p className="text-orange-600 text-sm mt-2 font-medium">
                          ⚠️ Eksik ödeme — Kalan borç: {(dsSelectedHistorySale.remainingDebt || 0).toFixed(2)} TL
                        </p>
                      )}
                    </div>
                    {/* Note */}
                    {dsSelectedHistorySale.note && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <p className="text-blue-600 text-xs font-medium mb-1">📝 Not</p>
                        <p className="text-gray-700 text-sm">{dsSelectedHistorySale.note}</p>
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
                    <button
                      onClick={() => exportSingleSalePdf(dsSelectedHistorySale)}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-sm transition-all flex items-center gap-2"
                    >
                      📄 PDF Fiş İndir
                    </button>
                    <button
                      onClick={() => setDsSelectedHistorySale(null)}
                      className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium text-sm transition-all"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {dsPaymentModalOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
                <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                  {/* Modal Header */}
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">💳</div>
                      <div>
                        <h3 className="text-white font-bold text-lg">Eczane Satış Ödemesi</h3>
                        <p className="text-white/80 text-sm">
                          {dsCustomerMode === 'existing' ? dsSelectedPatient?.fullName : dsNewCustomerName.trim()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setDsPaymentModalOpen(false)}
                      className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all"
                    >✕</button>
                  </div>

                  <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                    {/* Item Summary */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-500 mb-3">Satış Özeti</h4>
                      <div className="space-y-2">
                        {dsSaleItems.map(item => (
                          <div key={item.medication.id} className="flex justify-between text-sm">
                            <span className="text-gray-700 truncate flex-1 mr-2">{getMedicationDisplayName(item.medication)} × {item.quantity}</span>
                            <span className="text-gray-900 font-semibold flex-shrink-0">{(item.medication.price * item.quantity).toFixed(2)} TL</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between font-bold">
                        <span className="text-gray-700">Toplam</span>
                        <span className="text-emerald-700 text-lg">
                          {dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                        </span>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    <MultiPaymentMethodSelector
                      value={dsPaymentMethods}
                      onChange={setDsPaymentMethods}
                      totalAmount={dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0)}
                    />

                    {/* Partial Payment */}
                    <div
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        dsPartialPayment ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200 hover:border-orange-200'
                      }`}
                      onClick={() => setDsPartialPayment(!dsPartialPayment)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                        dsPartialPayment ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                      }`}>
                        {dsPartialPayment && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <span className={`text-sm font-medium ${dsPartialPayment ? 'text-orange-700' : 'text-gray-600'}`}>
                        ⚠️ Hasta tamamını ödemedi
                      </span>
                    </div>

                    {dsPartialPayment && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium text-gray-600">Kalan Borç (TL)</label>
                          <span className="text-xs text-gray-400">Otomatik hesaplandı</span>
                        </div>
                        <input
                          type="number"
                          value={dsRemainingDebt}
                          onChange={(e) => setDsRemainingDebt(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 border border-orange-300 bg-orange-50 rounded-xl text-orange-800 font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    )}

                    {/* Note */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Not (Opsiyonel)</label>
                      <textarea
                        value={dsNote}
                        onChange={(e) => setDsNote(e.target.value)}
                        placeholder="Bu satış için not ekleyin..."
                        rows={2}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs">TOPLAM</p>
                      <p className="text-emerald-700 text-2xl font-bold">
                        {dsSaleItems.reduce((s, i) => s + i.medication.price * i.quantity, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setDsPaymentModalOpen(false)}
                        className="px-5 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleDirectSaleComplete}
                        disabled={
                          dsLoading ||
                          dsPaymentMethods.reduce((s, m) => s + (m.amount || 0), 0) <= 0
                        }
                        className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-emerald-500/25 flex items-center gap-2"
                      >
                        {dsLoading
                          ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> İşleniyor...</>
                          : <>✅ Ödemeyi Tamamla</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </>
      ) : (
            /* Add/Edit Form */
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">
              {activeTab === 'medications' 
                ? (editingMedication ? '✏️ İlaç Düzenle' : '➕ Yeni İlaç Ekle')
                : (editingDevice ? '✏️ Cihaz Düzenle' : '➕ Yeni Cihaz Ekle')
              }
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
                resetDeviceForm();
              }}
              className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded-xl text-gray-300 hover:text-gray-200 transition-all duration-200"
            >
              ← Geri
            </button>
          </div>

          {activeTab === 'medications' ? (
            /* Medication Form */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Protocol Name (from Treatment Protocols) */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    İlaç Adı (Protokol) *
                  </label>
                  <select
                    value={formData.protocolName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, protocolName: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="" className="text-gray-900 bg-white">Protokol seçin</option>
                    {protocolNames.map(name => (
                      <option key={name} value={name} className="text-gray-900 bg-white">{name}</option>
                    ))}
                  </select>
                </div>

              {/* Barcode */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Barkod
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Barkod numarası"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Kategori
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="" className="text-gray-900 bg-white">Seçiniz</option>
                  {MEDICATION_CATEGORIES.map(category => (
                    <option key={category} value={category} className="text-gray-900 bg-white">{category}</option>
                  ))}
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Fiyat (TL) *
                </label>
                <input
                  type="number"
                  value={formData.price === 0 ? '' : formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                  placeholder="Örn: 25.50"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Manufacturer */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Üretici Firma
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                  placeholder="Örn: Abdi İbrahim"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Son Kullanma Tarihi
                </label>
                <input
                  type="date"
                  value={formData.expiryDate || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Prescription Required */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="prescriptionRequired"
                  checked={formData.prescriptionRequired}
                  onChange={(e) => setFormData(prev => ({ ...prev, prescriptionRequired: e.target.checked }))}
                  className="w-5 h-5 text-blue-600 bg-white/10 border-white/20 rounded focus:ring-blue-500"
                />
                <label htmlFor="prescriptionRequired" className="ml-2 text-white/80 text-sm font-medium">
                  Reçete Gerekli
                </label>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                Açıklama
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder="Bu ilacın kullanım alanları, dozaj bilgileri vb..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={saveMedication}
                  disabled={!formData.name.trim() || formData.price <= 0 || loading}
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                      Kaydediliyor...
                    </>
                  ) : (
                    editingMedication ? '💾 İlacı Güncelle' : '💾 İlacı Kaydet'
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Device Form */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Device Name */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Cihaz Adı *
                  </label>
                  <input
                    type="text"
                    value={deviceFormData.name}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Tansiyon Aleti, EKG Cihazı"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                {/* Serial Number */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Seri Numarası
                  </label>
                  <input
                    type="text"
                    value={deviceFormData.serialNumber}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, serialNumber: e.target.value }))}
                    placeholder="Seri numarası"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                {/* Device Type */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Cihaz Tipi
                  </label>
                  <select
                    value={deviceFormData.deviceType}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, deviceType: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="" className="text-gray-900 bg-white">Seçiniz</option>
                    {DEVICE_TYPES.map(type => (
                      <option key={type} value={type} className="text-gray-900 bg-white">{type}</option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Kategori
                  </label>
                  <select
                    value={deviceFormData.category}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="" className="text-gray-900 bg-white">Seçiniz</option>
                    {DEVICE_CATEGORIES.map(category => (
                      <option key={category} value={category} className="text-gray-900 bg-white">{category}</option>
                    ))}
                  </select>
                </div>

                {/* Price */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Fiyat (TL) *
                  </label>
                  <input
                    type="number"
                    value={deviceFormData.price === 0 ? '' : deviceFormData.price}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, price: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                    placeholder="Örn: 1500.00"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                {/* Manufacturer */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Üretici Firma
                  </label>
                  <input
                    type="text"
                    value={deviceFormData.manufacturer}
                    onChange={(e) => setDeviceFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                    placeholder="Örn: Omron, Philips"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Açıklama
                </label>
                <textarea
                  value={deviceFormData.description}
                  onChange={(e) => setDeviceFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Bu cihazın kullanım alanları, özellikleri vb..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={saveDevice}
                  disabled={!deviceFormData.name.trim() || deviceFormData.price <= 0 || loading}
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                      Kaydediliyor...
                    </>
                  ) : (
                    editingDevice ? '💾 Cihazı Güncelle' : '💾 Cihazı Kaydet'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Sale Modal */}
      {isSaleModalOpen && selectedPatientForSale && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f37] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">💊 Reçete ve İlaç Satışı</h2>
                <p className="text-white/60">Hasta: {selectedPatientForSale.fullName}</p>
              </div>
              <button 
                onClick={() => setIsSaleModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <span className="text-2xl">✕</span>
              </button>
            </div>

            <div className="space-y-6">
              {/* Medicines List */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Reçete Edilen İlaçlar</h3>
                <div className="bg-white/5 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-white/60 text-sm">
                      <tr>
                        <th className="p-4">Tip</th>
                        <th className="p-4">İlaç Adı</th>
                        <th className="p-4">Dozaj</th>
                        <th className="p-4">Fiyat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {getPrescribedMedicines(selectedPatientForSale).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-white/50">
                            Bu protokolde ilaç tanımlanmamış.
                          </td>
                        </tr>
                      ) : (
                        getPrescribedMedicines(selectedPatientForSale).map((med, index) => {
                          // Find matching medication for price (optional)
                          const match = findMedicationByName(med.name);
                          const alreadyBought = isMedAlreadyPurchased(selectedPatientForSale, med.name);

                          return (
                            <tr key={index} className={`hover:bg-white/5 ${alreadyBought ? 'text-white/40' : 'text-white/80'}`}>
                              <td className="p-4 text-sm text-white/50">{med.type}</td>
                              <td className="p-4 font-medium">
                                <span className={alreadyBought ? 'line-through' : ''}>{match ? getMedicationDisplayName(match) : med.name}</span>
                                {alreadyBought && (
                                  <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full text-xs font-medium align-middle">✓ Alındı</span>
                                )}
                              </td>
                              <td className="p-4 text-sm">{med.dosage}</td>
                              <td className="p-4">
                                {alreadyBought ? '—' : (match ? `${match.price.toFixed(2)} TL` : '-')}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Summary & Actions */}
              <div className="flex justify-end items-center gap-6 pt-4 border-t border-white/10">
                <div className="text-right">
                   <p className="text-white/60 text-sm">Toplam Tutar</p>
                   <p className="text-2xl font-bold text-white">
                     {getPrescribedMedicines(selectedPatientForSale).reduce((total, med) => {
                       // Already-purchased meds aren't re-sold, so exclude them from the total.
                       if (isMedAlreadyPurchased(selectedPatientForSale, med.name)) return total;
                       const match = findMedicationByName(med.name);
                       return total + (match ? match.price : 0);
                     }, 0).toFixed(2)} TL
                   </p>
                </div>
                <button
                  onClick={() => {
                     const prescribed = getPrescribedMedicines(selectedPatientForSale);
                     const soldItems = prescribed.map(med => {
                        const match = findMedicationByName(med.name);
                        return {
                          name: match ? getMedicationDisplayName(match) : med.name,
                          dosage: med.dosage,
                          type: med.type,
                          medicationId: match?.id || null,
                          price: match?.price || 0
                        };
                     });

                     if (soldItems.length === 0) {
                       alert('Satışı yapılacak ilaç bulunamadı.');
                       return;
                     }

                     handleOpenPaymentModal(soldItems);
                  }}
                  className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-green-500/25 flex items-center gap-2"
                >
                  <span>💳 Satışı Tamamla</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedPatientForSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden shadow-2xl border border-gray-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">💳</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Eczane Ödeme</h3>
                    <p className="text-white/80 text-sm">{selectedPatientForSale.fullName} - TC: {selectedPatientForSale.tcNo}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsPaymentModalOpen(false);
                    setPendingSoldItems([]);
                    setSelectedMedicines([]);
                    setPharmacyPaymentAmount('');
                    setPharmacyPaymentMethod('nakit');
                    setPharmacyPaymentMethods([{ method: 'nakit', amount: 0 }]);
                    setIsPharmacyPartialPayment(false);
                    setPharmacyRemainingDebt('');
                    setPatientDebtHistory([]);
                    setSelectedDebts([]);
                    setShowExtraMedicinePicker(false);
                    setExtraMedicineSearch('');
                    setPharmacyNote('');
                  }}
                  className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Two Panel Layout */}
            <div className="flex flex-col lg:flex-row h-[calc(95vh-180px)]">
              {/* LEFT PANEL - Current Sale (Günlük) */}
              <div className="flex-1 border-r border-gray-200 overflow-y-auto">
                <div className="p-4 bg-blue-50 border-b border-blue-200">
                  <h4 className="font-bold text-blue-900 flex items-center gap-2">
                    <span className="text-xl">📋</span>
                    Günlük İşlem
                  </h4>
                  <p className="text-blue-600 text-sm">Bugünkü ilaç satışı</p>
                </div>

                <div className="p-4 space-y-4">
                  {/* Medicines being sold */}
                  {pendingSoldItems.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                        <span>💊</span>
                        Satılan İlaçlar
                        <span className="text-xs font-normal text-gray-500 ml-auto">
                          (Tıkla: Kaldır/Ekle)
                        </span>
                      </h5>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {pendingSoldItems.map((item, index) => {
                          const isSelected = selectedMedicines.includes(item.name);
                          const isExtra = item.type === 'extra';
                          return (
                            <div 
                              key={index} 
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-all duration-200 ${
                                isSelected 
                                  ? isExtra 
                                    ? 'bg-purple-50 border-purple-300 hover:bg-purple-100' 
                                    : 'bg-green-50 border-green-300 hover:bg-green-100' 
                                  : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-80'
                              }`}
                            >
                              <div 
                                onClick={() => handleMedicineToggle(item.name)}
                                className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold cursor-pointer ${
                                  isSelected 
                                    ? isExtra ? 'bg-purple-500 text-white' : 'bg-green-500 text-white' 
                                    : 'bg-gray-300 text-white'
                                }`}
                              >
                                {isSelected ? '✓' : '✕'}
                              </div>
                              <span
                                onClick={() => handleMedicineToggle(item.name)}
                                className={`flex-1 text-sm cursor-pointer ${isSelected ? 'text-gray-900' : 'text-gray-400 line-through'}`}
                              >
                                {item.name}
                                {isExtra && <span className="ml-1 text-xs text-purple-600">(Ek)</span>}
                              </span>
                              {/* Quantity controls */}
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleUpdateQuantity(index, -1)}
                                  className="w-5 h-5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded flex items-center justify-center text-xs font-bold transition-colors"
                                  title="Azalt"
                                >
                                  −
                                </button>
                                <span className="w-5 text-center text-xs font-bold text-gray-700">
                                  {item.quantity || 1}
                                </span>
                                <button
                                  onClick={() => handleUpdateQuantity(index, 1)}
                                  className="w-5 h-5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded flex items-center justify-center text-xs font-bold transition-colors"
                                  title="Artır"
                                >
                                  +
                                </button>
                              </div>
                              <span className={`text-sm font-bold ${isSelected ? isExtra ? 'text-purple-700' : 'text-green-700' : 'text-gray-400'}`}>
                                {item.price > 0 ? `${(item.price * (item.quantity || 1)).toFixed(2)} TL` : '-'}
                              </span>
                              {isExtra && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveExtraMedicine(index);
                                  }}
                                  className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded flex items-center justify-center text-xs transition-colors"
                                  title="Ek ilacı kaldır"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Current Sale Total */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between text-lg font-bold">
                          <span className="text-gray-700">Günlük Toplam:</span>
                          <span className="text-blue-600">
                            {pendingSoldItems
                              .filter(item => selectedMedicines.includes(item.name))
                              .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
                              .toFixed(2)} TL
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add Extra Medicine Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                        <span>➕</span>
                        Ek İlaç Ekle
                      </h5>
                      <button
                        type="button"
                        onClick={() => { setShowExtraMedicinePicker(p => !p); setPickerQuantities({}); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                          showExtraMedicinePicker
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {showExtraMedicinePicker ? '✕' : '+'}
                      </button>
                    </div>

                    {showExtraMedicinePicker && (
                      <div className="space-y-3">
                        {/* Search Input */}
                        <input
                          type="text"
                          value={extraMedicineSearch}
                          onChange={(e) => setExtraMedicineSearch(e.target.value)}
                          placeholder="İlaç adı ile ara..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                        />

                        {/* Medicines List */}
                        <div className="max-h-[200px] overflow-y-auto space-y-2">
                          {savedMedications
                            .filter(med => {
                              if (extraMedicineSearch === '') return true;
                              const q = extraMedicineSearch.toLowerCase();
                              return (
                                med.name.toLowerCase().includes(q) ||
                                med.category.toLowerCase().includes(q) ||
                                getMedicationDisplayName(med).toLowerCase().includes(q) ||
                                (med.protocolName || '').toLowerCase().includes(q) ||
                                (med.description || '').toLowerCase().includes(q)
                              );
                            })
                            .map((med) => {
                              const alreadyAdded = pendingSoldItems.find(item => item.medicationId === med.id);
                              const pickerQty = pickerQuantities[med.id!] || 1;
                              return (
                                <div
                                  key={med.id}
                                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all duration-200 ${
                                    alreadyAdded
                                      ? 'bg-green-50 border-green-300'
                                      : 'bg-gray-50 hover:bg-green-50 border-gray-200 hover:border-green-300'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-900 text-sm">{getMedicationDisplayName(med)}</span>
                                    <span className="text-xs text-gray-500 ml-2">({med.category})</span>
                                    {alreadyAdded && (
                                      <span className="ml-2 text-xs text-green-600 font-medium">
                                        (listede: {alreadyAdded.quantity || 1} adet)
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-green-700 font-bold text-sm shrink-0">{med.price.toFixed(2)} TL</span>
                                  {/* Quantity controls */}
                                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => setPickerQuantities(prev => ({ ...prev, [med.id!]: Math.max(1, (prev[med.id!] || 1) - 1) }))}
                                      className="w-6 h-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded flex items-center justify-center text-xs font-bold transition-colors"
                                    >
                                      −
                                    </button>
                                    <span className="w-6 text-center text-xs font-bold text-gray-800">{pickerQty}</span>
                                    <button
                                      onClick={() => setPickerQuantities(prev => ({ ...prev, [med.id!]: (prev[med.id!] || 1) + 1 }))}
                                      className="w-6 h-6 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded flex items-center justify-center text-xs font-bold transition-colors"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleAddExtraMedicine(med, pickerQty)}
                                    className="shrink-0 px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-bold transition-colors"
                                  >
                                    {alreadyAdded ? 'Ekle' : 'Ekle'}
                                  </button>
                                </div>
                              );
                            })
                          }
                          {savedMedications.filter(med => {
                            if (extraMedicineSearch === '') return true;
                            const q = extraMedicineSearch.toLowerCase();
                            return (
                              med.name.toLowerCase().includes(q) ||
                              med.category.toLowerCase().includes(q) ||
                              getMedicationDisplayName(med).toLowerCase().includes(q) ||
                              (med.protocolName || '').toLowerCase().includes(q) ||
                              (med.description || '').toLowerCase().includes(q)
                            );
                          }).length === 0 && (
                            <div className="text-center py-4 text-gray-500 text-sm">
                              {savedMedications.length === 0
                                ? 'Henüz ilaç tanımlanmamış. İlaçlar sekmesinden ilaç ekleyin.'
                                : 'Arama kriterine uygun ilaç bulunamadı.'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Amount */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💰 Ödeme Tutarı (TL)
                    </label>
                    <input
                      type="number"
                      value={pharmacyPaymentAmount}
                      onChange={(e) => {
                        const newAmount = e.target.value;
                        setPharmacyPaymentAmount(newAmount);
                        // Manuel giriş indirim durumunu geçersiz kılar
                        setPharmacyDiscountApplied(false);
                        // Otomatik olarak ödeme yöntemi tutarını güncelle
                        if (pharmacyPaymentMethods.length > 0) {
                          const numAmount = parseFloat(newAmount) || 0;
                          setPharmacyPaymentMethods([{
                            method: pharmacyPaymentMethods[0].method,
                            amount: numAmount
                          }]);
                        }
                      }}
                      className="w-full px-4 py-3 text-lg font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Discount marking */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <input
                        id="pharmacy_indirim_check"
                        type="checkbox"
                        checked={pharmacyDiscountCheck}
                        onChange={(e) => {
                          setPharmacyDiscountCheck(e.target.checked);
                          if (!e.target.checked) {
                            setPharmacyDiscountYuzdeEnabled(false);
                            setPharmacyDiscountTutarEnabled(false);
                          }
                        }}
                        className="mt-1 h-5 w-5 rounded border-green-300 text-green-600 focus:ring-green-500"
                      />
                      <label htmlFor="pharmacy_indirim_check" className="text-sm text-green-900">
                        <span className="font-semibold flex items-center gap-2">
                          <span className="text-lg">🏷️</span> İndirim uygula
                        </span>
                        <span className="block text-green-800/80">
                          Bu hasta için indirim işaretlenir ve ödeme tutarına uygulanabilir.
                        </span>
                      </label>
                    </div>

                    {pharmacyDiscountCheck && (
                      <div className="ml-8 space-y-3">
                        {/* İndirim türü — çoklu seçim: ikisi aynı anda aktif olabilir */}
                        <div>
                          <label className="block text-sm font-medium text-green-800 mb-2">İndirim Türü</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPharmacyDiscountYuzdeEnabled(v => !v)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                pharmacyDiscountYuzdeEnabled
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                              }`}
                            >
                              % Yüzde
                            </button>
                            <button
                              type="button"
                              onClick={() => setPharmacyDiscountTutarEnabled(v => !v)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                pharmacyDiscountTutarEnabled
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                              }`}
                            >
                              ₺ Tutar
                            </button>
                          </div>
                        </div>

                        {/* Yüzde input — sadece seçiliyken göster */}
                        {pharmacyDiscountYuzdeEnabled && (
                          <div>
                            <label className="block text-sm font-medium text-green-800 mb-2">İndirim Oranı (%)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={pharmacyDiscountRate}
                                onChange={(e) => setPharmacyDiscountRate(parseFloat(e.target.value) || 0)}
                                min="0"
                                max="100"
                                className="w-32 px-3 py-2 bg-white border border-green-300 rounded-lg text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="20"
                              />
                              <span className="text-sm text-green-700">%</span>
                            </div>
                          </div>
                        )}

                        {/* Tutar input — sadece seçiliyken göster */}
                        {pharmacyDiscountTutarEnabled && (
                          <div>
                            <label className="block text-sm font-medium text-green-800 mb-2">İndirim Tutarı (TL)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={pharmacyDiscountValue}
                                onChange={(e) => setPharmacyDiscountValue(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="w-32 px-3 py-2 bg-white border border-green-300 rounded-lg text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="100"
                              />
                              <span className="text-sm text-green-700">TL</span>
                            </div>
                          </div>
                        )}

                        {/* İndirim özeti */}
                        {(() => {
                          const { total, yuzde, tutar } = computePharmacyDiscount();
                          if (total <= 0) return null;
                          const bothActive = pharmacyDiscountYuzdeEnabled && pharmacyDiscountTutarEnabled;
                          return (
                            <div className="text-sm text-green-800 bg-white border border-green-200 rounded-lg px-3 py-2 space-y-0.5">
                              {bothActive && yuzde > 0 && (
                                <div>% Yüzde indirimi: <span className="font-semibold">{yuzde.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span></div>
                              )}
                              {bothActive && tutar > 0 && (
                                <div>₺ Tutar indirimi: <span className="font-semibold">{tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span></div>
                              )}
                              <div className={bothActive ? 'font-bold border-t border-green-200 pt-0.5 mt-0.5' : ''}>
                                Uygulanacak indirim: <span className="font-bold">{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={togglePharmacyDiscount}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                              pharmacyDiscountApplied
                                ? 'bg-white border border-green-400 text-green-700 hover:bg-green-50'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                          >
                            <span>{pharmacyDiscountApplied ? '↩️' : '🏷️'}</span>
                            {pharmacyDiscountApplied ? 'İndirimi geri al' : 'İndirimi tutara uygula'}
                          </button>
                        </div>
                        <p className="text-xs text-green-700/70">
                          Bu indirim yalnızca bu satışa uygulanır, hastaya kalıcı olarak kaydedilmez.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Multi Payment Method Selector */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <MultiPaymentMethodSelector
                      totalAmount={parseFloat(pharmacyPaymentAmount) || 0}
                      value={pharmacyPaymentMethods}
                      onChange={(methods) => {
                        setPharmacyPaymentMethods(methods);
                        // Keep backwards compatibility - set primary method
                        if (methods.length > 0) {
                          setPharmacyPaymentMethod(methods[0].method);
                        }
                      }}
                      disabled={loading}
                      showValidation={true}
                      allowedMethods={['nakit', 'kredi_karti', 'banka_karti', 'havale', 'cari']}
                    />
                  </div>

                  {/* Partial Payment Checkbox */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPharmacyPartialPayment}
                        onChange={(e) => {
                          setIsPharmacyPartialPayment(e.target.checked);
                          if (!e.target.checked) setPharmacyRemainingDebt('');
                        }}
                        className="w-5 h-5 rounded border-orange-300 text-orange-500 focus:ring-orange-400"
                      />
                      <span className="font-semibold text-orange-900">⚠️ Hasta tamamını ödemedi</span>
                    </label>
                    
                    {isPharmacyPartialPayment && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="number"
                          value={pharmacyRemainingDebt}
                          onChange={(e) => setPharmacyRemainingDebt(e.target.value)}
                          className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          placeholder="Kalan borç tutarı"
                          min="0"
                          step="0.01"
                        />
                        {pharmacyRemainingDebt && parseFloat(pharmacyRemainingDebt) > 0 && (
                          <p className="text-orange-700 text-sm font-medium">
                            🚨 {parseFloat(pharmacyRemainingDebt).toFixed(2)} TL borç kaydedilecek
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Optional Note */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📝 Not (Opsiyonel)
                    </label>
                    <textarea
                      value={pharmacyNote}
                      onChange={(e) => setPharmacyNote(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                      placeholder="Bu satış için eklemek istediğiniz notları yazın..."
                      rows={2}
                      maxLength={500}
                    />
                    {pharmacyNote && (
                      <p className="text-gray-500 text-xs mt-1 text-right">
                        {pharmacyNote.length}/500 karakter
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL - Debt History (Geçmiş) */}
              <div className="flex-1 bg-gradient-to-b from-red-50 to-orange-50 overflow-y-auto">
                <div className="p-4 bg-red-100 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-red-900 flex items-center gap-2">
                        <span className="text-xl">📜</span>
                        Geçmiş Borçlar
                      </h4>
                      <p className="text-red-600 text-sm">Önceki ödenmeyen işlemler</p>
                    </div>
                    {patientDebtHistory.length > 0 && (
                      <button
                        onClick={handleSelectAllDebts}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                      >
                        {selectedDebts.length === patientDebtHistory.length ? 'Hiçbirini Seçme' : 'HEPSİNİ SEÇ'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {loadingDebtHistory ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                      <span className="ml-3 text-red-600">Borç geçmişi yükleniyor...</span>
                    </div>
                  ) : patientDebtHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-3">✅</div>
                      <h5 className="font-semibold text-gray-700">Eczane Borcu Yok</h5>
                      <p className="text-gray-500 text-sm mt-1">Bu hastanın ödenmeyen eczane borcu bulunmuyor.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Debt Items */}
                      {patientDebtHistory.map((debt) => {
                        const isSelected = selectedDebts.includes(debt.id);
                        return (
                          <div
                            key={debt.id}
                            onClick={() => handleDebtToggle(debt.id)}
                            className={`rounded-xl p-4 border-2 cursor-pointer transition-all duration-200 ${
                              isSelected
                                ? 'bg-white border-green-400 shadow-lg'
                                : 'bg-white/60 border-gray-200 hover:border-red-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1 ${
                                isSelected ? 'bg-green-500 text-white' : 'bg-gray-300 text-white'
                              }`}>
                                {isSelected ? '✓' : ''}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-gray-500 text-xs">
                                    {debt.createdAt ? new Date(debt.createdAt).toLocaleDateString('tr-TR') : '-'}
                                  </span>
                                  <span className={`font-bold text-lg ${isSelected ? 'text-green-600' : 'text-red-600'}`}>
                                    {(debt.amount || 0).toFixed(2)} TL
                                  </span>
                                </div>
                                {/* Items in this debt */}
                                {debt.items && debt.items.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {debt.items.map((item: any, idx: number) => (
                                      <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                        {item.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {debt.reason && (
                                  <p className="text-gray-500 text-xs mt-1">{debt.reason}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Selected Debts Summary */}
                      {selectedDebts.length > 0 && (
                        <div className={`${debtsAddedToPayment ? 'bg-orange-100 border-orange-400' : 'bg-green-100 border-green-400'} border-2 rounded-xl p-4 mt-4`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`font-semibold ${debtsAddedToPayment ? 'text-orange-800' : 'text-green-800'}`}>
                              {debtsAddedToPayment ? 'Eklenen Borçlar:' : 'Seçilen Borçlar:'}
                            </span>
                            <span className={debtsAddedToPayment ? 'text-orange-600' : 'text-green-600'}>{selectedDebts.length} adet</span>
                          </div>
                          <div className="flex items-center justify-between text-xl font-bold">
                            <span className={debtsAddedToPayment ? 'text-orange-800' : 'text-green-800'}>Toplam:</span>
                            <span className={debtsAddedToPayment ? 'text-orange-600' : 'text-green-600'}>{calculateSelectedDebtTotal().toFixed(2)} TL</span>
                          </div>
                          <button
                            onClick={() => {
                              const currentAmount = parseFloat(pharmacyPaymentAmount) || 0;
                              const debtTotal = calculateSelectedDebtTotal();
                              if (debtsAddedToPayment) {
                                // Remove from payment
                                const nextAmount = Math.max(0, currentAmount - debtTotal);
                                setPharmacyPaymentAmount(nextAmount.toFixed(2));
                                setPharmacyPaymentMethods([{
                                  method: pharmacyPaymentMethods[0]?.method || 'nakit',
                                  amount: nextAmount,
                                }]);
                                setDebtsAddedToPayment(false);
                              } else {
                                // Add to payment
                                const nextAmount = currentAmount + debtTotal;
                                setPharmacyPaymentAmount(nextAmount.toFixed(2));
                                setPharmacyPaymentMethods([{
                                  method: pharmacyPaymentMethods[0]?.method || 'nakit',
                                  amount: nextAmount,
                                }]);
                                setDebtsAddedToPayment(true);
                              }
                              setPharmacyDiscountApplied(false);
                            }}
                            className={`w-full mt-3 px-4 py-2 ${
                              debtsAddedToPayment
                                ? 'bg-orange-500 hover:bg-orange-600'
                                : 'bg-green-600 hover:bg-green-700'
                            } text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2`}
                          >
                            {debtsAddedToPayment ? (
                              <>
                                <span>↩️</span>
                                Geri Al
                              </>
                            ) : (
                              <>
                                <span>➕</span>
                                Ödemeye Ekle
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Summary Bar */}
            <div className="border-t-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 p-4">
              <div className="flex items-center justify-between">
                {/* Grand Total Summary */}
                {(() => {
                  const appliedDiscount = pharmacyDiscountApplied ? computePharmacyDiscount().total : 0;
                  const gunluk = Math.max(0, pharmacyItemsBase() - appliedDiscount);
                  const gecmis = calculateSelectedDebtTotal();
                  return (
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Günlük</p>
                    <p className="font-bold text-blue-600 text-lg">
                      {gunluk.toFixed(2)} TL
                    </p>
                    {appliedDiscount > 0 && (
                      <p className="text-[11px] text-green-600 font-medium">🏷️ -{appliedDiscount.toFixed(2)} TL</p>
                    )}
                  </div>
                  <div className="text-2xl text-gray-300">+</div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Geçmiş Borç</p>
                    <p className="font-bold text-red-600 text-lg">
                      {gecmis.toFixed(2)} TL
                    </p>
                  </div>
                  <div className="text-2xl text-gray-300">=</div>
                  <div className="text-center bg-white px-4 py-2 rounded-xl border-2 border-green-400">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Toplam</p>
                    <p className="font-bold text-green-600 text-2xl">
                      {(gunluk + gecmis).toFixed(2)} TL
                    </p>
                  </div>
                </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setPendingSoldItems([]);
                      setSelectedMedicines([]);
                      setPharmacyPaymentAmount('');
                      setPharmacyPaymentMethod('nakit');
                      setPharmacyPaymentMethods([{ method: 'nakit', amount: 0 }]);
                      setIsPharmacyPartialPayment(false);
                      setPharmacyRemainingDebt('');
                      setPatientDebtHistory([]);
                      setSelectedDebts([]);
                      setDebtsAddedToPayment(false);
                    }}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 border border-gray-300 rounded-xl text-gray-700 font-medium transition-all duration-200"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleProcessPharmacyPayment}
                    disabled={loading || !pharmacyPaymentAmount || parseFloat(pharmacyPaymentAmount) < 0 || (selectedMedicines.length === 0 && selectedDebts.length === 0)}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-bold text-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-green-500/30"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        ✅ Ödemeyi Tamamla
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sale Detail Modal */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                    📋
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Satış Detayı</h2>
                    <p className="text-white/80">{selectedSaleDetail.fullName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSaleDetail(null)}
                  className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Patient Info */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Hasta Bilgileri</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Ad Soyad</p>
                    <p className="text-gray-800 font-medium">{selectedSaleDetail.fullName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">TC Kimlik No</p>
                    <p className="text-gray-800 font-medium">{selectedSaleDetail.tcNo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Telefon</p>
                    <p className="text-gray-800 font-medium">{selectedSaleDetail.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">E-posta</p>
                    <p className="text-gray-800 font-medium">{selectedSaleDetail.email || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Sale Info */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Satış Bilgileri</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Satış Tarihi</p>
                    <p className="text-gray-800 font-medium">
                      {selectedSaleDetail.pharmacySaleDate 
                        ? new Date(selectedSaleDetail.pharmacySaleDate).toLocaleDateString('tr-TR')
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Satış Saati</p>
                    <p className="text-gray-800 font-medium">
                      {selectedSaleDetail.pharmacySaleDate 
                        ? new Date(selectedSaleDetail.pharmacySaleDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Ödeme Yöntemi</p>
                    {selectedSaleDetail.pharmacyPaymentMethods && selectedSaleDetail.pharmacyPaymentMethods.length > 0 ? (
                      <div className="space-y-1">
                        {selectedSaleDetail.pharmacyPaymentMethods.map((pm: PaymentMethodEntry, idx: number) => (
                          <p key={idx} className="text-gray-800 font-medium text-sm">
                            {pm.method === 'nakit' ? '💵 Nakit' :
                             pm.method === 'kredi_karti' ? '💳 Kredi Kartı' :
                             pm.method === 'banka_karti' ? '💳 Banka Kartı' :
                             pm.method === 'havale' ? '🏦 Havale/EFT' :
                             pm.method === 'cari' ? '📋 Cari' : pm.method}: {pm.amount.toFixed(2)} TL
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-800 font-medium">
                        {selectedSaleDetail.pharmacyPaymentMethod === 'nakit' ? '💵 Nakit' :
                         selectedSaleDetail.pharmacyPaymentMethod === 'kredi_karti' ? '💳 Kredi Kartı' :
                         selectedSaleDetail.pharmacyPaymentMethod === 'banka_karti' ? '💳 Banka Kartı' :
                         selectedSaleDetail.pharmacyPaymentMethod === 'havale' ? '🏦 Havale/EFT' :
                         selectedSaleDetail.pharmacyPaymentMethod || '-'}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Toplam Tutar</p>
                    <p className="text-gray-800 font-bold text-lg">
                      {selectedSaleDetail.pharmacyPaymentAmount 
                        ? `${selectedSaleDetail.pharmacyPaymentAmount.toFixed(2)} TL`
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sold Items */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Satılan İlaçlar ({selectedSaleDetail.pharmacySoldItems?.length || 0})</h3>
                {selectedSaleDetail.pharmacySoldItems?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSaleDetail.pharmacySoldItems.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            💊
                          </div>
                          <div>
                            <p className="text-gray-800 font-medium">{item.name}</p>
                            {item.category && (
                              <p className="text-gray-400 text-xs">{item.category}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-800 font-bold">{item.price?.toFixed(2) || '0.00'} TL</p>
                          {item.quantity && item.quantity > 1 && (
                            <p className="text-gray-400 text-xs">x{item.quantity}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-4">İlaç bilgisi bulunamadı</p>
                )}
              </div>

              {/* Sale Note */}
              {selectedSaleDetail.pharmacyNote && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-2">
                    <span>📝</span>
                    Satış Notu
                  </h3>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{selectedSaleDetail.pharmacyNote}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Borçlular Modal */}
      {showDebtorsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#1a6bbf] to-[#1eb38a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                  💳
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Borçlu Hastalar</h2>
                  <p className="text-white/70 text-xs mt-0.5">Eksik ödeme yapan hastaların borçlarını yönetin</p>
                </div>
              </div>
              <button
                onClick={() => { setShowDebtorsModal(false); setSelectedDebtorForPayment(null); }}
                className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {loadingPharmacyDebts ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                  <p className="text-gray-500 mt-4">Borçlu hastalar yükleniyor...</p>
                </div>
              ) : patientsWithDebt.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Borçlu Hasta Yok</h3>
                  <p className="text-gray-500">Tüm ödemeler eksiksiz yapılmış.</p>
                </div>
              ) : (
                (() => {
                  // If opened for a specific patient, only show that patient
                  const patientsToShow = selectedDebtorForPayment
                    ? patientsWithDebt.filter(p => p.tcNo === selectedDebtorForPayment.tcNo)
                    : patientsWithDebt.sort((a, b) => b.totalDebt - a.totalDebt);
                  return patientsToShow.map((patient) => {
                      const debtType = getPatientDebtType(patient.debts);
                      const borderColor = debtType === 'direct_sale' ? 'border-teal-300' : debtType === 'mixed' ? 'border-orange-300' : 'border-purple-300';
                      const avatarGradient = debtType === 'direct_sale' ? 'from-teal-500 to-emerald-600' : debtType === 'mixed' ? 'from-orange-500 to-red-600' : 'from-purple-500 to-indigo-600';
                      const totalBg = debtType === 'direct_sale' ? 'bg-teal-600' : debtType === 'mixed' ? 'bg-orange-600' : 'bg-purple-600';
                      return (
                    <div
                      key={patient.tcNo}
                      className={`bg-white border ${borderColor} rounded-xl overflow-hidden shadow-sm`}
                    >
                      {/* Patient Row */}
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl text-white bg-gradient-to-br ${avatarGradient} shrink-0`}>
                            👤
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-gray-800 font-semibold text-lg">{patient.patientName}</h4>
                              <DebtTypeBadge debts={patient.debts} />
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                              <span>TC: {patient.tcNo}</span>
                              <span>{patient.debtCount} borç kaydı</span>
                              <span>Son: {new Date(patient.lastDebtDate).toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`${totalBg} rounded-lg px-4 py-2 text-white font-semibold text-right`}>
                            <div className="text-xs opacity-80">Toplam Borç</div>
                            <div className="text-lg">{patient.totalDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
                          </div>
                          <button
                            onClick={() => {
                              if (selectedDebtorForPayment?.tcNo === patient.tcNo) {
                                setSelectedDebtorForPayment(null);
                              } else {
                                setSelectedDebtorForPayment(patient);
                                setDebtorPaymentMethods([{ method: 'nakit', amount: patient.totalDebt }]);
                                // İndirim state'lerini sıfırla
                                setDebtorDiscountCheck(false);
                                setDebtorDiscountYuzdeEnabled(false);
                                setDebtorDiscountTutarEnabled(false);
                                setDebtorDiscountRate(20);
                                setDebtorDiscountValue(0);
                                setDebtorDiscountApplied(false);
                              }
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-medium transition-all text-sm shadow-md"
                          >
                            {selectedDebtorForPayment?.tcNo === patient.tcNo ? '▲ Kapat' : '💵 Ödeme Al'}
                          </button>
                        </div>
                      </div>

                      {/* Debt details */}
                      {patient.debts.length > 0 && (
                        <div className="px-5 pb-3">
                          <details className="cursor-pointer group">
                            <summary className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                              <span>Borç detayları</span>
                              <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                            </summary>
                            <div className="mt-2 space-y-1">
                              {patient.debts.map((debt: any, idx: number) => {
                                const isDirect = debt.debtSource === 'direct_sale' || debt.reason?.includes('Direkt');
                                return (
                                <div key={idx} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 gap-2 ${isDirect ? 'bg-teal-50 border border-teal-200' : 'bg-purple-50 border border-purple-200'}`}>
                                  <span className={isDirect ? 'text-teal-600' : 'text-purple-600'}>{isDirect ? '🛒' : '💊'}</span>
                                  <span className="text-gray-500 flex-1">{new Date(debt.createdAt).toLocaleDateString('tr-TR')}</span>
                                  <span className="text-gray-400 flex-1 text-center truncate">{isDirect ? 'Eczane Satışı' : 'Tedavi Hastası'}</span>
                                  <span className={`font-medium ${isDirect ? 'text-teal-700' : 'text-purple-700'}`}>{debt.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                </div>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                      )}

                      {/* Payment Form */}
                      {selectedDebtorForPayment?.tcNo === patient.tcNo && (
                        <div className="border-t border-gray-200 bg-blue-50/50 p-5 space-y-4">
                          <h5 className="text-gray-700 font-semibold text-sm">Ödeme Bilgileri</h5>

                          {/* İndirim bölümü */}
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <input
                                id={`debtor_indirim_check_${patient.tcNo}`}
                                type="checkbox"
                                checked={debtorDiscountCheck}
                                onChange={(e) => {
                                  setDebtorDiscountCheck(e.target.checked);
                                  if (!e.target.checked) {
                                    setDebtorDiscountYuzdeEnabled(false);
                                    setDebtorDiscountTutarEnabled(false);
                                    setDebtorDiscountApplied(false);
                                    setDebtorPaymentMethods([{ method: debtorPaymentMethods[0]?.method || 'nakit', amount: patient.totalDebt }]);
                                  }
                                }}
                                className="mt-1 h-5 w-5 rounded border-green-400 text-green-500 focus:ring-green-500"
                              />
                              <label htmlFor={`debtor_indirim_check_${patient.tcNo}`} className="text-sm text-green-800">
                                <span className="font-semibold flex items-center gap-2">
                                  <span>🏷️</span> İndirim uygula
                                </span>
                              </label>
                            </div>

                            {debtorDiscountCheck && (
                              <div className="ml-8 space-y-3">
                                {/* Tür seçimi */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDebtorDiscountYuzdeEnabled(v => !v);
                                      setDebtorDiscountApplied(false);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                      debtorDiscountYuzdeEnabled
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                                    }`}
                                  >
                                    % Yüzde
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDebtorDiscountTutarEnabled(v => !v);
                                      setDebtorDiscountApplied(false);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                      debtorDiscountTutarEnabled
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                                    }`}
                                  >
                                    ₺ Tutar
                                  </button>
                                </div>

                                {/* Yüzde input */}
                                {debtorDiscountYuzdeEnabled && (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs text-green-700 w-28">İndirim Oranı</label>
                                    <input
                                      type="number"
                                      value={debtorDiscountRate}
                                      onChange={(e) => {
                                        setDebtorDiscountRate(parseFloat(e.target.value) || 0);
                                        setDebtorDiscountApplied(false);
                                      }}
                                      min="0" max="100"
                                      className="w-24 px-3 py-1.5 bg-white border border-green-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                                      placeholder="20"
                                    />
                                    <span className="text-green-700 text-sm">%</span>
                                  </div>
                                )}

                                {/* Tutar input */}
                                {debtorDiscountTutarEnabled && (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs text-green-700 w-28">İndirim Tutarı</label>
                                    <input
                                      type="number"
                                      value={debtorDiscountValue}
                                      onChange={(e) => {
                                        setDebtorDiscountValue(parseFloat(e.target.value) || 0);
                                        setDebtorDiscountApplied(false);
                                      }}
                                      min="0" step="0.01"
                                      className="w-24 px-3 py-1.5 bg-white border border-green-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                                      placeholder="100"
                                    />
                                    <span className="text-green-700 text-sm">TL</span>
                                  </div>
                                )}

                                {/* Özet */}
                                {(() => {
                                  const { total, yuzde, tutar } = computeDebtorDiscount(patient.totalDebt);
                                  if (total <= 0) return null;
                                  const both = debtorDiscountYuzdeEnabled && debtorDiscountTutarEnabled;
                                  return (
                                    <div className="text-sm text-green-800 bg-white border border-green-200 rounded-lg px-3 py-2 space-y-0.5">
                                      {both && yuzde > 0 && <div>% Yüzde indirimi: <span className="font-semibold">{yuzde.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span></div>}
                                      {both && tutar > 0 && <div>₺ Tutar indirimi: <span className="font-semibold">{tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span></div>}
                                      <div className={both ? 'font-bold border-t border-green-200 pt-0.5' : ''}>
                                        Uygulanacak indirim: <span className="font-bold">{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                      </div>
                                      {debtorDiscountApplied && (
                                        <div className="text-green-600 text-xs">
                                          ✅ Ödenecek tutar: <span className="font-bold">{Math.max(0, patient.totalDebt - total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Uygula butonu */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (debtorDiscountApplied) {
                                      removeDebtorDiscountFromAmount(patient.totalDebt);
                                    } else {
                                      applyDebtorDiscountToAmount(patient.totalDebt);
                                    }
                                  }}
                                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                                    debtorDiscountApplied
                                      ? 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                                      : 'bg-green-500 hover:bg-green-600 text-white'
                                  }`}
                                >
                                  <span>{debtorDiscountApplied ? '↩️' : '🏷️'}</span>
                                  {debtorDiscountApplied ? 'İndirimi geri al' : 'İndirimi tutara uygula'}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                            <MultiPaymentMethodSelector
                              value={debtorPaymentMethods}
                              onChange={setDebtorPaymentMethods}
                              totalAmount={debtorDiscountApplied
                                ? Math.max(0, patient.totalDebt - computeDebtorDiscount(patient.totalDebt).total)
                                : patient.totalDebt}
                            />
                          </div>

                          {/* Remaining info */}
                          {(() => {
                            const paid = debtorPaymentMethods.reduce((s, m) => s + (m.amount || 0), 0);
                            const appliedDiscount = debtorDiscountApplied ? computeDebtorDiscount(patient.totalDebt).total : 0;
                            const effectiveDebt = Math.max(0, patient.totalDebt - appliedDiscount);
                            const remaining = Math.max(0, effectiveDebt - paid);
                            return (
                              <div className="flex items-center justify-between text-sm">
                                <span>
                                  {remaining > 0
                                    ? <span className="text-orange-600 font-medium">⚠️ {remaining.toFixed(2)} TL kalan borç kaydedilecek</span>
                                    : <span className="text-green-600 font-medium">✅ Borç tamamen ödeniyor</span>
                                  }
                                </span>
                                <button
                                  onClick={handleDebtorPayment}
                                  disabled={debtorPaymentLoading || debtorPaymentMethods.reduce((s, m) => s + (m.amount || 0), 0) <= 0}
                                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all shadow-md flex items-center gap-2"
                                >
                                  {debtorPaymentLoading
                                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> İşleniyor...</>
                                    : <>✅ Ödemeyi Kaydet</>
                                  }
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                  });
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 flex justify-end bg-white">
              <button
                onClick={() => { setShowDebtorsModal(false); setSelectedDebtorForPayment(null); }}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-900 font-medium transition-all"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pharmacy;