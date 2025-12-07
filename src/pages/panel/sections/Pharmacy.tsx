import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, deleteDoc, doc, where, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { utils, writeFile } from 'xlsx';

interface Medication {
  id?: string;
  name: string;
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
  // Debt tracking fields
  hasDebt?: boolean;
  debtAmount?: number;
  debtDate?: string;
  debtReason?: string;
}

const Pharmacy: React.FC<{ doctorProfile: DoctorProfile | null }> = ({ doctorProfile }) => {
  const [activeTab, setActiveTab] = useState<'medications' | 'devices' | 'patients' | 'sales_history'>('medications');
  const [savedMedications, setSavedMedications] = useState<SavedMedication[]>([]);
  const [savedDevices, setSavedDevices] = useState<SavedMedicalDevice[]>([]);
  const [waitingPatients, setWaitingPatients] = useState<PharmacyPatient[]>([]);
  const [completedSales, setCompletedSales] = useState<any[]>([]);
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
  const [pendingSoldItems, setPendingSoldItems] = useState<any[]>([]);
  const [selectedMedicines, setSelectedMedicines] = useState<string[]>([]);
  const [isPharmacyPartialPayment, setIsPharmacyPartialPayment] = useState<boolean>(false);
  const [pharmacyRemainingDebt, setPharmacyRemainingDebt] = useState<string>('');
  // Debt history panel states
  const [patientDebtHistory, setPatientDebtHistory] = useState<any[]>([]);
  const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
  const [loadingDebtHistory, setLoadingDebtHistory] = useState(false);
  // Sale detail modal state
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null);
  const [formData, setFormData] = useState<Medication>({
    name: '',
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

  const fetchCompletedSales = async () => {
    if (!doctorProfile?.clinicId) return;
    try {
      const patientsRef = collection(db, 'patients');
      const salesQuery = query(
        patientsRef,
        where('clinicId', '==', doctorProfile.clinicId),
        where('pharmacyStatus', '==', 'completed')
      );
      
      const salesSnapshot = await getDocs(salesQuery);
      const sales: any[] = [];
      
      salesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.pharmacySaleDate) {
          sales.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      // Sort by sale date, most recent first
      sales.sort((a, b) => new Date(b.pharmacySaleDate || b.pharmacySaleCompletedAt).getTime() - new Date(a.pharmacySaleDate || a.pharmacySaleCompletedAt).getTime());
      setCompletedSales(sales.slice(0, 50)); // Limit to last 50 sales
    } catch (error) {
      console.error('Error fetching completed sales:', error);
    }
  };

  // Excel export function for sales history
  const exportSalesHistoryToExcel = () => {
    if (completedSales.length === 0) {
      alert('Dışa aktarılacak satış kaydı bulunmamaktadır.');
      return;
    }

    const workbook = utils.book_new();
    
    // Özet sayfası
    const totalRevenue = completedSales.reduce((sum, sale) => sum + (sale.pharmacyPaymentAmount || 0), 0);
    const summaryData = [
      ['ECZANE SATIŞ RAPORU - ÖZET'],
      [''],
      ['Rapor Tarihi', new Date().toLocaleDateString('tr-TR')],
      [''],
      ['İSTATİSTİKLER'],
      ['Toplam Satış Adedi', completedSales.length],
      ['Toplam Gelir', `${totalRevenue.toLocaleString('tr-TR')} TL`],
      ['Ortalama Satış Tutarı', `${(totalRevenue / completedSales.length).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`]
    ];
    const summarySheet = utils.aoa_to_sheet(summaryData);
    utils.book_append_sheet(workbook, summarySheet, 'Özet');

    // Satış Detayları sayfası
    const salesData = completedSales.map(sale => ({
      'Hasta Adı': sale.fullName || '-',
      'TC No': sale.tcNo || '-',
      'Satış Tarihi': sale.pharmacySaleDate 
        ? new Date(sale.pharmacySaleDate).toLocaleDateString('tr-TR') + ' ' + 
          new Date(sale.pharmacySaleDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : '-',
      'Satılan Ürünler': sale.pharmacySoldItems?.map((item: any) => `${item.name} (${item.quantity})`).join(', ') || '-',
      'Ürün Sayısı': sale.pharmacySoldItems?.length || 0,
      'Ödeme Tutarı': sale.pharmacyPaymentAmount || 0,
      'Ödeme Yöntemi': sale.pharmacyPaymentMethod === 'nakit' ? 'Nakit' : 
                       sale.pharmacyPaymentMethod === 'kartkredi' ? 'Kredi Kartı' :
                       sale.pharmacyPaymentMethod === 'kartdebit' ? 'Banka Kartı' :
                       sale.pharmacyPaymentMethod === 'kredi_karti' ? 'Kredi Kartı' :
                       sale.pharmacyPaymentMethod === 'banka_karti' ? 'Banka Kartı' :
                       sale.pharmacyPaymentMethod === 'havale' ? 'Havale/EFT' :
                       sale.pharmacyPaymentMethod === 'cari' ? 'Cari' :
                       sale.pharmacyPaymentMethod || '-',
      'Borç Durumu': sale.hasDebt && sale.debtAmount ? `${sale.debtAmount.toLocaleString('tr-TR')} TL` : 'Yok'
    }));
    const salesSheet = utils.json_to_sheet(salesData);
    utils.book_append_sheet(workbook, salesSheet, 'Satış Detayları');

    // Ürün Bazlı Analiz sayfası
    const productStats: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
    completedSales.forEach(sale => {
      sale.pharmacySoldItems?.forEach((item: any) => {
        if (!productStats[item.name]) {
          productStats[item.name] = { name: item.name, quantity: 0, revenue: 0 };
        }
        productStats[item.name].quantity += item.quantity || 1;
        productStats[item.name].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    
    const productData = Object.values(productStats)
      .sort((a, b) => b.quantity - a.quantity)
      .map(p => ({
        'Ürün Adı': p.name,
        'Toplam Satış Adedi': p.quantity,
        'Toplam Gelir': `${p.revenue.toLocaleString('tr-TR')} TL`
      }));
    
    if (productData.length > 0) {
      const productSheet = utils.json_to_sheet(productData);
      utils.book_append_sheet(workbook, productSheet, 'Ürün Analizi');
    }

    // Excel dosyasını indir
    const fileName = `Eczane_Satis_Raporu_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.xlsx`;
    writeFile(workbook, fileName);
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
      
      // Also check for legacy debt stored directly on patient document
      // If patient has debt but no records in pharmacy_debts, create a virtual record
      if (patient.hasDebt && patient.debtAmount && patient.debtAmount > 0 && debts.length === 0) {
        debts.push({
          id: `legacy_${patient.id}`,
          patientId: patient.id,
          patientTcNo: patient.tcNo,
          patientName: patient.fullName,
          amount: patient.debtAmount,
          reason: patient.debtReason || 'Önceki borç',
          isPaid: false,
          createdAt: patient.debtDate || new Date().toISOString(),
          isLegacy: true // Mark as legacy debt
        });
      }
      
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

  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchMedications();
      fetchDevices();
      fetchPatients();
      fetchCompletedSales();
    }
  }, [doctorProfile?.clinicId]);

  const getPrescribedMedicines = (patient: PharmacyPatient) => {
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

  const handleOpenSaleModal = (patient: PharmacyPatient) => {
    setSelectedPatientForSale(patient);
    setIsSaleModalOpen(true);
  };

  // Open payment modal when clicking "Satışı Tamamla"
  const handleOpenPaymentModal = (soldItems: any[]) => {
    setPendingSoldItems(soldItems);
    // Initialize all medicines as selected
    setSelectedMedicines(soldItems.map(item => item.name));
    // Calculate total from sold items
    const total = soldItems.reduce((sum, item) => sum + (item.price || 0), 0);
    setPharmacyPaymentAmount(total.toFixed(2));
    // Reset debt selection
    setSelectedDebts([]);
    // Fetch patient debt history when modal opens
    if (selectedPatientForSale) {
      fetchPatientDebtHistory(selectedPatientForSale);
    }
    setIsPaymentModalOpen(true);
  };

  // Recalculate total when selection changes
  const recalculatePharmacyTotal = (selected: string[]) => {
    const total = pendingSoldItems
      .filter(item => selected.includes(item.name))
      .reduce((sum, item) => sum + (item.price || 0), 0);
    setPharmacyPaymentAmount(total.toFixed(2));
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
          
          // Check if this is a legacy debt (stored directly on patient, not in pharmacy_debts)
          if (debtRecord?.isLegacy) {
            // Legacy debts will be cleared when we update patient record below
            console.log('Paying legacy debt:', debtId, debtRecord.amount);
          } else {
            // Regular debt in pharmacy_debts collection
            const debtRef = doc(db, 'pharmacy_debts', debtId);
            batch.update(debtRef, {
              isPaid: true,
              paidAt: new Date().toISOString(),
              paidAmount: debtRecord?.amount || 0,
              paymentMethod: pharmacyPaymentMethod
            });
          }
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
        pharmacySoldItems: approvedMedicines,
        pharmacyRemovedItems: removedMedicines,
        pharmacyPaymentAmount: totalPaymentReceived,
        pharmacyPaymentMethod: pharmacyPaymentMethod,
        pharmacyPaymentDate: new Date().toISOString(),
        // Record what debts were paid in this transaction
        lastDebtPayment: selectedDebts.length > 0 ? {
          paidDebts: selectedDebts,
          paidAmount: selectedDebtTotal,
          paidAt: new Date().toISOString()
        } : null
      };
      
      // Update patient debt status
      if (totalRemainingDebt > 0) {
        updateData.hasDebt = true;
        updateData.debtAmount = Math.round(totalRemainingDebt * 100) / 100;
        updateData.debtDate = new Date().toISOString();
        if (newDebtAmount > 0) {
          updateData.debtReason = `Eczane borcu: ${newDebtAmount.toFixed(2)} TL`;
        }
      } else {
        // All debts are paid off
        updateData.hasDebt = false;
        updateData.debtAmount = 0;
        updateData.debtReason = '';
        updateData.debtDate = null;
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
      setIsPharmacyPartialPayment(false);
      setPharmacyRemainingDebt('');
      setPatientDebtHistory([]);
      setSelectedDebts([]);
      
      fetchPatients();
      fetchCompletedSales();

    } catch (error) {
      console.error('Error completing sale:', error);
      alert('Satış işlemi sırasında bir hata oluştu.');
    } finally {
      setLoading(false);
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
      const matchesSearch = med.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           med.barcode.includes(searchTerm) ||
                           (med.manufacturer && med.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()));
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

  // Get low stock medications
  const lowStockMedications = savedMedications.filter(
    med => med.stockQuantity <= med.minStockLevel
  );

  // Get expired or soon-to-expire medications
  const expiredMedications = savedMedications.filter(
    med => med.expiryDate && new Date(med.expiryDate) < new Date()
  );

  const soonToExpireMedications = savedMedications.filter(
    med => med.expiryDate && 
           new Date(med.expiryDate) >= new Date() && 
           new Date(med.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  );

  // Get low stock devices
  const lowStockDevices = savedDevices.filter(
    dev => dev.stockQuantity <= dev.minStockLevel
  );

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
              setActiveTab('sales_history');
              setShowAddForm(false);
              setSearchTerm('');
              setFilterCategory('all');
              fetchCompletedSales();
            }}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'sales_history'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📋 Satış Geçmişi
          </button>
        </div>
      </div>

      {!showAddForm ? (
        <>
          {/* Stats Overview */}
          {activeTab === 'medications' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-2xl p-4">
                <div className="text-blue-300 text-2xl mb-1">💊</div>
                <div className="text-white text-2xl font-bold">{savedMedications.length}</div>
                <div className="text-white/70 text-sm">Toplam İlaç</div>
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
          ) : null}

          {/* Action Buttons and Filters */}
          {activeTab !== 'patients' && activeTab !== 'sales_history' && (
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
                          medication.stockQuantity <= medication.minStockLevel 
                            ? 'border-yellow-500/50 bg-yellow-500/10' 
                            : medication.expiryDate && new Date(medication.expiryDate) < new Date()
                              ? 'border-red-500/50 bg-red-500/10'
                              : 'border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-semibold text-white">{medication.name}</h4>
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
                            device.stockQuantity <= device.minStockLevel 
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
                          patient.hasDebt && patient.debtAmount && patient.debtAmount > 0
                            ? 'border-red-400/50 bg-red-500/10'
                            : 'border-white/20'
                        }`}
                      >
                        {/* Debt Warning Badge */}
                        {patient.hasDebt && patient.debtAmount && patient.debtAmount > 0 && (
                          <div className="mb-3 p-2 bg-red-500/20 border border-red-400/30 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">⚠️</span>
                              <div>
                                <p className="text-red-200 text-xs font-bold">BORÇLU HASTA</p>
                                <p className="text-red-100 text-sm font-medium">
                                  {patient.debtAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl text-white ${
                            patient.hasDebt && patient.debtAmount && patient.debtAmount > 0
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

          {/* Sales History */}
          {activeTab === 'sales_history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  📋 Satış Geçmişi ({completedSales.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportSalesHistoryToExcel}
                    disabled={completedSales.length === 0}
                    className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-green-500/25"
                  >
                    📥 Raporu İndir
                  </button>
                  <button
                    onClick={fetchCompletedSales}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white/80 hover:text-white transition-all duration-200 flex items-center gap-2"
                  >
                    🔄 Yenile
                  </button>
                </div>
              </div>

              {completedSales.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Satış Kaydı Yok
                  </h3>
                  <p className="text-white/60">
                    Henüz tamamlanmış satış bulunmamaktadır.
                  </p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/20 rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-white/10">
                      <tr>
                        <th className="px-6 py-4 text-left text-white/80 font-medium">Hasta</th>
                        <th className="px-6 py-4 text-left text-white/80 font-medium">Satış Tarihi</th>
                        <th className="px-6 py-4 text-left text-white/80 font-medium">İlaçlar</th>
                        <th className="px-6 py-4 text-left text-white/80 font-medium">Ödeme Yöntemi</th>
                        <th className="px-6 py-4 text-right text-white/80 font-medium">Tutar</th>
                        <th className="px-6 py-4 text-center text-white/80 font-medium">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {completedSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white">
                                👤
                              </div>
                              <div>
                                <p className="text-white font-medium">{sale.fullName}</p>
                                <p className="text-white/50 text-sm">TC: {sale.tcNo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-white">
                              {sale.pharmacySaleDate 
                                ? new Date(sale.pharmacySaleDate).toLocaleDateString('tr-TR')
                                : '-'
                              }
                            </p>
                            <p className="text-white/50 text-sm">
                              {sale.pharmacySaleDate 
                                ? new Date(sale.pharmacySaleDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                                : ''
                              }
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {sale.pharmacySoldItems?.slice(0, 3).map((item: any, idx: number) => (
                                <span 
                                  key={idx} 
                                  className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full"
                                >
                                  {item.name}
                                </span>
                              ))}
                              {sale.pharmacySoldItems?.length > 3 && (
                                <span className="px-2 py-1 bg-white/10 text-white/60 text-xs rounded-full">
                                  +{sale.pharmacySoldItems.length - 3} daha
                                </span>
                              )}
                              {!sale.pharmacySoldItems?.length && (
                                <span className="text-white/50 text-sm">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                              sale.pharmacyPaymentMethod === 'nakit' 
                                ? 'bg-green-500/20 text-green-300'
                                : sale.pharmacyPaymentMethod === 'kredi_karti'
                                ? 'bg-blue-500/20 text-blue-300'
                                : sale.pharmacyPaymentMethod === 'banka_karti'
                                ? 'bg-purple-500/20 text-purple-300'
                                : sale.pharmacyPaymentMethod === 'cari'
                                ? 'bg-orange-500/20 text-orange-300'
                                : 'bg-yellow-500/20 text-yellow-300'
                            }`}>
                              {sale.pharmacyPaymentMethod === 'nakit' ? '💵 Nakit' :
                               sale.pharmacyPaymentMethod === 'kredi_karti' ? '💳 Kredi Kartı' :
                               sale.pharmacyPaymentMethod === 'banka_karti' ? '💳 Banka Kartı' :
                               sale.pharmacyPaymentMethod === 'havale' ? '🏦 Havale/EFT' :
                               sale.pharmacyPaymentMethod === 'cari' ? '📋 Cari' :
                               sale.pharmacyPaymentMethod || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-white font-bold text-lg">
                              {sale.pharmacyPaymentAmount 
                                ? `${sale.pharmacyPaymentAmount.toFixed(2)} TL`
                                : '-'
                              }
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setSelectedSaleDetail(sale)}
                              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 rounded-lg transition-all duration-200 flex items-center gap-2 mx-auto"
                            >
                              🔍 Detay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sales Summary */}
              {completedSales.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-gradient-to-r from-green-500/20 to-emerald-600/20 border border-green-500/30 rounded-2xl p-4">
                    <div className="text-green-300 text-2xl mb-1">💰</div>
                    <div className="text-white text-2xl font-bold">
                      {completedSales.reduce((sum, sale) => sum + (sale.pharmacyPaymentAmount || 0), 0).toFixed(2)} TL
                    </div>
                    <div className="text-white/70 text-sm">Toplam Satış</div>
                  </div>
                  <div className="bg-gradient-to-r from-blue-500/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl p-4">
                    <div className="text-blue-300 text-2xl mb-1">📦</div>
                    <div className="text-white text-2xl font-bold">
                      {completedSales.length}
                    </div>
                    <div className="text-white/70 text-sm">Toplam İşlem</div>
                  </div>
                  <div className="bg-gradient-to-r from-purple-500/20 to-pink-600/20 border border-purple-500/30 rounded-2xl p-4">
                    <div className="text-purple-300 text-2xl mb-1">💊</div>
                    <div className="text-white text-2xl font-bold">
                      {completedSales.reduce((sum, sale) => sum + (sale.pharmacySoldItems?.length || 0), 0)}
                    </div>
                    <div className="text-white/70 text-sm">Satılan İlaç</div>
                  </div>
                </div>
              )}
            </div>
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
                {/* Medication Name */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    İlaç Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Parol, Dolorex"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
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
                          const match = savedMedications.find(sm => 
                            sm.name.toLowerCase().includes(med.name.toLowerCase()) || 
                            med.name.toLowerCase().includes(sm.name.toLowerCase())
                          );
                          
                          return (
                            <tr key={index} className="text-white/80 hover:bg-white/5">
                              <td className="p-4 text-sm text-white/50">{med.type}</td>
                              <td className="p-4 font-medium">{med.name}</td>
                              <td className="p-4 text-sm">{med.dosage}</td>
                              <td className="p-4">
                                {match ? `${match.price.toFixed(2)} TL` : '-'}
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
                       const match = savedMedications.find(sm => 
                          sm.name.toLowerCase().includes(med.name.toLowerCase()) || 
                          med.name.toLowerCase().includes(sm.name.toLowerCase())
                       );
                       return total + (match ? match.price : 0);
                     }, 0).toFixed(2)} TL
                   </p>
                </div>
                <button
                  onClick={() => {
                     const prescribed = getPrescribedMedicines(selectedPatientForSale);
                     const soldItems = prescribed.map(med => {
                        const match = savedMedications.find(sm => 
                          sm.name.toLowerCase().includes(med.name.toLowerCase()) || 
                          med.name.toLowerCase().includes(sm.name.toLowerCase())
                        );
                        return {
                          name: med.name,
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
                    setIsPharmacyPartialPayment(false);
                    setPharmacyRemainingDebt('');
                    setPatientDebtHistory([]);
                    setSelectedDebts([]);
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
                          return (
                            <div 
                              key={index} 
                              onClick={() => handleMedicineToggle(item.name)}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer transition-all duration-200 ${
                                isSelected 
                                  ? 'bg-green-50 border-green-300 hover:bg-green-100' 
                                  : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-80'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                                isSelected ? 'bg-green-500 text-white' : 'bg-gray-300 text-white'
                              }`}>
                                {isSelected ? '✓' : '✕'}
                              </div>
                              <span className={`flex-1 text-sm ${isSelected ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                                {item.name}
                              </span>
                              <span className={`text-sm font-bold ${isSelected ? 'text-green-700' : 'text-gray-400'}`}>
                                {item.price > 0 ? `${item.price.toFixed(2)} TL` : '-'}
                              </span>
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
                              .reduce((sum, item) => sum + (item.price || 0), 0)
                              .toFixed(2)} TL
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Amount */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💰 Ödeme Tutarı (TL)
                    </label>
                    <input
                      type="number"
                      value={pharmacyPaymentAmount}
                      onChange={(e) => setPharmacyPaymentAmount(e.target.value)}
                      className="w-full px-4 py-3 text-lg font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      💳 Ödeme Yöntemi
                    </label>
                    <select
                      value={pharmacyPaymentMethod}
                      onChange={(e) => setPharmacyPaymentMethod(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="nakit">💵 Nakit</option>
                      <option value="kredi_karti">💳 Kredi Kartı</option>
                      <option value="banka_karti">💳 Banka Kartı</option>
                      <option value="havale">🏦 Havale/EFT</option>
                      <option value="cari">📋 Cari</option>
                    </select>
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
                      <h5 className="font-semibold text-gray-700">Geçmiş Borç Yok</h5>
                      <p className="text-gray-500 text-sm mt-1">Bu hastanın ödenmeyen eski işlemi bulunmuyor.</p>
                      
                      {/* Show current debt if exists */}
                      {selectedPatientForSale.hasDebt && selectedPatientForSale.debtAmount && selectedPatientForSale.debtAmount > 0 && (
                        <div className="mt-6 bg-red-100 border-2 border-red-300 rounded-xl p-4 text-left">
                          <h5 className="font-bold text-red-900 flex items-center gap-2 mb-2">
                            <span>🚨</span> Mevcut Borç Kaydı
                          </h5>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-red-700">Borç Tutarı:</span>
                              <span className="font-bold text-red-900 text-xl">
                                {selectedPatientForSale.debtAmount.toFixed(2)} TL
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-red-600">Tarih:</span>
                              <span className="text-red-800">
                                {selectedPatientForSale.debtDate 
                                  ? new Date(selectedPatientForSale.debtDate).toLocaleDateString('tr-TR')
                                  : '-'}
                              </span>
                            </div>
                            {selectedPatientForSale.debtReason && (
                              <p className="text-red-600 text-sm pt-2 border-t border-red-200">
                                Sebep: {selectedPatientForSale.debtReason}
                              </p>
                            )}
                          </div>
                          
                          {/* Quick add to payment */}
                          <button
                            onClick={() => {
                              const currentAmount = parseFloat(pharmacyPaymentAmount) || 0;
                              const debtAmount = selectedPatientForSale.debtAmount || 0;
                              setPharmacyPaymentAmount((currentAmount + debtAmount).toFixed(2));
                            }}
                            className="w-full mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <span>➕</span>
                            Ödemeye Ekle ({selectedPatientForSale.debtAmount.toFixed(2)} TL)
                          </button>
                        </div>
                      )}
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
                        <div className="bg-green-100 border-2 border-green-400 rounded-xl p-4 mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-green-800">Seçilen Borçlar:</span>
                            <span className="text-green-600">{selectedDebts.length} adet</span>
                          </div>
                          <div className="flex items-center justify-between text-xl font-bold">
                            <span className="text-green-800">Toplam:</span>
                            <span className="text-green-600">{calculateSelectedDebtTotal().toFixed(2)} TL</span>
                          </div>
                          <button
                            onClick={() => {
                              const currentAmount = parseFloat(pharmacyPaymentAmount) || 0;
                              const debtTotal = calculateSelectedDebtTotal();
                              setPharmacyPaymentAmount((currentAmount + debtTotal).toFixed(2));
                            }}
                            className="w-full mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <span>➕</span>
                            Ödemeye Ekle
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
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Günlük</p>
                    <p className="font-bold text-blue-600 text-lg">
                      {pendingSoldItems
                        .filter(item => selectedMedicines.includes(item.name))
                        .reduce((sum, item) => sum + (item.price || 0), 0)
                        .toFixed(2)} TL
                    </p>
                  </div>
                  <div className="text-2xl text-gray-300">+</div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Geçmiş Borç</p>
                    <p className="font-bold text-red-600 text-lg">
                      {calculateSelectedDebtTotal().toFixed(2)} TL
                    </p>
                  </div>
                  <div className="text-2xl text-gray-300">=</div>
                  <div className="text-center bg-white px-4 py-2 rounded-xl border-2 border-green-400">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Toplam</p>
                    <p className="font-bold text-green-600 text-2xl">
                      {(pendingSoldItems
                        .filter(item => selectedMedicines.includes(item.name))
                        .reduce((sum, item) => sum + (item.price || 0), 0) + calculateSelectedDebtTotal()
                      ).toFixed(2)} TL
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setPendingSoldItems([]);
                      setSelectedMedicines([]);
                      setPharmacyPaymentAmount('');
                      setPharmacyPaymentMethod('nakit');
                      setIsPharmacyPartialPayment(false);
                      setPharmacyRemainingDebt('');
                      setPatientDebtHistory([]);
                      setSelectedDebts([]);
                    }}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 border border-gray-300 rounded-xl text-gray-700 font-medium transition-all duration-200"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleProcessPharmacyPayment}
                    disabled={loading || !pharmacyPaymentAmount || parseFloat(pharmacyPaymentAmount) < 0 || selectedMedicines.length === 0}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-bold text-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-green-500/30"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        💰 KASA
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
                    <p className="text-gray-800 font-medium">
                      {selectedSaleDetail.pharmacyPaymentMethod === 'nakit' ? '💵 Nakit' :
                       selectedSaleDetail.pharmacyPaymentMethod === 'kredi_karti' ? '💳 Kredi Kartı' :
                       selectedSaleDetail.pharmacyPaymentMethod === 'banka_karti' ? '💳 Banka Kartı' :
                       selectedSaleDetail.pharmacyPaymentMethod === 'havale' ? '🏦 Havale/EFT' :
                       selectedSaleDetail.pharmacyPaymentMethod || '-'}
                    </p>
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
    </div>
  );
};

export default Pharmacy;