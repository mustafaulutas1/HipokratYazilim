import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, arrayUnion, getDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../../firebase/config';
import { toast } from 'react-toastify';
import AnamrezViewModal from './AnamrezViewModal';

interface PatientHistoryRecord {
  id: string;
  patientId: string;
  patientName: string;
  clinicId: string;
  historyDate: string;
  hasAnamnesis: boolean;
  hasTreatment: boolean;
  hasMedications: boolean;
  anamnesis?: {
    chiefComplaint?: string;
    complaintDetails?: string;
  };
  treatment?: {
    treatmentType?: string;
    outcome?: string;
  };
  medications?: {
    medicationList?: Array<{ name: string }>;
  };
  createdAt: string;
}

interface TreatmentOptions {
  protocol?: string;
  notes?: string;
  protocolId?: string;
  protocolName?: string;
  isCustomized?: boolean;
  originalProtocolId?: string;
  selectedProtocol?: any;
  customizedProtocol?: any;
  selectedMainApplications?: string[];
}

interface Patient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyPhone: string;
  fatherName: string;
  birthPlace: string;
  registeredProvince: string;
  registrationDate?: string;
  country?: string;
  residenceCity?: string;
  visitReason: string;
  createdAt: string;
  updatedAt: string;
  treatmentOptions?: TreatmentOptions;
  treatmentStartedAt?: string;
  status?: string;
  optionalScans?: {
    hasMediaGallery?: boolean;
    [key: string]: any;
  };
  dischargeSurvey?: {
    ratings: { [key: string]: number };
    additionalFeedback: string;
    averageRating: number;
    completedAt: string;
  } | null;
  dischargedAt?: string;
  indirim_check?: boolean;
  indirim_tipi?: 'yuzde' | 'tutar';
  indirim_orani?: number;
  indirim_tutar?: number;
  // Prescription / medication tracking
  prescriptionMedications?: PrescriptionMed[];
  prescriptionChanges?: PrescriptionChange[];
  prescriptionReceiptOverrides?: Record<string, 'received' | 'not_received'>;
  prescriptionChanged?: boolean;
  prescriptionChangedAt?: string;
  pharmacyChangeNote?: string;
  // Pharmacy sale data (what the patient actually purchased)
  pharmacySoldItems?: Array<{ name: string; price?: number; quantity?: number }>;
  // Cumulative list of everything purchased across all sales / prescription changes.
  pharmacyPurchasedItems?: Array<{ name: string; price?: number; quantity?: number }>;
  pharmacyRemovedItems?: Array<{ name: string }>;
  pharmacySaleDate?: string;
  pharmacyStatus?: string;
}

interface PrescriptionMed {
  name: string;
  dosage?: string;
  type?: string;
}

// Common dosage options for the prescription editor (dropdown instead of free text).
const DOSE_OPTIONS = [
  '1X1', '2X1', '3X1', '1X1 T', '2X1 T', '3X1 T', '1X2', '1X3',
  'Günde 1', 'Günde 2', 'Günde 3', 'Haftada 1', 'Haftada 2',
  'İhtiyaç halinde', 'Kür boyunca',
];

interface PrescriptionChange {
  changedAt: string;
  changedBy: string;
  changedByRole?: string;
  instructedBy?: string;
  previousMeds: PrescriptionMed[];
  newMeds: PrescriptionMed[];
  reason?: string;
}

interface MediaFile {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video';
  uploadedAt: string;
  uploadedBy?: string;
}

interface PatientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  initialTab?: string;
  doctorProfile?: any;
  onPatientUpdated?: () => void;
}

const PatientDetailsModal: React.FC<PatientDetailsModalProps> = ({ isOpen, onClose, patient, initialTab = 'personal', doctorProfile, onPatientUpdated }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [historyRecords, setHistoryRecords] = useState<PatientHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<PatientHistoryRecord | null>(null);
  const [isHistoryViewModalOpen, setIsHistoryViewModalOpen] = useState(false);
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'anamrez' | 'pastHistory'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'thisMonth' | 'last3Months' | 'thisYear'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);

  // ── Prescription (İlaç Bilgileri) state ──────────────────────────────────
  const [showPrescriptionEditor, setShowPrescriptionEditor] = useState(false);
  const [editMeds, setEditMeds] = useState<PrescriptionMed[]>([]);
  const [changeReason, setChangeReason] = useState('');
  const [instructedBy, setInstructedBy] = useState('');
  const [savingPrescription, setSavingPrescription] = useState(false);
  // Live copy of the patient doc so prescription/pharmacy data (Alındı status,
  // overrides, change history) stays current after sales/edits without a refresh.
  const [livePatient, setLivePatient] = useState<Patient | null>(null);

  // Subscribe to the patient document while the modal is open.
  useEffect(() => {
    if (!isOpen || !patient?.id) {
      setLivePatient(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'patients', patient.id), (snap) => {
      if (snap.exists()) setLivePatient({ id: snap.id, ...snap.data() } as Patient);
    });
    return () => unsub();
  }, [isOpen, patient?.id]);

  // The effective patient: live doc if available, otherwise the passed-in prop.
  const livePat: Patient | null = livePatient ?? patient;
  // Dropdown option sources for the prescription editor.
  const [medicationOptions, setMedicationOptions] = useState<string[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  // Full medication catalog, used to resolve prescription codes (ARD-REM) to the
  // same commercial name the pharmacy shows (e.g. "RTM NATURE ÇÖREKOTU...").
  const [medicationCatalog, setMedicationCatalog] = useState<any[]>([]);

  // Load medication catalog + clinic staff (doctors/assistants) for the editor dropdowns.
  useEffect(() => {
    const clinicId = doctorProfile?.clinicId;
    if (!isOpen || !clinicId) return;

    const loadOptions = async () => {
      try {
        // Medications the pharmacy actually stocks/sells.
        const medsSnap = await getDocs(query(collection(db, 'medications'), where('clinicId', '==', clinicId)));
        const catalog = medsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setMedicationCatalog(catalog);
        const medNames = catalog
          .map(m => (m.protocolName || m.description || m.name || '').trim())
          .filter(Boolean);
        setMedicationOptions(Array.from(new Set(medNames)).sort((a, b) => a.localeCompare(b, 'tr')));

        // Clinic staff who can be recorded as the instructing doctor/assistant.
        const [docSnap, cuSnap] = await Promise.all([
          getDocs(query(collection(db, 'doctors'), where('clinicId', '==', clinicId))),
          getDocs(query(collection(db, 'clinicUsers'), where('clinicId', '==', clinicId))),
        ]);
        const names: string[] = [];
        docSnap.forEach(d => { const n = (d.data() as any).fullName; if (n) names.push(n); });
        cuSnap.forEach(d => {
          const u = d.data() as any;
          const role = u.role || u.userType;
          if ((role === 'doctor' || role === 'assistant') && u.fullName) names.push(u.fullName);
        });
        setStaffOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'tr')));
      } catch (e) {
        console.error('Reçete editörü seçenekleri yüklenemedi:', e);
      }
    };
    loadOptions();
  }, [isOpen, doctorProfile?.clinicId]);

  // Build a <select>'s option list, always including the current value so an
  // existing protocol/custom entry is never silently dropped.
  const withCurrent = (options: string[], current?: string) => {
    const list = [...options];
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  };

  // Close the editor whenever a different patient is opened.
  useEffect(() => {
    setShowPrescriptionEditor(false);
  }, [patient?.id]);

  // Roles allowed to change a patient's prescription (call-center acts on
  // doctor/assistant instruction).
  const userRole = doctorProfile?.role || doctorProfile?.userType || '';
  const canEditPrescription =
    doctorProfile?.isClinicOwner === true ||
    ['admin', 'assistant', 'doctor', 'call-center'].includes(userRole);

  // Normalize a medication name for loose matching against pharmacy sale items.
  const normalizeMedName = (n: string) => (n || '').toLowerCase().replace(/\s*-\s*/g, '-').trim();

  // Catalog display name (commercial name) — mirrors the pharmacy's logic.
  const catalogDisplayName = (m: any) => (m?.protocolName || m?.description || m?.name || '').trim();

  // Find the catalog medication matching a prescription entry (loose match, same
  // approach the pharmacy uses), then resolve to its commercial display name.
  const findCatalogMed = (medName: string) => {
    const lower = normalizeMedName(medName);
    if (!lower) return undefined;
    return medicationCatalog.find((sm) => {
      const dn = normalizeMedName(catalogDisplayName(sm));
      const pn = normalizeMedName(sm.protocolName || '');
      const nn = normalizeMedName(sm.name || '');
      return (dn && (dn.includes(lower) || lower.includes(dn)))
        || (pn && (pn.includes(lower) || lower.includes(pn)))
        || (nn && (nn.includes(lower) || lower.includes(nn)));
    });
  };

  const resolveMedName = (name: string): string => {
    const m = findCatalogMed(name);
    return m ? catalogDisplayName(m) : name;
  };

  // The active prescription: explicit/edited list if present, otherwise derived
  // from the patient's treatment protocol phases.
  const derivePrescriptionFromProtocol = (p: Patient): PrescriptionMed[] => {
    const protocol: any = p.treatmentOptions?.customizedProtocol || p.treatmentOptions?.selectedProtocol;
    const phases = protocol?.phases;
    if (!phases) return [];
    const meds: PrescriptionMed[] = [];
    const add = (ph: any, type: string) => {
      if (ph?.treatment && ph.treatment !== '-') meds.push({ name: ph.treatment, dosage: ph.dosage || '', type });
    };
    add(phases.remember, 'Remember');
    add(phases.regeneration1, 'Regeneration 1');
    add(phases.regeneration2, 'Regeneration 2');
    add(phases.regeneration3, 'Regeneration 3');
    add(phases.regeneration4, 'Regeneration 4');
    return meds;
  };

  const getActivePrescription = (p: Patient): PrescriptionMed[] => {
    if (p.prescriptionMedications && p.prescriptionMedications.length > 0) return p.prescriptionMedications;
    return derivePrescriptionFromProtocol(p);
  };

  const getPrescriptionChanges = (p: Patient): PrescriptionChange[] => {
    const changes = p.prescriptionChanges ?? [];
    return [...changes].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  };

  // Whether a prescribed medication has been picked up from the pharmacy.
  // Manual override wins; otherwise auto-derived from pharmacySoldItems.
  const getReceiptStatus = (p: Patient, medName: string): boolean => {
    const overrides = p.prescriptionReceiptOverrides ?? {};
    const ov = overrides[medName];
    if (ov) return ov === 'received';
    // Prefer the cumulative purchase history so meds bought before a prescription
    // change still show as "Alındı"; fall back to the last sale for older records.
    // (Guard against an empty [] shadowing the fallback — [] is truthy.)
    const sold = (p.pharmacyPurchasedItems && p.pharmacyPurchasedItems.length > 0)
      ? p.pharmacyPurchasedItems
      : (p.pharmacySoldItems || []);
    const b = normalizeMedName(resolveMedName(medName));
    return sold.some(it => {
      const a = normalizeMedName(it.name);
      return a === b || a.includes(b) || b.includes(a);
    });
  };

  const openPrescriptionEditor = () => {
    if (!livePat) return;
    // Resolve codes to commercial names so the dropdown shows the same names as
    // the pharmacy and future saves store consistent values.
    setEditMeds(getActivePrescription(livePat).map(m => ({ ...m, name: resolveMedName(m.name) })));
    setChangeReason('');
    setInstructedBy('');
    setShowPrescriptionEditor(true);
  };

  const toggleReceiptOverride = async (medName: string, received: boolean) => {
    if (!livePat) return;
    const current = livePat.prescriptionReceiptOverrides ?? {};
    const next = { ...current, [medName]: received ? 'received' as const : 'not_received' as const };
    // Optimistic update; the onSnapshot subscription will confirm.
    setLivePatient(prev => prev ? { ...prev, prescriptionReceiptOverrides: next } : prev);
    try {
      await updateDoc(doc(db, 'patients', livePat.id), { prescriptionReceiptOverrides: next });
      onPatientUpdated?.();
    } catch (e) {
      console.error('Receipt override update failed:', e);
      toast.error('Alındı durumu güncellenemedi.');
    }
  };

  const savePrescriptionChange = async () => {
    if (!livePat) return;
    const cleaned = editMeds
      .map(m => ({ name: (m.name || '').trim(), dosage: (m.dosage || '').trim(), type: m.type || 'Değişiklik' }))
      .filter(m => m.name);
    if (cleaned.length === 0) {
      toast.error('En az bir ilaç girmelisiniz.');
      return;
    }
    // Sanitize: Firestore arrayUnion rejects objects containing `undefined`.
    const sanitizeMeds = (list: PrescriptionMed[]) =>
      list.map(m => ({ name: m.name, dosage: m.dosage || '', type: m.type || '' }));
    const prevActive = getActivePrescription(livePat);
    const previousMeds = sanitizeMeds(prevActive);

    // Carry forward the "Alındı" (received) state for meds that survive the change so
    // the patient isn't asked to re-buy what they already picked up. Removed meds are
    // dropped; the newly-added meds have no entry and stay "Alınmadı". Overrides are
    // re-keyed to the resolved (commercial) names the new prescription list uses, since
    // the editor stores resolved names while old overrides may be keyed by raw names.
    const prevOverrides = livePat.prescriptionReceiptOverrides ?? {};
    const keptNames = new Set(cleaned.map(m => m.name));
    const carriedOverrides: Record<string, 'received' | 'not_received'> = {};
    for (const o of prevActive) {
      const resolved = resolveMedName(o.name);
      const status = prevOverrides[o.name] ?? prevOverrides[resolved];
      if (status && keptNames.has(resolved)) carriedOverrides[resolved] = status;
    }
    // Also preserve any override already keyed directly to a kept name.
    for (const [k, v] of Object.entries(prevOverrides)) {
      if (keptNames.has(k)) carriedOverrides[k] = v;
    }

    const changeRecord: PrescriptionChange = {
      changedAt: new Date().toISOString(),
      changedBy: doctorProfile?.fullName || 'Bilinmiyor',
      changedByRole: userRole || '',
      previousMeds,
      newMeds: cleaned,
      ...(instructedBy.trim() ? { instructedBy: instructedBy.trim() } : {}),
      ...(changeReason.trim() ? { reason: changeReason.trim() } : {}),
    };
    setSavingPrescription(true);
    try {
      await updateDoc(doc(db, 'patients', livePat.id), {
        prescriptionMedications: cleaned,
        prescriptionChanges: arrayUnion(changeRecord),
        prescriptionChanged: true,
        prescriptionChangedAt: changeRecord.changedAt,
        // Keep the received state for kept meds; only removed meds lose their override.
        prescriptionReceiptOverrides: carriedOverrides,
        pharmacyChangeNote: changeReason.trim() || 'Reçete değişikliği',
        // Re-queue the patient to the pharmacy so the new medication is dispensed.
        pharmacyStatus: 'waiting',
        updatedAt: new Date().toISOString(),
      });
      setShowPrescriptionEditor(false);
      toast.success('Reçete güncellendi ve eczaneye iletildi.');
      onPatientUpdated?.();
    } catch (e) {
      console.error('Prescription change failed:', e);
      toast.error('Reçete güncellenirken hata oluştu.');
    } finally {
      setSavingPrescription(false);
    }
  };

  // Fetch patient history records from both collections
  useEffect(() => {
    const fetchHistoryRecords = async () => {
      if (!patient?.id || !isOpen) return;

      setLoadingHistory(true);
      try {
        // Fetch from patientHistoryRecords collection (past history entries)
        const historyQuery = query(
          collection(db, 'patientHistoryRecords'),
          where('patientId', '==', patient.id)
        );
        const historySnapshot = await getDocs(historyQuery);

        const pastHistoryRecords = historySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          source: 'pastHistory'
        })) as (PatientHistoryRecord & { source: string })[];

        // Also fetch from anamrezRecords collection (appointment-based anamnez records)
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        // Fetch appointments for this patient to get typeName (randevu tipi)
        const appointmentsQuery = query(
          collection(db, 'appointments'),
          where('patientId', '==', patient.id)
        );
        // Fetch treatmentReports to get performerName for each treatment day
        const treatmentReportsQuery = query(
          collection(db, 'treatmentReports'),
          where('patientId', '==', patient.id)
        );
        const [anamrezSnapshot, appointmentsSnapshot, treatmentReportsSnapshot] = await Promise.all([
          getDocs(anamrezQuery),
          getDocs(appointmentsQuery),
          getDocs(treatmentReportsQuery)
        ]);

        // Helper: any date value → YYYY-MM-DD string (handles strings and Firestore Timestamps)
        const toDateStr = (val: any): string => {
          if (!val) return '';
          if (typeof val === 'string') return val.split('T')[0];
          if (typeof val === 'object' && val.seconds) return new Date(val.seconds * 1000).toISOString().split('T')[0];
          return '';
        };

        // Build date → performerName map AND a list for closest-date fallback
        const performerByDate = new Map<string, string>();
        const treatmentReportsList: Array<{ dateMs: number; performerName: string; appliedTreatments: string[] }> = [];

        treatmentReportsSnapshot.docs.forEach(d => {
          const rData = d.data();
          if (!rData.performerName) return;
          const performer = rData.performerName as string;
          // Index by date field
          const dateKey = toDateStr(rData.date) || toDateStr(rData.createdAt);
          if (dateKey) performerByDate.set(dateKey, performer);
          // Also index by createdAt if different
          const createdKey = toDateStr(rData.createdAt);
          if (createdKey && createdKey !== dateKey) performerByDate.set(createdKey, performer);
          // Add to list for closest-date fallback
          const dateMs = dateKey ? new Date(dateKey).getTime() : 0;
          treatmentReportsList.push({ dateMs, performerName: performer, appliedTreatments: (rData.appliedTreatments as string[]) || [] });
        });

        // Build a lookup map: appointmentId → { typeName, typeId }
        const appointmentTypeMap = new Map<string, { typeName: string; typeId: string }>();
        appointmentsSnapshot.docs.forEach(d => {
          const data = d.data();
          if (data.typeName || data.typeId) {
            appointmentTypeMap.set(d.id, { typeName: data.typeName || '', typeId: data.typeId || '' });
          }
        });

        const anamrezRecords = anamrezSnapshot.docs.map(doc => {
          const data = doc.data();
          // Get typeName from record itself (new records) or from appointments lookup (old records)
          const apptType = appointmentTypeMap.get(data.appointmentId || '');
          const typeName = data.typeName || apptType?.typeName || '';
          const typeId = data.typeId || apptType?.typeId || '';
          // Resolve performerName: multi-step fallback strategy
          let resolvedPerformerName: string = data.performerName || '';
          if (!resolvedPerformerName) {
            // Step 1: try all available date keys for exact map match
            const dateKeys = [
              toDateStr(data.treatmentCompletedAt),
              toDateStr(data.appointmentDate),
              toDateStr(data.updatedAt),
              toDateStr(data.createdAt),
            ].filter(Boolean);
            for (const key of dateKeys) {
              const found = performerByDate.get(key);
              if (found) { resolvedPerformerName = found; break; }
            }
            // Step 2: if still empty and record has applied treatments, find closest report within 7 days
            if (!resolvedPerformerName && data.appliedTreatments?.length && treatmentReportsList.length > 0) {
              const refMs = dateKeys.length > 0 ? new Date(dateKeys[0]).getTime() : 0;
              if (refMs > 0) {
                const closest = treatmentReportsList.reduce((best, r) =>
                  Math.abs(r.dateMs - refMs) < Math.abs(best.dateMs - refMs) ? r : best
                );
                if (Math.abs(closest.dateMs - refMs) <= 7 * 24 * 60 * 60 * 1000) {
                  resolvedPerformerName = closest.performerName;
                }
              }
            }
          }
          return {
            id: doc.id,
            patientId: data.patientId,
            patientName: data.patientName || patient.fullName,
            clinicId: data.clinicId,
            historyDate: data.appointmentDate || data.createdAt || new Date().toISOString(),
            hasAnamnesis: true,
            hasTreatment: !!(data.treatmentHistory || data.appliedTreatments?.length),
            hasMedications: !!(data.medications || data.conventionalTreatment?.currentMedications),
            anamnesis: {
              chiefComplaint: data.chiefComplaint,
              complaintDetails: data.historyOfPresentIllness || data.presentIllnessHistory
            },
            treatment: (data.treatmentHistory || data.appliedTreatments?.length) ? {
              treatmentType: data.protocolName || 'Tedavi',
              outcome: ''
            } : undefined,
            medications: data.medications,
            createdAt: data.createdAt,
            source: 'anamrez',
            typeName,
            typeId,
            // Keep original data for viewing
            ...data,
            // Override performerName after spread so fallback lookup wins for old records
            performerName: resolvedPerformerName,
          } as PatientHistoryRecord & { source: string };
        });

        // Combine and sort all records by date (newest first)
        // First, deduplicate by checking appointmentId or by unique identifiers
        const allRecords = [...pastHistoryRecords, ...anamrezRecords];
        
        // Filter out pending records - only show completed ones
        // Also deduplicate by appointmentId, preferring completed records
        const recordsByAppointmentId = new Map<string, any>();
        const recordsWithoutAppointmentId: any[] = [];
        
        // First pass: group by appointmentId and prefer completed records
        allRecords.forEach((record: any) => {
          if (record.appointmentId) {
            const existing = recordsByAppointmentId.get(record.appointmentId);
            if (!existing) {
              recordsByAppointmentId.set(record.appointmentId, record);
            } else {
              // Prefer completed over pending
              if (record.status === 'completed' && existing.status !== 'completed') {
                recordsByAppointmentId.set(record.appointmentId, record);
              }
            }
          } else {
            recordsWithoutAppointmentId.push(record);
          }
        });
        
        // Combine records with appointmentId and those without
        const deduplicatedByAppointment = Array.from(recordsByAppointmentId.values());
        
        // For records without appointmentId, deduplicate by date
        const seenDates = new Map<string, any>();
        const deduplicatedWithoutAppointment = recordsWithoutAppointmentId.filter((record: any) => {
          const dateKey = `${record.patientId}-${record.historyDate?.split('T')[0] || record.createdAt?.split('T')[0]}`;
          const existing = seenDates.get(dateKey);
          if (!existing) {
            seenDates.set(dateKey, record);
            return true;
          }
          // Prefer completed over pending, and anamrez over pastHistory
          if (record.status === 'completed' && existing.status !== 'completed') {
            seenDates.set(dateKey, record);
            return true;
          }
          if (record.source === 'anamrez' && existing.source === 'pastHistory') {
            seenDates.set(dateKey, record);
            return true;
          }
          return false;
        });
        
        // Final filter: only show completed records, not pending
        const finalRecords = [...deduplicatedByAppointment, ...deduplicatedWithoutAppointment]
          .filter((record: any) => record.status !== 'pending');
        
        finalRecords.sort((a, b) => {
          const dateA = new Date(a.historyDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.historyDate || b.createdAt || 0).getTime();
          return dateB - dateA;
        });

        setHistoryRecords(finalRecords);
      } catch (error) {
        console.error('Error fetching history records:', error);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistoryRecords();
  }, [patient?.id, isOpen]);

  // Reset tab and fetch media when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchMediaFiles();
    }
  }, [isOpen, initialTab]);

  // Fetch media files from patient record
  const fetchMediaFiles = async () => {
    if (!patient?.id) return;
    
    setLoadingMedia(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      const patientDoc = await getDoc(patientRef);
      
      if (patientDoc.exists()) {
        const data = patientDoc.data();
        setMediaFiles(data.mediaFiles || []);
      }
    } catch (error) {
      console.error('Error fetching media files:', error);
    } finally {
      setLoadingMedia(false);
    }
  };

  // Handle file upload
  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !patient?.id) return;

    setUploadingMedia(true);
    const newMediaFiles: MediaFile[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        if (!isVideo && !isImage) {
          toast.error(`${file.name} desteklenmeyen dosya formatı`);
          continue;
        }

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const fileName = `patients/${patient.id}/media/${timestamp}_${file.name}`;
        const storageRef = ref(storage, fileName);
        
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        const mediaFile: MediaFile = {
          id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
          url: downloadUrl,
          name: file.name,
          type: isVideo ? 'video' : 'image',
          uploadedAt: new Date().toISOString(),
        };

        newMediaFiles.push(mediaFile);
      }

      // Update patient record with new media files
      if (newMediaFiles.length > 0) {
        const patientRef = doc(db, 'patients', patient.id);
        await updateDoc(patientRef, {
          mediaFiles: arrayUnion(...newMediaFiles)
        });

        setMediaFiles(prev => [...prev, ...newMediaFiles]);
        toast.success(`${newMediaFiles.length} dosya başarıyla yüklendi`);
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Dosya yüklenirken bir hata oluştu');
    } finally {
      setUploadingMedia(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle delete media
  const handleDeleteMedia = async (mediaToDelete: MediaFile) => {
    if (!patient?.id) return;

    const confirmDelete = window.confirm(`"${mediaToDelete.name}" dosyasını silmek istediğinizden emin misiniz?`);
    if (!confirmDelete) return;

    try {
      // Delete from Firebase Storage
      try {
        const storageRef = ref(storage, mediaToDelete.url);
        await deleteObject(storageRef);
      } catch (storageError) {
        // File might already be deleted or URL format different
        console.warn('Could not delete from storage:', storageError);
      }

      // Update patient record - remove the media file
      const updatedMediaFiles = mediaFiles.filter(m => m.id !== mediaToDelete.id);
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        mediaFiles: updatedMediaFiles
      });

      setMediaFiles(updatedMediaFiles);
      toast.success('Dosya başarıyla silindi');
    } catch (error) {
      console.error('Error deleting media:', error);
      toast.error('Dosya silinirken bir hata oluştu');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Yazdırma penceresi açılamadı. Lütfen pop-up engelleyiciyi devre dışı bırakın.');
      return;
    }
    if (!patient) { printWindow.close(); return; }
    const age = calculateAge(patient.birthDate);
    const fmt = (d: string) => { try { return new Date(d).toLocaleDateString('tr-TR'); } catch { return d || '-'; } };

    printWindow.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <title>Hasta Bilgileri - ${patient.fullName}</title>
  <style>
    @media print { @page { size: A4 portrait; margin: 12mm; } }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #333; margin: 0; padding: 20px; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #4c1d95; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 20px; color: #4c1d95; margin: 0 0 4px; }
    .header p { color: #666; margin: 0; font-size: 11px; }
    .section { margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .section-title { background: #f3f0ff; color: #4c1d95; font-weight: 700; font-size: 12px; padding: 7px 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .field { padding: 6px 12px; border-bottom: 1px solid #f0f0f0; }
    .field:last-child { border-bottom: none; }
    .label { font-size: 10px; color: #718096; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
    .value { font-weight: 500; color: #2d3748; }
    .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; font-size: 10px; color: #aaa; }
  </style>
</head>
<body>
  <div class="header">
    <h1>HASTA BİLGİ FORMU</h1>
    <p>${patient.fullName} &nbsp;|&nbsp; Hasta No: ${patient.id} &nbsp;|&nbsp; Yazdırma Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>
  </div>

  <div class="section">
    <div class="section-title">Temel Bilgiler</div>
    <div class="grid">
      <div class="field"><div class="label">Ad Soyad</div><div class="value">${patient.fullName || '-'}</div></div>
      <div class="field"><div class="label">TC Kimlik No</div><div class="value">${patient.tcNo || '-'}</div></div>
      <div class="field"><div class="label">Doğum Tarihi</div><div class="value">${fmt(patient.birthDate)}</div></div>
      <div class="field"><div class="label">Yaş</div><div class="value">${age} yaş</div></div>
      <div class="field"><div class="label">Cinsiyet</div><div class="value">${patient.gender || '-'}</div></div>
      <div class="field"><div class="label">Durum</div><div class="value">Kayıtlı</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Aile Bilgileri</div>
    <div class="grid">
      <div class="field"><div class="label">Baba Adı</div><div class="value">${patient.fatherName || '-'}</div></div>
      <div class="field"><div class="label">Doğum Yeri</div><div class="value">${patient.birthPlace || '-'}</div></div>
      <div class="field"><div class="label">Kayıtlı İl</div><div class="value">${patient.registeredProvince || '-'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">İletişim Bilgileri</div>
    <div class="grid">
      <div class="field"><div class="label">Telefon</div><div class="value">${patient.phone || '-'}</div></div>
      <div class="field"><div class="label">E-Posta</div><div class="value">${patient.email || '-'}</div></div>
      <div class="field"><div class="label">Acil Telefon</div><div class="value">${patient.emergencyPhone || '-'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">İkamet Bilgileri</div>
    <div class="grid">
      <div class="field"><div class="label">Ülke</div><div class="value">${patient.country || 'Türkiye'}</div></div>
      <div class="field"><div class="label">İkamet İli</div><div class="value">${patient.residenceCity || '-'}</div></div>
      <div class="field" style="grid-column: span 2"><div class="label">Adres</div><div class="value">${patient.address || '-'}</div></div>
    </div>
  </div>

  <div class="footer">RTM Clinic &nbsp;|&nbsp; Son Güncelleme: ${fmt(patient.updatedAt)}</div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  if (!isOpen || !patient) return null;

  // Calculate age from birth date
  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const tabs = [
    { id: 'personal', label: 'Kişisel Bilgi', icon: '👤' },
    { id: 'contact', label: 'İletişim', icon: '📞' },
    { id: 'medical', label: 'Tıbbi Bilgi', icon: '🏥' },
    { id: 'treatment', label: 'Tedavi Bilgileri', icon: '💊' },
    { id: 'medications', label: 'İlaç Bilgileri', icon: '💉' },
    { id: 'history', label: 'Geçmiş Kayıtları', icon: '📜' },
    // Only show media tab if hasMediaGallery is enabled in anamnez
    ...(patient.optionalScans?.hasMediaGallery ? [{ id: 'media', label: 'Fotoğraflar ve Videolar', icon: '📷' }] : []),
    { id: 'address', label: 'Adres', icon: '📍' },
    { id: 'notes', label: 'Notlar', icon: '📝' },
    ...(patient.dischargeSurvey ? [{ id: 'survey', label: 'Memnuniyet Anketi', icon: '📊' }] : [])
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white text-2xl font-bold">
                  {patient.fullName.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-800">{patient.fullName}</h2>
                <p className="text-gray-600">Hasta No: {patient.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-2xl font-bold p-2 hover:bg-gray-100 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200">
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Cinsiyet:</span>
                <span className="font-semibold text-gray-800">{patient.gender}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Yaş:</span>
                <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">TC No:</span>
                <span className="font-semibold text-gray-800">{patient.tcNo}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Doğum Tarihi:</span>
                <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Ülke:</span>
                <span className="font-semibold text-gray-800">
                  {patient.country || 'Türkiye'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">İkamet İli:</span>
                <span className="font-semibold text-gray-800">
                  {patient.residenceCity || '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Durum:</span>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  Kayıtlı
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

                 {/* Content */}
         <div className="flex-1 overflow-y-auto min-h-0">
           <div className="p-6">
            {/* Personal Information Tab */}
            {activeTab === 'personal' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👤 Temel Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ad Soyad:</span>
                        <span className="font-semibold text-gray-800">{patient.fullName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">TC Kimlik No:</span>
                        <span className="font-semibold text-gray-800">{patient.tcNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👨‍👩‍👧‍👦 Aile Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Baba Adı:</span>
                        <span className="font-semibold text-gray-800">{patient.fatherName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Yeri:</span>
                        <span className="font-semibold text-gray-800">{patient.birthPlace}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıtlı İl:</span>
                        <span className="font-semibold text-gray-800">{patient.registeredProvince}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discount Information */}
                {patient.indirim_check && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                      💚 İndirim Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-green-700 font-medium">Sürekli İndirim Uygulanıyor:</span>
                        <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded-full text-sm font-semibold">
                          <span>✓</span>
                          Aktif
                        </span>
                      </div>
                      <div className="border-t border-green-200 pt-3">
                        <div className="flex justify-between">
                          <span className="text-green-700 font-medium">İndirim Türü:</span>
                          <span className="font-semibold text-green-900">
                            {patient.indirim_tipi === 'yuzde' ? '% Yüzde' : '₺ Tutar'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-green-700 font-medium">
                            {patient.indirim_tipi === 'yuzde' ? 'İndirim Oranı:' : 'İndirim Tutarı:'}
                          </span>
                          <span className="font-semibold text-green-900">
                            {patient.indirim_tipi === 'yuzde' 
                              ? `%${patient.indirim_orani || 0}` 
                              : `₺${(patient.indirim_tutar || 0).toFixed(2)}`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 İkamet Bilgileri
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ülke:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.country || 'Türkiye'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">İkamet İli:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.residenceCity || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Son Güncelleme:</span>
                      <span className="font-semibold text-gray-800">{formatDate(patient.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Information Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📞 İletişim Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Telefon</label>
                      <p className="font-semibold text-gray-800">{patient.phone}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Email</label>
                      <p className="font-semibold text-gray-800">{patient.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Acil Telefon</label>
                      <p className="font-semibold text-gray-800">
                        {patient.emergencyPhone || 'Belirtilmemiş'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Medical Information Tab */}
            {activeTab === 'medical' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      🏥 Tıbbi Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      📋 Ziyaret Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                        <p className="font-semibold text-gray-800">
                          {patient.visitReason || 'Belirtilmemiş'}
                        </p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıt Tarihi:</span>
                        <span className="font-semibold text-gray-800">
                          {formatDate(patient.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Treatment Information Tab */}
            {activeTab === 'treatment' && (
              <div className="space-y-6">
                {patient.treatmentOptions ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        💊 Tedavi Protokolü
                      </h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-gray-600">Protokol Adı</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.protocolName || 'Belirtilmemiş'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">Protokol Tipi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.isCustomized ? (
                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                                  🎨 Özelleştirilmiş
                                </span>
                              ) : (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  📋 Standart
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {patient.treatmentStartedAt && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Başlangıç Tarihi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {formatDate(patient.treatmentStartedAt)}
                            </p>
                          </div>
                        )}

                        {patient.status && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Durumu</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.status === 'treatment_decided' && (
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                  📋 Tedavi Belirlendi
                                </span>
                              )}
                              {patient.status === 'in_treatment' && (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  🏥 Tedavide
                                </span>
                              )}
                              {patient.status === 'treatment_completed' && (
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                  ✅ Tamamlandı
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected Protocol Details */}
                    {patient.treatmentOptions.selectedProtocol && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📊 Protokol Detayları
                        </h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm text-gray-600">Tanı Sistemi</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.diagnosisSystem || 'Belirtilmemiş'}
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-gray-600">Yaş Grubu</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.ageGroup || 'Belirtilmemiş'}
                              </p>
                            </div>
                          </div>

                          {patient.treatmentOptions.selectedProtocol.frequency && (
                            <div>
                              <label className="text-sm text-gray-600">Tedavi Sıklığı</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.frequency}
                              </p>
                            </div>
                          )}

                          {patient.treatmentOptions.selectedProtocol.control && (
                            <div>
                              <label className="text-sm text-gray-600">Kontrol</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.control}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Treatment Sequence */}
                    {patient.treatmentOptions.selectedProtocol?.treatmentSequence && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          🔄 Tedavi Sırası
                        </h3>
                        <div className="space-y-3">
                          {patient.treatmentOptions.selectedProtocol.treatmentSequence.map((item: any, index: number) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {item.order}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                    {item.phase}
                                  </span>
                                </div>
                                <p className="font-semibold text-gray-800">{item.treatment}</p>
                                {item.dosage && (
                                  <p className="text-sm text-gray-600 mt-1">Doz: {item.dosage}</p>
                                )}
                                {item.description && (
                                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Main Applications */}
                    {patient.treatmentOptions.selectedMainApplications && patient.treatmentOptions.selectedMainApplications.length > 0 && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          ✅ Seçilen Ana Uygulamalar
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {patient.treatmentOptions.selectedMainApplications.map((app, index) => (
                            <span 
                              key={index}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Treatment Notes */}
                    {patient.treatmentOptions.notes && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📝 Tedavi Notları
                        </h3>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {patient.treatmentOptions.notes}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">💊</div>
                    <h3 className="text-gray-900 text-xl font-semibold mb-2">Henüz Tedavi Başlatılmamış</h3>
                    <p className="text-gray-600">
                      Bu hasta için henüz bir tedavi protokolü belirlenmemiş.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Medications (İlaç Bilgileri) Tab */}
            {activeTab === 'medications' && (() => {
              const p = livePat;
              if (!p) return null;
              const meds = getActivePrescription(p);
              const changes = getPrescriptionChanges(p);
              const prescribedDate = p.prescriptionChangedAt || p.treatmentStartedAt || p.updatedAt;
              return (
                <div className="space-y-6">
                  {/* Aktif Reçete */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        💉 Güncel Reçete
                        {p.prescriptionChanged && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">🔁 Değiştirildi</span>
                        )}
                      </h3>
                      {canEditPrescription && (
                        <button
                          onClick={openPrescriptionEditor}
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg text-sm font-medium transition-all"
                        >
                          ✏️ Reçeteyi Değiştir
                        </button>
                      )}
                    </div>

                    {meds.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <div className="text-4xl mb-2">💊</div>
                        <p>Bu hasta için kayıtlı ilaç bulunmuyor.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="py-2 pr-3">İlaç</th>
                              <th className="py-2 pr-3">Doz</th>
                              <th className="py-2 pr-3">Tarih</th>
                              <th className="py-2 pr-3">Durum</th>
                              <th className="py-2 pr-3">Alınma Tarihi</th>
                              {canEditPrescription && <th className="py-2">İşlem</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {meds.map((m, i) => {
                              const received = getReceiptStatus(p, m.name);
                              return (
                                <tr key={i} className="border-b border-gray-100">
                                  <td className="py-2 pr-3 font-medium text-gray-800">{resolveMedName(m.name)}</td>
                                  <td className="py-2 pr-3 text-gray-600">{m.dosage || '-'}</td>
                                  <td className="py-2 pr-3 text-gray-600">{prescribedDate ? formatDate(prescribedDate) : '-'}</td>
                                  <td className="py-2 pr-3">
                                    {received ? (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✓ Alındı</span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">✕ Alınmadı</span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-gray-600">{received && p.pharmacySaleDate ? formatDate(p.pharmacySaleDate) : '-'}</td>
                                  {canEditPrescription && (
                                    <td className="py-2">
                                      <button
                                        onClick={() => toggleReceiptOverride(m.name, !received)}
                                        className="px-2 py-1 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-all"
                                        title="Alındı durumunu elle değiştir"
                                      >
                                        {received ? 'Alınmadı işaretle' : 'Alındı işaretle'}
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Reçete Değişiklik Geçmişi */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      🕑 Reçete Değişiklik Geçmişi
                    </h3>
                    {changes.length === 0 ? (
                      <p className="text-gray-500 text-sm">Henüz reçete değişikliği yapılmamış.</p>
                    ) : (
                      <div className="space-y-3">
                        {changes.map((c, i) => (
                          <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                              <span className="text-sm font-semibold text-gray-700">{formatDate(c.changedAt)}</span>
                              <span className="text-xs text-gray-500">
                                {c.changedBy}{c.changedByRole ? ` (${c.changedByRole})` : ''}
                                {c.instructedBy ? ` • Talimat: ${c.instructedBy}` : ''}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Önceki İlaçlar</p>
                                <div className="flex flex-wrap gap-1">
                                  {c.previousMeds.length > 0 ? c.previousMeds.map((m, j) => (
                                    <span key={j} className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-xs line-through">
                                      {resolveMedName(m.name)}{m.dosage ? ` (${m.dosage})` : ''}
                                    </span>
                                  )) : <span className="text-xs text-gray-400">-</span>}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Yeni İlaçlar</p>
                                <div className="flex flex-wrap gap-1">
                                  {c.newMeds.map((m, j) => (
                                    <span key={j} className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs">
                                      {resolveMedName(m.name)}{m.dosage ? ` (${m.dosage})` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {c.reason && <p className="text-xs text-gray-600 mt-2">📝 {c.reason}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* History Records Tab */}
            {activeTab === 'history' && (() => {
              // --- computed values (inlined to avoid hoisting issues) ---
              const now = new Date();
              const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
              const startOfLast3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);
              const startOfYear = new Date(now.getFullYear(), 0, 1);

              const filteredRecords = historyRecords.filter((record: any) => {
                if (historySourceFilter !== 'all' && record.source !== historySourceFilter) return false;
                if (historyDateFilter !== 'all') {
                  const d = new Date(record.historyDate || record.createdAt);
                  if (historyDateFilter === 'thisMonth' && d < startOfMonth) return false;
                  if (historyDateFilter === 'last3Months' && d < startOfLast3Months) return false;
                  if (historyDateFilter === 'thisYear' && d < startOfYear) return false;
                }
                if (historySearch.trim()) {
                  const q = historySearch.toLowerCase();
                  const complaint = (record.anamnesis?.complaintDetails || record.anamnesis?.chiefComplaint || '').toLowerCase();
                  const treatment = (record.treatment?.treatmentType || '').toLowerCase();
                  const meds = (record.medications?.medicationList || []).map((m: any) => m.name).join(' ').toLowerCase();
                  if (!complaint.includes(q) && !treatment.includes(q) && !meds.includes(q)) return false;
                }
                return true;
              });

              // Stats from ALL records (not filtered)
              const totalVisits = historyRecords.length;
              const lastVisitDate = historyRecords.length > 0
                ? new Date(historyRecords[0].historyDate || historyRecords[0].createdAt)
                : null;
              const daysSinceLast = lastVisitDate
                ? Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))
                : null;

              // Most common complaint word (simple top-word analysis)
              const complaintWords: Record<string, number> = {};
              historyRecords.forEach(r => {
                const text = r.anamnesis?.chiefComplaint || r.anamnesis?.complaintDetails || '';
                text.split(/\s+/).forEach(w => {
                  const clean = w.toLowerCase().replace(/[^a-züğışöç]/gi, '');
                  if (clean.length > 3) complaintWords[clean] = (complaintWords[clean] || 0) + 1;
                });
              });
              const topComplaint = Object.entries(complaintWords).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

              // Active medication count (unique med names across all records)
              const allMedNames = new Set<string>();
              historyRecords.forEach(r => {
                (r.medications?.medicationList || []).forEach((m: any) => {
                  if (m.name) allMedNames.add(m.name);
                });
              });

              // Repeated complaints map: complaint → count
              const complaintCounts: Record<string, number> = {};
              historyRecords.forEach(r => {
                const c = (r.anamnesis?.chiefComplaint || '').trim();
                if (c) complaintCounts[c] = (complaintCounts[c] || 0) + 1;
              });

              // Group filtered records by time period
              type Group = { label: string; records: any[] };
              const groups: Group[] = [];
              const groupMap: Record<string, any[]> = {};
              filteredRecords.forEach((record: any) => {
                const d = new Date(record.historyDate || record.createdAt);
                let label: string;
                if (d >= startOfMonth) {
                  label = 'Bu Ay';
                } else if (d >= startOfLast3Months) {
                  label = `${d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
                } else {
                  label = `${d.getFullYear()}`;
                }
                if (!groupMap[label]) { groupMap[label] = []; groups.push({ label, records: groupMap[label] }); }
                groupMap[label].push(record);
              });

              const outcomeColor = (outcome?: string) => {
                if (outcome === 'successful') return 'border-green-400';
                if (outcome === 'partially_successful') return 'border-yellow-400';
                if (outcome === 'unsuccessful') return 'border-red-400';
                if (outcome === 'ongoing') return 'border-blue-400';
                return '';
              };
              const outcomeBg = (outcome?: string) => {
                if (outcome === 'successful') return 'bg-green-100 text-green-700';
                if (outcome === 'partially_successful') return 'bg-yellow-100 text-yellow-700';
                if (outcome === 'unsuccessful') return 'bg-red-100 text-red-700';
                if (outcome === 'ongoing') return 'bg-blue-100 text-blue-700';
                return 'bg-gray-100 text-gray-700';
              };
              const outcomeLabel = (outcome?: string) => {
                if (outcome === 'successful') return 'Başarılı';
                if (outcome === 'partially_successful') return 'Kısmen Başarılı';
                if (outcome === 'unsuccessful') return 'Başarısız';
                if (outcome === 'ongoing') return 'Devam Ediyor';
                return 'Bilinmiyor';
              };

              const toggleExpand = (id: string) => {
                setExpandedHistoryIds(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                });
              };

              // ── Paylaşılan yardımcılar ─────────────────────────────────────────
              const patientLabel = patient?.fullName || 'Hasta';
              const safeDate = (d: string) => {
                if (!d) return '-';
                const dt = new Date(d);
                return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('tr-TR');
              };
              const outcomeStr = (o?: string) =>
                o === 'successful' ? 'Basarili'
                : o === 'partially_successful' ? 'Kismen Basarili'
                : o === 'unsuccessful' ? 'Basarisiz'
                : o === 'ongoing' ? 'Devam Ediyor'
                : o ? o : '-';

              // jsPDF standart fontlar Latin-1 dışı karakterleri desteklemez.
              // PDF'e giden tüm metinleri ASCII-safe hale getirir.
              const tr2ascii = (s: string): string =>
                String(s ?? '')
                  .replace(/ş/g, 's').replace(/Ş/g, 'S')
                  .replace(/ı/g, 'i').replace(/İ/g, 'I')
                  .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
                  .replace(/ü/g, 'u').replace(/Ü/g, 'U')
                  .replace(/ö/g, 'o').replace(/Ö/g, 'O')
                  .replace(/ç/g, 'c').replace(/Ç/g, 'C')
                  .replace(/—/g, '-').replace(/…/g, '...');

              // Excel satırları — Türkçe karakterler korunur (xlsx Unicode destekler)
              const buildRows = (records: any[]) => records.map(r => ({
                'Tarih': safeDate(r.historyDate),
                'Kaynak': r.source === 'anamrez' ? 'Randevu' : 'Geçmiş Kayıt',
                'Randevu Tipi': r.typeName || '-',
                'Hekim': r.selectedDoctor?.name ? `Dr. ${r.selectedDoctor.name}` : '-',
                'Şikayet': r.anamnesis?.chiefComplaint || r.anamnesis?.complaintDetails || '-',
                'Tanı Sistemleri': (r.selectedDiagnosisSystems || []).join(', ') || '-',
                'Uygulanan Uygulamalar': Array.isArray(r.appliedTreatments) ? r.appliedTreatments.join(', ') : '-',
                'Yapılmayan Uygulamalar': Array.isArray(r.unselectedTreatments) ? r.unselectedTreatments.join(', ') : '-',
                'Tedavi Notu': r.treatmentNotes || '-',
                'Protokol': r.protocolName || '-',
                'Güncel İlaçlar': r.conventionalTreatment?.currentMedications || '-',
                'Diğer Tedaviler': r.conventionalTreatment?.otherTreatments || '-',
                'İlaç Listesi': Array.isArray(r.medications?.medicationList)
                  ? r.medications.medicationList.map((m: any) => m.name).join(', ')
                  : '-',
                'Alerjiler': r.allergies || '-',
                'Geçmiş Hastalık': r.pastMedicalHistory || '-',
                'Aile Geçmişi': r.familyHistory || '-',
                'Ameliyat': r.hasSurgery === 'var' ? (r.surgicalHistory || 'Var') : 'Yok',
                'Tedavi Sonucu': outcomeStr(r.treatment?.outcome),
                'Toksisite Skoru': r.toxicityAssessment?.totalScore ?? '-',
                'Eklendi': safeDate(r.createdAt),
              }));

              // PDF satırları — tüm değerler tr2ascii ile ASCII-safe hale getirilir
              const buildPdfRows = (records: any[]) => records.map(r => ({
                'Tarih': safeDate(r.historyDate),
                'Kaynak': r.source === 'anamrez' ? 'Randevu' : 'Gecmis Kayit',
                'Randevu Tipi': tr2ascii(r.typeName || '-'),
                'Hekim': r.selectedDoctor?.name ? tr2ascii(`Dr. ${r.selectedDoctor.name}`) : '-',
                'Sikayet': tr2ascii(r.anamnesis?.chiefComplaint || r.anamnesis?.complaintDetails || '-'),
                'Uygulanan': tr2ascii(Array.isArray(r.appliedTreatments) ? r.appliedTreatments.join(', ') : '-'),
                'Yapilmayan': tr2ascii(Array.isArray(r.unselectedTreatments) ? r.unselectedTreatments.join(', ') : '-'),
                'Tedavi Notu': tr2ascii(r.treatmentNotes || '-'),
                'Protokol': tr2ascii(r.protocolName || '-'),
                'Guncel Ilaclar': tr2ascii(r.conventionalTreatment?.currentMedications || '-'),
                'Diger Tedaviler': tr2ascii(r.conventionalTreatment?.otherTreatments || '-'),
                'Ilac Listesi': tr2ascii(Array.isArray(r.medications?.medicationList)
                  ? r.medications.medicationList.map((m: any) => m.name).join(', ')
                  : '-'),
                'Alerjiler': tr2ascii(r.allergies || '-'),
                'Gecmis Hastalik': tr2ascii(r.pastMedicalHistory || '-'),
                'Aile Gecmisi': tr2ascii(r.familyHistory || '-'),
                'Ameliyat': r.hasSurgery === 'var' ? tr2ascii(r.surgicalHistory || 'Var') : 'Yok',
                'Tedavi Sonucu': tr2ascii(outcomeStr(r.treatment?.outcome)),
                'Toksisite Skoru': String(r.toxicityAssessment?.totalScore ?? '-'),
                'Eklendi': safeDate(r.createdAt),
              }));

              // ── Excel indirme ──────────────────────────────────────────────────
              const handleDownloadExcel = async () => {
                const { utils, writeFile } = await import('xlsx');
                const rows = buildRows(filteredRecords);
                const ws = utils.json_to_sheet(rows);

                // Sütun genişlikleri (başlık veya içerik, hangisi uzunsa)
                const colKeys = Object.keys(rows[0] || {});
                ws['!cols'] = colKeys.map(k => ({ wch: Math.max(k.length + 2, 20) }));

                const wb = utils.book_new();
                utils.book_append_sheet(wb, ws, 'Geçmiş Kayıtlar');

                // İkinci sayfa: hasta özeti
                const infoRows = [
                  { Alan: 'Ad Soyad', Değer: patient?.fullName || '—' },
                  { Alan: 'TC No', Değer: patient?.tcNo || '—' },
                  { Alan: 'Doğum Tarihi', Değer: safeDate(patient?.birthDate || '') },
                  { Alan: 'Cinsiyet', Değer: patient?.gender || '—' },
                  { Alan: 'Toplam Kayıt', Değer: String(historyRecords.length) },
                  { Alan: 'Gösterilen Kayıt', Değer: String(filteredRecords.length) },
                  { Alan: 'İndirme Tarihi', Değer: new Date().toLocaleDateString('tr-TR') },
                ];
                const wsInfo = utils.json_to_sheet(infoRows);
                wsInfo['!cols'] = [{ wch: 22 }, { wch: 32 }];
                utils.book_append_sheet(wb, wsInfo, 'Hasta Bilgisi');

                writeFile(wb, `${patientLabel}_gecmis_kayitlar.xlsx`);
              };

              // ── PDF indirme ────────────────────────────────────────────────────
              const handleDownloadPDF = async () => {
                const { default: jsPDF } = await import('jspdf');
                const { default: autoTable } = await import('jspdf-autotable');

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();

                // Başlık bloğu
                doc.setFillColor(109, 40, 217);
                doc.rect(0, 0, pageW, 22, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('Gecmis Kayitlar Raporu', 14, 10);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(tr2ascii(`${patient?.fullName || ''}  |  TC: ${patient?.tcNo || '-'}  |  Dogum: ${safeDate(patient?.birthDate || '')}  |  Cinsiyet: ${patient?.gender || '-'}`), 14, 17);
                doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}  |  Toplam Kayit: ${historyRecords.length}  |  Gosterilen: ${filteredRecords.length}`, pageW - 14, 17, { align: 'right' });

                const rows = buildPdfRows(filteredRecords);
                const columns = Object.keys(rows[0] || {});
                const body = rows.map(r => columns.map(c => String((r as any)[c])));

                autoTable(doc as any, {
                  startY: 26,
                  head: [columns],
                  body,
                  styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
                  headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
                  alternateRowStyles: { fillColor: [245, 243, 255] },
                  columnStyles: {
                    0: { cellWidth: 20 }, // Tarih
                    1: { cellWidth: 18 }, // Kaynak
                    2: { cellWidth: 22 }, // Randevu Tipi
                    3: { cellWidth: 25 }, // Hekim
                    4: { cellWidth: 35 }, // Şikayet
                  },
                  didDrawPage: (data: any) => {
                    // Sayfa numarası
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(
                      `Sayfa ${data.pageNumber as number}`,
                      pageW / 2,
                      doc.internal.pageSize.getHeight() - 5,
                      { align: 'center' }
                    );
                  },
                });

                doc.save(`${patientLabel}_gecmis_kayitlar.pdf`);
              };

              return (
                <div className="space-y-4">
                  {/* ── Özet İstatistik Paneli ── */}
                  {!loadingHistory && historyRecords.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
                        <span className="text-2xl font-bold text-purple-600">{totalVisits}</span>
                        <span className="text-xs text-gray-500">Toplam Kayıt</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
                        <span className="text-2xl font-bold text-blue-600">
                          {daysSinceLast === 0 ? 'Bugün' : daysSinceLast === 1 ? 'Dün' : daysSinceLast !== null ? `${daysSinceLast}g` : '—'}
                        </span>
                        <span className="text-xs text-gray-500">Son Ziyaret</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm overflow-hidden">
                        <span className="text-2xl font-bold text-orange-500 truncate capitalize">{topComplaint || '—'}</span>
                        <span className="text-xs text-gray-500">Sık Şikayet</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
                        <span className="text-2xl font-bold text-green-600">{allMedNames.size}</span>
                        <span className="text-xs text-gray-500">Farklı İlaç</span>
                      </div>
                    </div>
                  )}

                  {/* ── Ana Kart ── */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        📜 Geçmiş Kayıtları
                        <span className="text-sm font-normal text-gray-400">
                          {filteredRecords.length}/{historyRecords.length} kayıt
                        </span>
                      </h3>
                      {!loadingHistory && historyRecords.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDownloadExcel}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                            title="Geçmiş kayıtları Excel olarak indir"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <polyline points="9 15 12 18 15 15"/>
                            </svg>
                            Excel İndir
                          </button>
                          <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                            title="Geçmiş kayıtları PDF olarak indir"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <polyline points="9 15 12 18 15 15"/>
                            </svg>
                            PDF İndir
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── Filtreler & Arama ── */}
                    {!loadingHistory && historyRecords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-5">
                        {/* Kaynak filtresi */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
                          {(['all', 'anamrez', 'pastHistory'] as const).map(f => (
                            <button
                              key={f}
                              onClick={() => setHistorySourceFilter(f)}
                              className={`px-3 py-1.5 transition-colors ${historySourceFilter === f ? 'bg-purple-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {f === 'all' ? 'Tümü' : f === 'anamrez' ? 'Randevu' : 'Geçmiş Kayıt'}
                            </button>
                          ))}
                        </div>
                        {/* Tarih filtresi */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
                          {(['all', 'thisMonth', 'last3Months', 'thisYear'] as const).map(f => (
                            <button
                              key={f}
                              onClick={() => setHistoryDateFilter(f)}
                              className={`px-3 py-1.5 transition-colors ${historyDateFilter === f ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {f === 'all' ? 'Tüm Zamanlar' : f === 'thisMonth' ? 'Bu Ay' : f === 'last3Months' ? 'Son 3 Ay' : 'Bu Yıl'}
                            </button>
                          ))}
                        </div>
                        {/* Arama */}
                        <input
                          type="text"
                          placeholder="Şikayet, tedavi veya ilaç ara..."
                          value={historySearch}
                          onChange={e => setHistorySearch(e.target.value)}
                          className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                      </div>
                    )}

                    {loadingHistory ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                        <p className="text-gray-500 mt-2">Yükleniyor...</p>
                      </div>
                    ) : historyRecords.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">📜</div>
                        <h3 className="text-gray-900 text-xl font-semibold mb-2">Henüz Geçmiş Kaydı Yok</h3>
                        <p className="text-gray-600">Bu hasta için henüz geçmiş tedavi/anamnez kaydı girilmemiş.</p>
                        <p className="text-gray-500 text-sm mt-2">Hasta listesindeki 📜 butonunu kullanarak geçmiş kayıt ekleyebilirsiniz.</p>
                      </div>
                    ) : filteredRecords.length === 0 ? (
                      <div className="text-center py-10">
                        <div className="text-4xl mb-3">🔍</div>
                        <p className="text-gray-600">Seçilen filtrelere uygun kayıt bulunamadı.</p>
                        <button
                          className="mt-3 text-sm text-purple-600 underline"
                          onClick={() => { setHistorySourceFilter('all'); setHistoryDateFilter('all'); setHistorySearch(''); }}
                        >
                          Filtreleri temizle
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {groups.map(({ label, records: groupRecords }) => (
                          <div key={label}>
                            {/* Grup başlığı */}
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
                              <div className="flex-1 h-px bg-gray-100"></div>
                              <span className="text-xs text-gray-400">{groupRecords.length} kayıt</span>
                            </div>

                            {/* Timeline */}
                            <div className="relative">
                              {groupRecords.map((record: any, index: number) => {
                                const isExpanded = expandedHistoryIds.has(record.id);
                                const isAnamrez = record.source === 'anamrez';
                                const outcome = record.treatment?.outcome;
                                const borderColor = outcome ? outcomeColor(outcome) : (isAnamrez ? 'border-blue-200' : 'border-gray-200');
                                const repeatCount = complaintCounts[record.anamnesis?.chiefComplaint || ''] || 0;
                                // medications: pastHistory → { medicationList: [{name}] }, anamrez → string
                                const medNames: string[] = Array.isArray(record.medications?.medicationList)
                                  ? record.medications.medicationList.map((m: any) => m.name).filter(Boolean)
                                  : [];
                                const currentMedsText: string = record.conventionalTreatment?.currentMedications || '';
                                const otherTreatmentsText: string = record.conventionalTreatment?.otherTreatments || '';
                                // Yeni alanlar
                                const doctorName: string = record.selectedDoctor?.name || '';
                                const allergies: string = record.allergies || '';
                                const hasAllergies = allergies && allergies.toLowerCase() !== 'yok' && allergies.toLowerCase() !== 'hayır' && allergies.trim() !== '-';
                                const toxScore: number = record.toxicityAssessment?.totalScore ?? -1;
                                const hasToxicity: boolean = record.toxicityAssessment?.hasToxicity ?? false;
                                const diagSystems: string[] = record.selectedDiagnosisSystems || [];
                                const pastMedHistory: string = record.pastMedicalHistory || '';
                                const familyHistory: string = record.familyHistory || '';
                                const hasSurgery: boolean = record.hasSurgery === 'var';
                                const surgicalHistory: string = record.surgicalHistory || '';
                                const aq = record.additionalQuestions || {};
                                const lifestyleItems = [
                                  aq.smokingFrequency && aq.smokingFrequency !== 'hiç' ? { label: 'Sigara', value: aq.smokingFrequency, warn: true } : null,
                                  aq.alcoholFrequency && aq.alcoholFrequency !== 'hiç' ? { label: 'Alkol', value: aq.alcoholFrequency, warn: true } : null,
                                  aq.dailySleepHours ? { label: 'Uyku', value: `${aq.dailySleepHours} saat`, warn: false } : null,
                                  aq.exerciseFrequency ? { label: 'Egzersiz', value: aq.exerciseFrequency, warn: false } : null,
                                ].filter(Boolean) as { label: string; value: string; warn: boolean }[];

                                return (
                                  <div key={record.id} className="relative pl-8 pb-5">
                                    {/* Bağlantı çizgisi */}
                                    {index !== groupRecords.length - 1 && (
                                      <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gray-100"></div>
                                    )}

                                    {/* Zaman noktası */}
                                    <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs ${isAnamrez ? 'bg-blue-500' : 'bg-purple-500'}`}>
                                      <span className="text-white">{isAnamrez ? '📅' : '📜'}</span>
                                    </div>

                                    {/* Kart — sol kenarlık outcome rengine göre */}
                                    <div className={`rounded-xl border-l-4 ${borderColor} border border-gray-200 bg-white shadow-sm overflow-hidden`}>
                                      {/* Kart başlığı */}
                                      <div className={`px-4 py-3 flex items-center justify-between ${isAnamrez ? 'bg-blue-50' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-semibold text-gray-800 text-sm">
                                            {new Date(record.historyDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                          </span>
                                          {/* Kaynak: Randevu veya Geçmiş Kayıt */}
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isAnamrez ? 'bg-blue-200 text-blue-700' : 'bg-purple-200 text-purple-700'}`}>
                                            {isAnamrez ? 'Randevu' : 'Geçmiş Kayıt'}
                                          </span>
                                          {/* Randevu tipi (İlk Muayene / Kontrol / Tedavi vb.) */}
                                          {(record as any).typeName && (
                                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold border border-indigo-200">
                                              🏥 {(record as any).typeName}
                                            </span>
                                          )}
                                          {record.hasAnamnesis && (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">📋 Anamnez</span>
                                          )}
                                          {record.hasTreatment && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-medium">💊 Tedavi</span>
                                          )}
                                          {record.hasMedications && (
                                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-medium">💉 İlaç</span>
                                          )}
                                          {outcome && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${outcomeBg(outcome)}`}>
                                              {outcomeLabel(outcome)}
                                            </span>
                                          )}
                                          {repeatCount > 1 && (
                                            <span className="px-2 py-0.5 bg-red-50 text-red-500 border border-red-200 rounded-full text-[10px] font-medium">
                                              🔁 {repeatCount}x tekrar
                                            </span>
                                          )}
                                          {hasAllergies && (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded-full text-[10px] font-semibold">
                                              ⚠️ Alerji
                                            </span>
                                          )}
                                          {toxScore >= 0 && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                              hasToxicity
                                                ? 'bg-amber-50 text-amber-700 border-amber-300'
                                                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                            }`}>
                                              {hasToxicity ? `⚡ Toksisite ${toxScore}` : `✓ Toksisite ${toxScore}`}
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => toggleExpand(record.id)}
                                          className="ml-2 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
                                          title={isExpanded ? 'Daralt' : 'Genişlet'}
                                        >
                                          {isExpanded ? '▲' : '▼'}
                                        </button>
                                      </div>

                                      {/* ── Kart özet satırı (her zaman görünür) ── */}
                                      <div className="px-4 pt-3 pb-2 space-y-2 text-sm">

                                        {/* Şikayet */}
                                        {(record.anamnesis?.chiefComplaint || record.anamnesis?.complaintDetails) && (
                                          <div className="flex gap-2">
                                            <span className="text-gray-400 shrink-0 w-28">Şikayet</span>
                                            <span className="text-gray-700 leading-snug">
                                              {(() => {
                                                const text = record.anamnesis.chiefComplaint || record.anamnesis.complaintDetails || '';
                                                return isExpanded || text.length <= 120 ? text : text.slice(0, 120) + '…';
                                              })()}
                                            </span>
                                          </div>
                                        )}

                                        {/* Hekim */}
                                        {doctorName && (
                                          <div className="flex gap-2 items-center">
                                            <span className="text-gray-400 shrink-0 w-28">Hekim</span>
                                            <span className="text-gray-600 font-medium">Dr. {doctorName}</span>
                                          </div>
                                        )}

                                        {/* Tedaviyi Yapan */}
                                        {(record as any).performerName && (
                                          <div className="flex gap-2 items-center">
                                            <span className="text-gray-400 shrink-0 w-28">Tedaviyi Yapan</span>
                                            <span className="text-gray-600 font-medium">{(record as any).performerName}</span>
                                          </div>
                                        )}

                                        {/* Tanı sistemleri — pill listesi */}
                                        {diagSystems.length > 0 && (
                                          <div className="flex gap-2 items-start">
                                            <span className="text-gray-400 shrink-0 w-28 pt-0.5">Tanı Sistemi</span>
                                            <div className="flex flex-wrap gap-1">
                                              {diagSystems.slice(0, 3).map((s: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full text-xs">{s}</span>
                                              ))}
                                              {diagSystems.length > 3 && (
                                                <span className="px-2 py-0.5 text-gray-400 text-xs">+{diagSystems.length - 3} daha</span>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* İlaçlar (pastHistory medicationList) */}
                                        {medNames.length > 0 && (
                                          <div className="flex gap-2 items-start">
                                            <span className="text-gray-400 shrink-0 w-28 pt-0.5">İlaçlar</span>
                                            <div className="flex flex-wrap gap-1">
                                              {medNames.map((name: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-xs">{name}</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Güncel ilaçlar (conventionalTreatment) */}
                                        {currentMedsText && (
                                          <div className="flex gap-2">
                                            <span className="text-gray-400 shrink-0 w-28">Güncel İlaçlar</span>
                                            <span className="text-gray-700">
                                              {isExpanded || currentMedsText.length <= 100 ? currentMedsText : currentMedsText.slice(0, 100) + '…'}
                                            </span>
                                          </div>
                                        )}

                                        {/* Diğer tedaviler */}
                                        {otherTreatmentsText && (
                                          <div className="flex gap-2">
                                            <span className="text-gray-400 shrink-0 w-28">Diğer Tedaviler</span>
                                            <span className="text-gray-700">
                                              {isExpanded || otherTreatmentsText.length <= 100 ? otherTreatmentsText : otherTreatmentsText.slice(0, 100) + '…'}
                                            </span>
                                          </div>
                                        )}

                                        {/* Uygulanan uygulamalar (TreatmentPanel'den kaydedilen appliedTreatments) */}
                                        {Array.isArray((record as any).appliedTreatments) && (record as any).appliedTreatments.length > 0 && (
                                          <div className="flex gap-2 items-start">
                                            <span className="text-gray-400 shrink-0 w-28 pt-0.5">Uygulananlar</span>
                                            <div className="flex flex-wrap gap-1">
                                              {(record as any).appliedTreatments.map((t: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">{t}</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Yapılmayan uygulamalar */}
                                        {Array.isArray((record as any).unselectedTreatments) && (record as any).unselectedTreatments.length > 0 && (
                                          <div className="flex gap-2 items-start">
                                            <span className="text-gray-400 shrink-0 w-28 pt-0.5">Yapılmayanlar</span>
                                            <div className="flex flex-wrap gap-1">
                                              {(record as any).unselectedTreatments.map((t: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded-full text-xs line-through">{t}</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Tedavi notu */}
                                        {(record as any).treatmentNotes && (record as any).treatmentNotes !== 'Tedavi Başarı İle Uygulandı' && (
                                          <div className="flex gap-2">
                                            <span className="text-gray-400 shrink-0 w-28">Tedavi Notu</span>
                                            <span className="text-gray-600 italic">{(record as any).treatmentNotes}</span>
                                          </div>
                                        )}

                                        {/* Protokol adı / uygulanan tedavi tipi (fallback) */}
                                        {!(Array.isArray((record as any).appliedTreatments) && (record as any).appliedTreatments.length > 0) && record.treatment?.treatmentType && (
                                          <div className="flex gap-2 items-center">
                                            <span className="text-gray-400 shrink-0 w-28">Uygulanan Tedavi</span>
                                            <span className="text-gray-700">{record.treatment.treatmentType}</span>
                                          </div>
                                        )}

                                        {/* Alerji — sadece varsa, kırmızı kutu */}
                                        {hasAllergies && !isExpanded && (
                                          <div className="flex gap-2">
                                            <span className="text-gray-400 shrink-0 w-28">Alerjiler</span>
                                            <span className="text-red-600 font-medium">{allergies.slice(0, 80)}{allergies.length > 80 ? '…' : ''}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* ── Genişletilmiş detaylar (accordion) ── */}
                                      {isExpanded && (
                                        <div className="border-t border-gray-100 divide-y divide-gray-50">

                                          {/* Tıbbi geçmiş grubu */}
                                          {(pastMedHistory || familyHistory || hasSurgery || hasAllergies) && (
                                            <div className="px-4 py-3 space-y-2 text-sm">
                                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tıbbi Geçmiş</p>
                                              {hasAllergies && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Alerjiler</span>
                                                  <span className="text-red-600 font-medium">{allergies}</span>
                                                </div>
                                              )}
                                              {pastMedHistory && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Geçmiş Hastalık</span>
                                                  <span className="text-gray-700">{pastMedHistory}</span>
                                                </div>
                                              )}
                                              {familyHistory && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Aile Geçmişi</span>
                                                  <span className="text-gray-700">{familyHistory}</span>
                                                </div>
                                              )}
                                              {hasSurgery && surgicalHistory && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Ameliyat</span>
                                                  <span className="text-gray-700">{surgicalHistory}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Yaşam tarzı grubu */}
                                          {lifestyleItems.length > 0 && (
                                            <div className="px-4 py-3 text-sm">
                                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Yaşam Tarzı</p>
                                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                                {lifestyleItems.map((item, i) => (
                                                  <div key={i} className="flex gap-1.5 items-center">
                                                    <span className="text-gray-400 shrink-0">{item.label}:</span>
                                                    <span className={item.warn ? 'text-amber-600 font-medium' : 'text-gray-700'}>{item.value}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Ek bilgiler */}
                                          {(record.weight || record.height || record.diagnosis || record.notes || record.anamnesis?.complaintDetails) && (
                                            <div className="px-4 py-3 space-y-2 text-sm">
                                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ek Bilgiler</p>
                                              {record.anamnesis?.complaintDetails && record.anamnesis?.chiefComplaint && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Şikayet Detayı</span>
                                                  <span className="text-gray-700">{record.anamnesis.complaintDetails}</span>
                                                </div>
                                              )}
                                              {record.weight && record.height && (
                                                <div className="flex gap-4">
                                                  <div className="flex gap-1.5"><span className="text-gray-400">Kilo:</span><span className="text-gray-700">{record.weight} kg</span></div>
                                                  <div className="flex gap-1.5"><span className="text-gray-400">Boy:</span><span className="text-gray-700">{record.height} cm</span></div>
                                                  <div className="flex gap-1.5"><span className="text-gray-400">BMI:</span><span className="text-gray-700 font-medium">{(record.weight / ((record.height / 100) ** 2)).toFixed(1)}</span></div>
                                                </div>
                                              )}
                                              {record.diagnosis && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Tanı</span>
                                                  <span className="text-gray-700">{record.diagnosis}</span>
                                                </div>
                                              )}
                                              {record.notes && (
                                                <div className="flex gap-2">
                                                  <span className="text-gray-400 shrink-0 w-28">Notlar</span>
                                                  <span className="text-gray-500 italic">{record.notes}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Kart alt çubuğu */}
                                      <div className="px-4 py-2.5 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
                                        <span className="text-xs text-gray-400">
                                          Eklendi: {new Date(record.createdAt).toLocaleDateString('tr-TR')}
                                        </span>
                                        <button
                                          className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                                          onClick={() => {
                                            setSelectedHistoryRecord(record as any);
                                            setIsHistoryViewModalOpen(true);
                                          }}
                                        >
                                          👁️ Görüntüle
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Media Tab - Photos and Videos */}
            {activeTab === 'media' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      📷 Fotoğraf & Video Galerisi
                    </h3>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleMediaUpload}
                        disabled={uploadingMedia}
                      />
                      <span className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                        uploadingMedia 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-purple-500 hover:bg-purple-600 text-white cursor-pointer'
                      }`}>
                        {uploadingMedia ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Yükleniyor...
                          </>
                        ) : (
                          <>
                            📤 Dosya Yükle
                          </>
                        )}
                      </span>
                    </label>
                  </div>

                  <p className="text-sm text-gray-500 mb-4">
                    Hasta ile ilgili fotoğraf ve videoları buradan yükleyebilirsiniz. Desteklenen formatlar: JPG, PNG, GIF, MP4, MOV
                  </p>

                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      <span className="ml-3 text-gray-600">Dosyalar yükleniyor...</span>
                    </div>
                  ) : mediaFiles.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                      <div className="text-4xl mb-3">📁</div>
                      <p className="text-gray-600 font-medium">Henüz dosya yüklenmemiş</p>
                      <p className="text-sm text-gray-500 mt-1">Fotoğraf veya video yüklemek için yukarıdaki butonu kullanın</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {mediaFiles.map((media) => (
                        <div
                          key={media.id}
                          className="relative group rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer hover:shadow-lg transition-all duration-200"
                          onClick={() => setSelectedMedia(media)}
                        >
                          {media.type === 'image' ? (
                            <img
                              src={media.url}
                              alt={media.name}
                              className="w-full h-40 object-cover"
                            />
                          ) : (
                            <div className="w-full h-40 bg-gray-900 flex items-center justify-center relative">
                              <video
                                src={media.url}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                  <span className="text-2xl">▶️</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-white text-xs truncate">{media.name}</p>
                            <p className="text-white/70 text-xs">
                              {new Date(media.uploadedAt).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              media.type === 'image' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                            }`}>
                              {media.type === 'image' ? '📷 Foto' : '🎬 Video'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMedia(media);
                              }}
                              className="w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center hover:scale-110"
                              title="Sil"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Media Preview Modal */}
            {selectedMedia && (
              <div 
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]"
                onClick={() => setSelectedMedia(null)}
              >
                <div className="max-w-4xl max-h-[90vh] p-4">
                  <button
                    onClick={() => setSelectedMedia(null)}
                    className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
                  >
                    ✕
                  </button>
                  {selectedMedia.type === 'image' ? (
                    <img
                      src={selectedMedia.url}
                      alt={selectedMedia.name}
                      className="max-w-full max-h-[85vh] object-contain rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <video
                      src={selectedMedia.url}
                      controls
                      autoPlay
                      className="max-w-full max-h-[85vh] rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <p className="text-white text-center mt-3">{selectedMedia.name}</p>
                </div>
              </div>
            )}

            {/* Address Information Tab */}
            {activeTab === 'address' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 Adres Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Tam Adres</label>
                      <p className="font-semibold text-gray-800 mt-1">{patient.address}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">Kayıtlı İl</label>
                        <p className="font-semibold text-gray-800">{patient.registeredProvince}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Doğum Yeri</label>
                        <p className="font-semibold text-gray-800">{patient.birthPlace}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

             {/* Notes Tab */}
             {activeTab === 'notes' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📝 Hasta Notları
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                      <p className="font-semibold text-gray-800 mt-1">
                        {patient.visitReason || 'Not eklenmemiş'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Genel Notlar</label>
                      <textarea
                        className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        rows={4}
                        placeholder="Hasta hakkında notlar ekleyin..."
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📋 Not Geçmişi
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <p className="text-sm text-gray-800">Hasta kaydı oluşturuldu</p>
                        <span className="text-xs text-gray-500">{formatDate(patient.createdAt)}</span>
                      </div>
                    </div>
                    {patient.updatedAt !== patient.createdAt && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <p className="text-sm text-gray-800">Hasta bilgileri güncellendi</p>
                          <span className="text-xs text-gray-500">{formatDate(patient.updatedAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Survey Results Tab */}
            {activeTab === 'survey' && patient.dischargeSurvey && (
              <div className="space-y-6">
                {/* Average Rating Card */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200 shadow-sm text-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center justify-center gap-2">
                    📊 Genel Memnuniyet Skoru
                  </h3>
                  <div className="flex items-center justify-center gap-4">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg">
                      <span className="text-3xl font-bold text-white">
                        {patient.dischargeSurvey.averageRating.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-2xl">
                        {patient.dischargeSurvey.averageRating >= 4.5 ? '🤩' :
                         patient.dischargeSurvey.averageRating >= 3.5 ? '😊' :
                         patient.dischargeSurvey.averageRating >= 2.5 ? '😐' :
                         patient.dischargeSurvey.averageRating >= 1.5 ? '😕' : '😞'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {patient.dischargeSurvey.averageRating >= 4.5 ? 'Mukemmel' :
                         patient.dischargeSurvey.averageRating >= 3.5 ? 'Iyi' :
                         patient.dischargeSurvey.averageRating >= 2.5 ? 'Orta' :
                         patient.dischargeSurvey.averageRating >= 1.5 ? 'Kotu' : 'Cok Kotu'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">5 uzerinden</p>
                    </div>
                  </div>
                  {patient.dischargeSurvey.completedAt && (
                    <p className="text-xs text-gray-500 mt-4">
                      Anket Tarihi: {new Date(patient.dischargeSurvey.completedAt).toLocaleDateString('tr-TR', {
                        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>

                {/* Individual Ratings */}
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📋 Soru Detaylari
                  </h3>
                  <div className="space-y-4">
                    {[
                      { id: 'overall_satisfaction', question: 'Genel tedavi surecinizden ne kadar memnun kaldiniz?', icon: '😊' },
                      { id: 'staff_friendliness', question: 'Personelimizin ilgi ve alakasini nasil degerlendirirsiniz?', icon: '👨‍⚕️' },
                      { id: 'treatment_effectiveness', question: 'Uygulanan tedavinin etkisini nasil degerlendirirsiniz?', icon: '💊' },
                      { id: 'cleanliness', question: 'Klinigin hijyen ve temizligini nasil degerlendirirsiniz?', icon: '✨' },
                      { id: 'recommendation', question: 'Klinigimizi yakinlariniza tavsiye eder misiniz?', icon: '🌟' }
                    ].map((q) => {
                      const rating = patient.dischargeSurvey!.ratings[q.id] || 0;
                      const ratingLabel = ['', 'Cok Kotu', 'Kotu', 'Orta', 'Iyi', 'Mukemmel'][rating] || '';
                      const ratingEmoji = ['', '😞', '😕', '😐', '😊', '🤩'][rating] || '';
                      const barColor = rating >= 4 ? 'bg-green-500' : rating === 3 ? 'bg-yellow-500' : 'bg-red-500';

                      return (
                        <div key={q.id} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xl">{q.icon}</span>
                              <span className="text-sm text-gray-700">{q.question}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <span className="text-lg">{ratingEmoji}</span>
                              <span className="text-sm font-semibold text-gray-800">{ratingLabel}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`${barColor} h-2 rounded-full transition-all duration-500`}
                              style={{ width: `${(rating / 5) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-xs text-gray-400">1</span>
                            <span className="text-xs font-medium text-gray-600">{rating}/5</span>
                            <span className="text-xs text-gray-400">5</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Feedback */}
                {patient.dischargeSurvey.additionalFeedback && (
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      💬 Ek Geri Bildirim
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-purple-500">
                      <p className="text-gray-700 italic whitespace-pre-wrap">
                        "{patient.dischargeSurvey.additionalFeedback}"
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Son güncelleme: {formatDate(patient.updatedAt)}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 font-medium transition-all duration-200"
              >
                Kapat
              </button>
              <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-all duration-200" onClick={handlePrint}>
                Yazdır
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Past History View Modal - Using AnamrezViewModal */}
      <AnamrezViewModal
        isOpen={isHistoryViewModalOpen}
        onClose={() => {
          setIsHistoryViewModalOpen(false);
          setSelectedHistoryRecord(null);
        }}
        patient={patient}
        anamrezRecord={selectedHistoryRecord}
      />

      {/* Prescription Change Editor */}
      {showPrescriptionEditor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">💉 Reçeteyi Değiştir</h3>
              <button onClick={() => setShowPrescriptionEditor(false)} className="text-gray-500 hover:text-gray-700 text-xl font-bold">✕</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-gray-500">
                Değişiklik kaydedildiğinde hasta tekrar eczane kuyruğuna eklenir ve yeni ilaç eczanede satışa hazır olur.
                Önceki reçete geçmişte saklanır.
              </p>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">İlaçlar</label>
                {editMeds.map((m, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={m.name}
                      onChange={(e) => setEditMeds(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">İlaç seçin...</option>
                      {withCurrent(medicationOptions, m.name).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <select
                      value={m.dosage || ''}
                      onChange={(e) => setEditMeds(prev => prev.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))}
                      className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Doz seçin...</option>
                      {withCurrent(DOSE_OPTIONS, m.dosage).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setEditMeds(prev => prev.filter((_, j) => j !== i))}
                      className="px-2 py-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Kaldır"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setEditMeds(prev => [...prev, { name: '', dosage: '', type: 'Değişiklik' }])}
                  className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                >
                  + İlaç Ekle
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Talimatı Veren (Doktor/Asistan)</label>
                <select
                  value={instructedBy}
                  onChange={(e) => setInstructedBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Talimatı veren kişiyi seçin...</option>
                  {withCurrent(staffOptions, instructedBy).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Değişiklik Nedeni / Notu</label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={2}
                  placeholder="Reçete neden değiştirildi?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setShowPrescriptionEditor(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 font-medium transition-all"
              >
                İptal
              </button>
              <button
                onClick={savePrescriptionChange}
                disabled={savingPrescription}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
              >
                {savingPrescription ? 'Kaydediliyor...' : '💾 Kaydet ve Eczaneye Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDetailsModal;
