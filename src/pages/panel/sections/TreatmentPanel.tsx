import React, { useState, useEffect } from 'react';
import { collection, query, where, updateDoc, doc, onSnapshot, getDocs, addDoc, getDoc, increment } from 'firebase/firestore';
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
  additionalTreatmentPending?: boolean;
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
  routineAnamnezRequired?: boolean;
  routineAnamnezTemplates?: string[];
  activeAppointments?: ActiveAppointmentSession[];
}

interface ActiveAppointmentSession {
  sessionId: string;
  sessionType?: string;
  treatmentOptions?: {
    protocolName?: string;
    selectedMainApplications?: string[];
  };
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  paymentCompleted?: boolean;
  approvedApplications?: string[];
  removedApplications?: string[];
  includeMuayene?: boolean;
  routineAnamnezRequired?: boolean;
  routineAnamnezTemplates?: string[];
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  addedAt: string;
}

interface TreatmentSession extends TreatmentPatient {
  _sessionId?: string;
  _sessionType?: string;
}

interface TreatmentStats {
  totalPendingTreatments: number;
  todayTreatments: number;
  completedTreatments: number;
  inProgressTreatments: number;
}

interface KatDepoUrun {
  id: string;
  productName: string;
  stockCode: string;
  quantity: number;
  clinicId: string;
}

interface SelectedMaterial {
  productId: string;
  productName: string;
  stockCode: string;
  quantity: number;
}

const TreatmentPanel: React.FC<TreatmentPanelProps> = ({ doctorProfile }) => {
  const userRole = doctorProfile?.role || doctorProfile?.userType || '';
  const canApplyTreatment = userRole === 'admin' || userRole === 'bashemshire';

  const [stats, setStats] = useState<TreatmentStats>({
    totalPendingTreatments: 0,
    todayTreatments: 0,
    completedTreatments: 0,
    inProgressTreatments: 0
  });
  const [pendingTreatmentPatients, setPendingTreatmentPatients] = useState<TreatmentSession[]>([]);
  const [completedTreatmentPatients, setCompletedTreatmentPatients] = useState<TreatmentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListType, setActiveListType] = useState<'pending_treatment' | 'completed_treatment'>('pending_treatment');
  const [patientSearch, setPatientSearch] = useState('');
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

  // Routine anamnez state
  const [pendingAnamrezRecord, setPendingAnamrezRecord] = useState<{ id: string; routineAnamnezTemplates: string[] } | null>(null);
  const [routineSymptomRatings, setRoutineSymptomRatings] = useState<Record<string, number>>({});
  const [routineSymptomNotes, setRoutineSymptomNotes] = useState<Record<string, string>>({});
  const [_anamrezFetchLoading, setAnamrezFetchLoading] = useState(false);

  // Kat Depo malzeme state
  const [katDepoItems, setKatDepoItems] = useState<KatDepoUrun[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [katDepoLoading, setKatDepoLoading] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');

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
      const pendingSessionsList: TreatmentSession[] = [];
      allClinicPatients.forEach(patient => {
        const activeSessions = patient.activeAppointments;
        if (activeSessions && activeSessions.length > 0) {
          // Multi-session support: one row per session
          activeSessions.forEach(session => {
            pendingSessionsList.push({
              ...patient,
              treatmentOptions: session.treatmentOptions || patient.treatmentOptions,
              paymentAmount: session.paymentAmount !== undefined ? session.paymentAmount : patient.paymentAmount,
              paymentDate: session.paymentDate || patient.paymentDate,
              paymentMethod: session.paymentMethod || patient.paymentMethod,
              paymentCompleted: session.paymentCompleted !== undefined ? session.paymentCompleted : patient.paymentCompleted,
              routineAnamnezRequired: session.routineAnamnezRequired !== undefined ? session.routineAnamnezRequired : patient.routineAnamnezRequired,
              routineAnamnezTemplates: session.routineAnamnezTemplates || patient.routineAnamnezTemplates,
              assignedDoctorName: session.assignedDoctorName || patient.assignedDoctorName,
              _sessionId: session.sessionId,
              _sessionType: session.sessionType,
            });
          });
        } else if (
          (patient.status === 'payment_completed' && patient.paymentCompleted === true) ||
          patient.status === 'treatment_continue'
        ) {
          // Backward compat: patient in TreatmentPanel without activeAppointments
          pendingSessionsList.push({ ...patient, _sessionId: undefined, _sessionType: undefined });
        }
      });
      pendingSessionsList.sort((a, b) => {
        const dateA = new Date(a.paymentDate || a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.paymentDate || b.updatedAt || b.createdAt).getTime();
        return dateA - dateB;
      });
      const pendingTreatments = pendingSessionsList;

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

  const fetchPendingAnamrez = async (patient: TreatmentPatient) => {
    setAnamrezFetchLoading(true);
    setPendingAnamrezRecord(null);
    setRoutineSymptomRatings({});
    setRoutineSymptomNotes({});

    try {
      const q = query(
        collection(db, 'anamrezRecords'),
        where('patientId', '==', patient.id),
        where('isRoutineAnamnez', '==', true),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);

      let templates: string[] = [];
      let recordId = '';

      if (!snap.empty) {
        const record = snap.docs[0];
        const data = record.data();
        recordId = record.id;
        templates = data.routineAnamnezTemplates || [];
      } else if (patient.routineAnamnezRequired && patient.routineAnamnezTemplates?.length) {
        templates = patient.routineAnamnezTemplates;
      }

      if (templates.length > 0) {
        setPendingAnamrezRecord({ id: recordId, routineAnamnezTemplates: templates });
        const initialRatings: Record<string, number> = {};
        templates.forEach(t => { initialRatings[t] = 0; });
        setRoutineSymptomRatings(initialRatings);
      }
    } catch (err) {
      console.error('❌ Error fetching routine anamnez:', err);
    } finally {
      setAnamrezFetchLoading(false);
    }
  };

  const fetchKatDepoItems = async (patient?: TreatmentPatient | null) => {
    if (!doctorProfile?.clinicId) return;
    setKatDepoLoading(true);
    try {
      const q = query(
        collection(db, 'katDepoUrunler'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as KatDepoUrun))
        .filter(item => item.quantity > 0);
      setKatDepoItems(items);

      // Tedaviye bağlı varsayılan malzemeleri yükle
      const applications = patient?.treatmentOptions?.selectedMainApplications;
      if (applications && applications.length > 0) {
        const eslQ = query(
          collection(db, 'tedaviMalzemeEslestirme'),
          where('clinicId', '==', doctorProfile.clinicId)
        );
        const eslSnap = await getDocs(eslQ);
        const allMappings = eslSnap.docs.map(d => d.data() as { applicationName: string; materials: { productId: string; productName: string; stockCode: string; defaultQuantity: number }[] });

        const preloaded: SelectedMaterial[] = [];
        const seen = new Set<string>();
        for (const appName of applications) {
          const mapping = allMappings.find(m => m.applicationName === appName);
          if (!mapping) continue;
          for (const mat of mapping.materials) {
            if (seen.has(mat.productId)) continue;
            seen.add(mat.productId);
            const stockItem = items.find(i => i.id === mat.productId);
            if (!stockItem) continue;
            const qty = Math.min(mat.defaultQuantity, stockItem.quantity);
            if (qty > 0) {
              preloaded.push({ productId: mat.productId, productName: mat.productName, stockCode: mat.stockCode, quantity: qty });
            }
          }
        }
        if (preloaded.length > 0) setSelectedMaterials(preloaded);
      }
    } catch (err) {
      console.error('❌ Kat depo ürünleri yüklenemedi:', err);
    } finally {
      setKatDepoLoading(false);
    }
  };

  const handleMaterialQuantityChange = (item: KatDepoUrun, qty: number) => {
    if (qty <= 0) {
      setSelectedMaterials(prev => prev.filter(m => m.productId !== item.id));
      return;
    }
    const maxQty = Math.min(qty, item.quantity);
    setSelectedMaterials(prev => {
      const existing = prev.find(m => m.productId === item.id);
      if (existing) {
        return prev.map(m => m.productId === item.id ? { ...m, quantity: maxQty } : m);
      }
      return [...prev, { productId: item.id, productName: item.productName, stockCode: item.stockCode, quantity: maxQty }];
    });
  };

  const getMaterialQty = (productId: string) =>
    selectedMaterials.find(m => m.productId === productId)?.quantity ?? 0;

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

      // Muayene hastaları ödemeyi Tedavi Ekranı'ndan önce yaptığından tekrar Muhasebe'ye gitmez
      const isMuayeneSession =
        (selectedPatient as TreatmentSession)._sessionType === 'muayene' ||
        selectedPatient.appointmentType === 'muayene' ||
        selectedPatient.appointmentType === 'ilk_muayene';

      if (treatmentApplied) {
        if (hasUnselectedTreatments) {
          updateData.treatmentCompletedAt = new Date().toISOString();
          updateData.treatmentApplied = true;
          updateData.treatmentPartiallyApplied = true;
          updateData.appliedTreatments = selectedTreatments;
          updateData.unselectedTreatments = unselectedTreatments;
          updateData.unselectedTreatmentReason = unselectedTreatmentReason.trim() || 'Hasta tarafından reddedildi';
          if (treatmentNotes.trim()) updateData.treatmentNotes = treatmentNotes.trim();
          if (isMuayeneSession) {
            updateData.status = 'treatment_completed';
          } else {
            updateData.status = 'treatment_decided';
            updateData.paymentCompleted = false;
            updateData.postTreatmentPayment = true;
          }
        } else {
          updateData.treatmentCompletedAt = new Date().toISOString();
          updateData.treatmentApplied = true;
          updateData.treatmentPartiallyApplied = false;
          updateData.appliedTreatments = selectedTreatments;
          updateData.unselectedTreatments = [];
          if (treatmentNotes.trim()) updateData.treatmentNotes = treatmentNotes.trim();
          if (isMuayeneSession) {
            updateData.status = 'treatment_completed';
          } else {
            updateData.status = 'treatment_decided';
            updateData.paymentCompleted = false;
            updateData.postTreatmentPayment = true;
          }
        }
      } else {
        updateData.treatmentApplied = false;
        updateData.treatmentPartiallyApplied = false;
        updateData.treatmentNotAppliedReason = notAppliedReason.trim();
        updateData.appliedTreatments = [];
        updateData.unselectedTreatments = allTreatments;
        if (treatmentNotes.trim()) updateData.treatmentNotes = treatmentNotes.trim();
        if (isMuayeneSession) {
          updateData.status = 'treatment_completed';
        } else {
          updateData.status = 'treatment_decided';
          updateData.paymentCompleted = false;
          updateData.postTreatmentPayment = true;
        }
      }

      // Remove this session from activeAppointments if it has a sessionId
      if ((selectedPatient as TreatmentSession)._sessionId) {
        const patientSnap = await getDoc(patientRef);
        const currentActiveAppointments: ActiveAppointmentSession[] = patientSnap.data()?.activeAppointments || [];
        const remainingSessions = currentActiveAppointments.filter(
          s => s.sessionId !== (selectedPatient as TreatmentSession)._sessionId
        );
        updateData.activeAppointments = remainingSessions;
      }

      await updateDoc(patientRef, updateData);

      // ── Tedavi Raporu kaydı oluştur ────────────────────────────────────────
      try {
        const now = new Date();
        const sessionType = (selectedPatient as TreatmentSession)._sessionType || selectedPatient.appointmentType || '';
        const reportClinicId = selectedPatient.clinicId || doctorProfile?.clinicId || '';
        if (!reportClinicId) throw new Error('clinicId bulunamadı, rapor kaydedilemedi');
        await addDoc(collection(db, 'treatmentReports'), {
          patientId: selectedPatient.id,
          patientName: selectedPatient.fullName,
          clinicId: reportClinicId,
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          performerName: doctorProfile?.fullName || '',
          assignedDoctorName: selectedPatient.assignedDoctorName || '',
          visitType: sessionType,
          complaint: selectedPatient.visitReason || '',
          appliedTreatments: updateData.appliedTreatments ?? [],
          treatmentApplied: updateData.treatmentApplied ?? false,
          treatmentNotes: updateData.treatmentNotes ?? '',
          notAppliedReason: updateData.treatmentNotAppliedReason ?? '',
          protocolName: selectedPatient.treatmentOptions?.protocolName ?? '',
          createdAt: now.toISOString(),
        });
        console.log('✅ Tedavi raporu oluşturuldu:', selectedPatient.fullName);
      } catch (reportErr) {
        console.error('❌ Tedavi raporu oluşturulamadı:', reportErr);
      }

      // ── Uygulanan tedavileri ilgili anamrezRecord'a kaydet ─────────────────
      try {
        const anamrezQ = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', selectedPatient.id)
        );
        const anamrezSnap = await getDocs(anamrezQ);
        const nonRoutine = anamrezSnap.docs
          .filter(d => !d.data().isRoutineAnamnez)
          .sort((a, b) => {
            const tA = new Date(a.data().createdAt || 0).getTime();
            const tB = new Date(b.data().createdAt || 0).getTime();
            return tB - tA; // en yeni önce
          });
        if (nonRoutine.length > 0) {
          await updateDoc(doc(db, 'anamrezRecords', nonRoutine[0].id), {
            appliedTreatments: updateData.appliedTreatments ?? [],
            treatmentApplied: updateData.treatmentApplied ?? false,
            treatmentPartiallyApplied: updateData.treatmentPartiallyApplied ?? false,
            treatmentNotes: updateData.treatmentNotes ?? '',
            treatmentNotAppliedReason: updateData.treatmentNotAppliedReason ?? '',
            unselectedTreatments: updateData.unselectedTreatments ?? [],
            protocolName: selectedPatient.treatmentOptions?.protocolName ?? '',
            performerName: doctorProfile?.fullName || '',
            treatmentCompletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          console.log('✅ Applied treatments saved to anamrezRecord:', nonRoutine[0].id);
        }
      } catch (anamrezSaveError) {
        console.error('❌ Error saving applied treatments to anamrezRecord:', anamrezSaveError);
      }

      // Save routine anamnez if present
      if (pendingAnamrezRecord && pendingAnamrezRecord.routineAnamnezTemplates.length > 0) {
        const anamrezSaveData = {
          routineAnamnezData: routineSymptomRatings,
          routineAnamnezNotes: routineSymptomNotes,
          status: 'completed',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (pendingAnamrezRecord.id) {
          await updateDoc(doc(db, 'anamrezRecords', pendingAnamrezRecord.id), anamrezSaveData);
        } else {
          await addDoc(collection(db, 'anamrezRecords'), {
            patientId: selectedPatient.id,
            patientName: selectedPatient.fullName,
            clinicId: selectedPatient.clinicId,
            isRoutineAnamnez: true,
            routineAnamnezTemplates: pendingAnamrezRecord.routineAnamnezTemplates,
            createdAt: new Date().toISOString(),
            ...anamrezSaveData,
          });
        }
        console.log(`✅ Routine anamnez saved for patient: ${selectedPatient.fullName}`);
      }

      console.log(`✅ Treatment processed for patient: ${selectedPatient.fullName}`);
      console.log(`✅ Applied treatments: ${selectedTreatments.join(', ')}`);
      if (hasUnselectedTreatments) {
        console.log(`⚠️ Unselected treatments (refund required): ${unselectedTreatments.join(', ')}`);
      }

      // ── Kat Depo malzeme düşümü ve kullanım kaydı ──────────────────────────
      if (selectedMaterials.length > 0) {
        try {
          for (const material of selectedMaterials) {
            const urunRef = doc(db, 'katDepoUrunler', material.productId);
            await updateDoc(urunRef, {
              quantity: increment(-material.quantity),
              updatedAt: new Date().toISOString(),
            });
          }

          await addDoc(collection(db, 'katDepoKullanimlar'), {
            nurseName: doctorProfile?.fullName || '',
            nurseId: doctorProfile?.clinicId || '',
            patientName: selectedPatient.fullName,
            treatmentName: selectedPatient.treatmentOptions?.protocolName || 'Tedavi',
            appliedApplications: selectedTreatments,
            items: selectedMaterials.map(m => ({
              productId: m.productId,
              productName: m.productName,
              plannedQty: m.quantity,
              usedQty: m.quantity,
            })),
            clinicId: selectedPatient.clinicId || doctorProfile?.clinicId || '',
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          });

          console.log('✅ Kat depo malzemeleri düşüldü:', selectedMaterials);
        } catch (depoErr) {
          console.error('❌ Kat depo güncelleme hatası:', depoErr);
        }
      }

      // Reset modal state
      setIsTreatmentModalOpen(false);
      setSelectedPatient(null);
      setTreatmentApplied(true);
      setTreatmentNotes('Tedavi Başarı İle Uygulandı');
      setNotAppliedReason('');
      setSelectedTreatments([]);
      setUnselectedTreatmentReason('');
      setPendingAnamrezRecord(null);
      setRoutineSymptomRatings({});
      setRoutineSymptomNotes({});
      setSelectedMaterials([]);
      setKatDepoItems([]);
      setMaterialSearch('');

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

  const activeList = activeListType === 'pending_treatment' ? pendingTreatmentPatients : completedTreatmentPatients;
  const normalizedSearch = patientSearch.trim().toLocaleLowerCase('tr');
  const filteredPatients = normalizedSearch
    ? activeList.filter(p =>
        (p.fullName || '').toLocaleLowerCase('tr').includes(normalizedSearch) ||
        (p.tcNo || '').toLocaleLowerCase('tr').includes(normalizedSearch) ||
        (p.phone || '').toLocaleLowerCase('tr').includes(normalizedSearch)
      )
    : activeList;

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
        <div className="px-6 py-4 border-b border-white/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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

          {/* Patient Search Filter */}
          <div className="relative w-full sm:w-80">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-base pointer-events-none">🔍</span>
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Hasta ara (ad, TC, telefon)..."
              className="w-full pl-10 pr-9 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-all duration-200"
            />
            {patientSearch && (
              <button
                onClick={() => setPatientSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
                aria-label="Aramayı temizle"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {filteredPatients.map((patient) => (
            <div key={patient.id + '_' + ((patient as TreatmentSession)._sessionId || 'default')} className="p-6 hover:bg-white/5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {patient.fullName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white text-lg">{patient.fullName}</h4>
                      {(() => {
                        const apptType = (patient as TreatmentSession)._sessionType || patient.appointmentType;
                        if (!apptType) return null;
                        const label = apptType === 'ilk_muayene' ? 'İlk Muayene'
                          : apptType === 'muayene' ? 'Muayene'
                          : apptType === 'kontrol' ? 'Kontrol'
                          : apptType === 'rutin_tedavi' ? 'Rutin'
                          : 'Tedavi';
                        const cls = apptType === 'ilk_muayene'
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                          : apptType === 'muayene'
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                          : apptType === 'kontrol'
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                          : apptType === 'rutin_tedavi'
                          ? 'bg-teal-500/20 border-teal-400/50 text-teal-300'
                          : 'bg-blue-500/20 border-blue-400/50 text-blue-300';
                        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>;
                      })()}
                    </div>
                    <p className="text-white/60 text-sm">TC: {patient.tcNo}</p>
                    <p className="text-white/60 text-sm">📞 {patient.phone}</p>
                  </div>
                </div>

                <div className="text-right">
                  {activeListType === 'pending_treatment' ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                          const apptType = (patient as TreatmentSession)._sessionType || patient.appointmentType;
                          if (apptType === 'muayene') return (
                            <span className="px-3 py-1 bg-amber-500/20 border border-amber-400/60 rounded-full text-amber-200 text-xs font-medium">
                              Muayene Tedavisi Bekliyor
                            </span>
                          );
                          if (apptType === 'rutin_tedavi') return (
                            <span className="px-3 py-1 bg-teal-500/20 border border-teal-400/60 rounded-full text-teal-200 text-xs font-medium">
                              Rutin Tedavi Bekliyor
                            </span>
                          );
                          if (apptType === 'kontrol') return (
                            <span className="px-3 py-1 bg-violet-500/20 border border-violet-400/60 rounded-full text-violet-200 text-xs font-medium">
                              Kontrol Tedavisi Bekliyor
                            </span>
                          );
                          return (
                            <span className="px-3 py-1 bg-blue-500/20 border border-blue-400 rounded-full text-blue-200 text-xs font-medium">
                              Tedavi Bekliyor
                            </span>
                          );
                        })()}
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
                    {canApplyTreatment ? (
                    <button
                      onClick={() => {
                        setSelectedPatient(patient);
                        setTreatmentApplied(true);
                        setTreatmentNotes('Tedavi Başarı İle Uygulandı');
                        setNotAppliedReason('');
                        const allTreatments = patient.treatmentOptions?.selectedMainApplications || [];
                        setSelectedTreatments([...allTreatments]);
                        setUnselectedTreatmentReason('');
                        setSelectedMaterials([]);
                        fetchPendingAnamrez(patient);
                        fetchKatDepoItems(patient);
                        setIsTreatmentModalOpen(true);
                      }}
                      className={`px-4 py-2 border rounded-xl transition-all duration-200 flex items-center gap-2 ${
                        patient.additionalTreatmentPending
                          ? 'bg-orange-500/20 border-orange-400 text-orange-200 hover:bg-orange-500/30'
                          : 'bg-green-500/20 border-green-400 text-green-200 hover:bg-green-500/30'
                      }`}
                    >
                      <span className="text-lg">{patient.additionalTreatmentPending ? '💊' : '🏥'}</span>
                      {patient.additionalTreatmentPending ? 'Ek Tedaviye Başla' : 'Tedavi Uygula'}
                    </button>
                    ) : (
                      <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/40 text-sm flex items-center gap-2">
                        <span>🔒</span>
                        <span>Yalnızca Sistem Yöneticisi veya BaşHemşire uygulayabilir</span>
                      </div>
                    )}
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

          {filteredPatients.length === 0 && (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">
                {normalizedSearch ? '🔍' : activeListType === 'pending_treatment' ? '⏳' : '✅'}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {normalizedSearch
                  ? 'Hasta Bulunamadı'
                  : activeListType === 'pending_treatment' ? 'Bekleyen Tedavi Yok' : 'Henüz Tamamlanan Tedavi Yok'}
              </h3>
              <p className="text-white/60">
                {normalizedSearch
                  ? `"${patientSearch}" ile eşleşen hasta bulunamadı.`
                  : activeListType === 'pending_treatment'
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

              {/* Kat Depo Malzeme Seçimi */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                  <span className="text-lg">🏪</span>
                  Kullanılan Malzemeler
                  <span className="text-xs font-normal text-emerald-600 ml-2">(Kat Deposu'ndan düşülecek)</span>
                </h4>
                {katDepoLoading ? (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                    Kat deposu yükleniyor...
                  </div>
                ) : katDepoItems.length === 0 ? (
                  <p className="text-emerald-700 text-sm">Kat deposunda stokta ürün bulunmuyor.</p>
                ) : (
                  <>
                  <div className="mb-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      type="text"
                      value={materialSearch}
                      onChange={e => setMaterialSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                    />
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {[...katDepoItems]
                      .filter(item => item.productName.toLowerCase().includes(materialSearch.toLowerCase()) || item.stockCode.toLowerCase().includes(materialSearch.toLowerCase()))
                      .sort((a, b) => a.productName.localeCompare(b.productName, 'tr'))
                      .map(item => {
                      const selected = getMaterialQty(item.id);
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${selected > 0 ? 'bg-emerald-100 border-emerald-400' : 'bg-white border-gray-200'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                            <p className="text-xs text-gray-500">Kod: {item.stockCode} &nbsp;|&nbsp; Stok: {item.quantity}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMaterialQuantityChange(item, selected - 1)}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-sm flex items-center justify-center"
                            >−</button>
                            <input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={selected}
                              onChange={e => handleMaterialQuantityChange(item, parseInt(e.target.value) || 0)}
                              className="w-12 text-center text-sm border border-gray-300 rounded px-1 py-0.5"
                            />
                            <button
                              type="button"
                              onClick={() => handleMaterialQuantityChange(item, selected + 1)}
                              disabled={selected >= item.quantity}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-sm flex items-center justify-center disabled:opacity-40"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}
                {selectedMaterials.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-300">
                    <p className="text-xs font-semibold text-emerald-800 mb-1">Seçilenler:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedMaterials.map(m => (
                        <span key={m.productId} className="text-xs bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                          {m.productName} × {m.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
                  setPendingAnamrezRecord(null);
                  setRoutineSymptomRatings({});
                  setRoutineSymptomNotes({});
                  setSelectedMaterials([]);
                  setKatDepoItems([]);
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
