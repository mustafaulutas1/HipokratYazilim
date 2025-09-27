import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

// Define interfaces to match TreatmentProtocols structure
interface SymptomCondition {
  symptomKey: string;
  symptomLabel: string;
  threshold: number;
}

interface TreatmentPhase {
  treatment: string;
  dosage: string;
}

interface SavedProtocol {
  id: string;
  name: string;
  diagnosisSystem: string;
  ageGroup: '2-7' | '8-14' | 'adult';

  phases: {
    remember: TreatmentPhase;
    regeneration1: TreatmentPhase;
    regeneration2: TreatmentPhase;
    regeneration3?: TreatmentPhase;
    regeneration4?: TreatmentPhase;
    mainTreatments: { treatment: string; description: string }[];
  };

  frequency: string;
  symptomConditions: SymptomCondition[];
  toxicityRequired: boolean;
  conditionsLogic: 'any' | 'all';
  clinicId: string;
  priority: number;
  control: string;
  createdBy: string;
  createdAt: string;

  // Patient-specific fields (optional)
  patientId?: string;
  originalProtocolId?: string;
  customizedAt?: string;
  customizedBy?: string;
  isCustomized?: boolean;
}

interface Patient {
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
}

interface TreatmentOptions {
  protocol?: string;
  notes?: string;
  protocolId?: string;
  protocolName?: string;
  isCustomized?: boolean;
  originalProtocolId?: string;
  selectedProtocol?: SavedProtocol;
  customizedProtocol?: SavedProtocol;
  selectedMainApplications?: string[];
  // Will be expanded later with specific treatment options
}

interface AnamrezData {
  selectedDiagnosisSystems: string[];
  complaintDetails: string;
  symptomRatings?: Record<string, number>;
  toxicityAssessment?: {
    totalScore: number;
    ratedSymptomsCount: number;
    hasToxicity: boolean;
  };
}

interface TreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onStartTreatment: (patient: Patient, treatmentOptions: TreatmentOptions) => void;
}

const TreatmentModal: React.FC<TreatmentModalProps> = ({
  isOpen,
  onClose,
  patient,
  onStartTreatment
}) => {
  const [selectedTreatmentOptions] = useState<TreatmentOptions>({});
  const [loading, setLoading] = useState(false);
  const [anamrezData, setAnamrezData] = useState<AnamrezData | null>(null);
  const [fetchingAnamnez, setFetchingAnamnez] = useState(false);
  const [savedProtocols, setSavedProtocols] = useState<SavedProtocol[]>([]);
  const [fetchingProtocols, setFetchingProtocols] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProtocol, setEditedProtocol] = useState<SavedProtocol | null>(null);
  const [selectedMainApplications, setSelectedMainApplications] = useState<string[]>([]);

  // Helper function to get patient age group
  const getPatientAgeGroup = (birthDate: string): string => {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    if (age >= 2 && age <= 7) return '2-7';
    if (age >= 8 && age <= 14) return '8-14';
    return 'adult';
  };

  // Fetch saved protocols from Firestore (including patient-specific ones)
  const fetchSavedProtocols = async () => {
    if (!patient?.clinicId) return;

    try {
      setFetchingProtocols(true);
      console.log('🔍 TreatmentModal: Fetching protocols for clinicId:', patient.clinicId);

      // Fetch general clinic protocols
      const protocolsRef = collection(db, 'treatmentProtocols');
      const q = query(
        protocolsRef,
        where('clinicId', '==', patient.clinicId)
      );

      const querySnapshot = await getDocs(q);
      const protocols: SavedProtocol[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        protocols.push({
          id: doc.id,
          ...data
        } as SavedProtocol);
      });

      // Fetch patient's customized protocol from patient record
      console.log('🔍 TreatmentModal: Checking patient record for customized protocol:', {
        patientId: patient.id
      });

      const patientRef = doc(db, 'patients', patient.id);
      const patientDoc = await getDoc(patientRef);

      if (patientDoc.exists()) {
        const patientData = patientDoc.data();

        if (patientData.customizedProtocol) {
          console.log('🔍 TreatmentModal: Found customized protocol in patient record:', {
            name: patientData.customizedProtocol.name,
            diagnosisSystem: patientData.customizedProtocol.diagnosisSystem,
            ageGroup: patientData.customizedProtocol.ageGroup,
            isCustomized: patientData.customizedProtocol.isCustomized,
            customizedAt: patientData.customizedProtocol.customizedAt,
            phases: patientData.customizedProtocol.phases ? Object.keys(patientData.customizedProtocol.phases) : 'no phases'
          });

          protocols.push({
            id: `patient_${patient.id}_custom`,
            ...patientData.customizedProtocol,
            isCustomized: true
          } as SavedProtocol);
        } else {
          console.log('🔍 TreatmentModal: No customized protocol found in patient record');
        }
      } else {
        console.log('🔍 TreatmentModal: Patient record not found');
      }

      // Sort by priority (highest first), but prioritize customized protocols
      protocols.sort((a, b) => {
        // Customized protocols get highest priority
        if (a.isCustomized && !b.isCustomized) return -1;
        if (!a.isCustomized && b.isCustomized) return 1;
        // Then by priority number
        return (b.priority || 0) - (a.priority || 0);
      });

      console.log('✅ TreatmentModal: Fetched protocols:', protocols.length);
      console.log('📋 TreatmentModal: All protocols summary:', protocols.map(p => ({
        id: p.id,
        name: p.name,
        diagnosisSystem: p.diagnosisSystem,
        ageGroup: p.ageGroup,
        patientId: p.patientId || 'none',
        isCustomized: p.isCustomized || false,
        priority: p.priority
      })));
      setSavedProtocols(protocols);
    } catch (error) {
      console.error('❌ TreatmentModal: Error fetching protocols:', error);
    } finally {
      setFetchingProtocols(false);
    }
  };

  // Helper function to check if treatment requirements are met
  const meetsTreatmentRequirements = (protocol: SavedProtocol): boolean => {
    const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
    const symptomRatings = anamrezData?.symptomRatings || {};

    // Build all conditions that need to be checked
    const allConditions = [];

    // Add toxicity condition if required
    if (protocol.toxicityRequired) {
      allConditions.push(hasHighToxicity);
    }

    // Add symptom conditions
    if (protocol.symptomConditions && protocol.symptomConditions.length > 0) {
      const symptomResults = protocol.symptomConditions.map(condition => {
        const patientRating = symptomRatings[condition.symptomKey] || 0;
        return patientRating >= condition.threshold;
      });
      allConditions.push(...symptomResults);
    }

    // If no conditions at all, protocol is always applicable
    if (allConditions.length === 0) {
      return true;
    }

    // Apply logic based on conditions
    if (protocol.conditionsLogic === 'all') {
      // ALL conditions (toxicity + symptoms) must be met
      return allConditions.every(result => result);
    } else {
      // ANY condition (toxicity OR symptoms) can be met
      // But if both toxicity and symptoms exist, we need to handle them properly
      if (protocol.toxicityRequired && protocol.symptomConditions?.length > 0) {
        // Either toxicity OR any symptom condition
        return hasHighToxicity || protocol.symptomConditions.some(condition => {
          const patientRating = symptomRatings[condition.symptomKey] || 0;
          return patientRating >= condition.threshold;
        });
      } else {
        // Just check all conditions with ANY logic
        return allConditions.some(result => result);
      }
    }
  };

  // Helper function to build treatment sequence from protocol phases
  const buildTreatmentSequence = (protocol: SavedProtocol) => {
    let sequence = [];
    let order = 1;

    // Add core phases
    sequence.push({
      phase: 'Remember',
      treatment: protocol.phases.remember.treatment,
      dosage: protocol.phases.remember.dosage,
      order: order++
    });

    sequence.push({
      phase: '1 Regeneration',
      treatment: protocol.phases.regeneration1.treatment,
      dosage: protocol.phases.regeneration1.dosage,
      order: order++
    });

    sequence.push({
      phase: '2 Regeneration',
      treatment: protocol.phases.regeneration2.treatment,
      dosage: protocol.phases.regeneration2.dosage,
      order: order++
    });

    // Add optional regeneration phases if they exist
    if (protocol.phases.regeneration3) {
      sequence.push({
        phase: '3 Regeneration',
        treatment: protocol.phases.regeneration3.treatment,
        dosage: protocol.phases.regeneration3.dosage,
        order: order++
      });
    }

    if (protocol.phases.regeneration4) {
      sequence.push({
        phase: '4 Regeneration',
        treatment: protocol.phases.regeneration4.treatment,
        dosage: protocol.phases.regeneration4.dosage,
        order: order++
      });
    }

    // Add main treatments
    protocol.phases.mainTreatments.forEach((mainTreatment) => {
      sequence.push({
        phase: 'Main Treatment',
        treatment: mainTreatment.treatment,
        dosage: protocol.frequency, // Use protocol frequency as dosage
        description: mainTreatment.description,
        order: order++
      });
    });

    return sequence;
  };

  // Helper function to get treatments for each selected diagnosis system
  const getTreatmentsForAllSystems = () => {
    if (!anamrezData?.selectedDiagnosisSystems || !patient) return [];

    console.log('🔍 TreatmentModal: Getting treatments for systems:', anamrezData.selectedDiagnosisSystems);
    console.log('🔍 TreatmentModal: Available protocols:', savedProtocols.length);
    console.log('🔍 TreatmentModal: All available protocols:', savedProtocols.map(p => ({
      id: p.id,
      name: p.name,
      diagnosisSystem: p.diagnosisSystem,
      ageGroup: p.ageGroup,
      patientId: p.patientId || 'NONE',
      isCustomized: p.isCustomized || false,
      priority: p.priority
    })));

    const treatmentsBySystem: { [key: string]: any } = {};
    const patientAgeGroup = getPatientAgeGroup(patient.birthDate);

    anamrezData.selectedDiagnosisSystems.forEach(system => {
      console.log('🔍 TreatmentModal: Processing system:', system);
      console.log('🔍 TreatmentModal: Patient ID:', patient.id);
      console.log('🔍 TreatmentModal: Patient age group:', patientAgeGroup);

      // Debug all protocols for this system first
      const systemProtocolsAll = savedProtocols.filter(protocol => protocol.diagnosisSystem === system);
      console.log('🔍 TreatmentModal: All protocols for system', system, ':', systemProtocolsAll.map(p => ({
        id: p.id,
        name: p.name,
        ageGroup: p.ageGroup,
        patientId: p.patientId || 'NONE',
        isCustomized: p.isCustomized || false
      })));

      // FIRST: Look for patient-specific customized protocols
      const patientSpecificProtocols = savedProtocols.filter(protocol => {
        const matches = protocol.diagnosisSystem === system &&
                       protocol.ageGroup === patientAgeGroup &&
                       protocol.patientId === patient.id &&
                       protocol.isCustomized === true;

        console.log('🔍 TreatmentModal: Checking protocol', protocol.name, 'for patient match:', {
          diagnosisSystemMatch: protocol.diagnosisSystem === system,
          ageGroupMatch: protocol.ageGroup === patientAgeGroup,
          patientIdMatch: protocol.patientId === patient.id,
          isCustomized: protocol.isCustomized === true,
          overallMatch: matches
        });

        return matches;
      });

      console.log('🔍 TreatmentModal: Found patient-specific protocols for', system, ':', patientSpecificProtocols.length);
      if (patientSpecificProtocols.length > 0) {
        console.log('🎯 TreatmentModal: Patient-specific protocols:', patientSpecificProtocols.map(p => ({
          id: p.id,
          name: p.name,
          patientId: p.patientId,
          isCustomized: p.isCustomized
        })));
      }

      // SECOND: If no patient-specific found, look for general clinic protocols
      const generalProtocols = patientSpecificProtocols.length === 0
        ? savedProtocols.filter(protocol =>
            protocol.diagnosisSystem === system &&
            protocol.ageGroup === patientAgeGroup &&
            !protocol.patientId // General clinic protocols don't have patientId
          )
        : [];

      console.log('🔍 TreatmentModal: Found general protocols for', system, ':', generalProtocols.length);
      if (generalProtocols.length > 0) {
        console.log('🎯 TreatmentModal: General protocols:', generalProtocols.map(p => ({
          id: p.id,
          name: p.name,
          isCustomized: p.isCustomized || false
        })));
      }

      // Use patient-specific if available, otherwise use general
      const systemProtocols = patientSpecificProtocols.length > 0 ? patientSpecificProtocols : generalProtocols;

      const applicableProtocols = [];

      systemProtocols.forEach(protocol => {
        // Check if protocol requirements are met
        const meetsRequirements = meetsTreatmentRequirements(protocol);

        console.log('🔍 TreatmentModal: Protocol', protocol.name, 'meets requirements:', meetsRequirements,
                   'isCustomized:', protocol.isCustomized || false);

        if (meetsRequirements) {
          // Build treatment sequence from protocol phases
          const treatmentSequence = buildTreatmentSequence(protocol);

          applicableProtocols.push({
            ...protocol,
            system,
            patientAgeGroup,
            treatmentSequence,
            isCustomized: protocol.isCustomized || false, // Ensure isCustomized is explicitly set
            // Format for compatibility with existing UI
            ageGroupData: {
              sessions: protocol.frequency,
              frequency: protocol.frequency,
              treatmentSequence: treatmentSequence
            }
          });
        }
      });

      // Sort by priority and get the best protocol for this system
      if (applicableProtocols.length > 0) {
        const sortedProtocols = applicableProtocols.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        treatmentsBySystem[system] = sortedProtocols[0]; // Best protocol for this system
        console.log('✅ TreatmentModal: Selected protocol for', system, ':', sortedProtocols[0].name,
                   'isCustomized:', sortedProtocols[0].isCustomized || false);
      } else {
        console.log('⚠️ TreatmentModal: No applicable protocols found for', system);
      }
    });

    const result = Object.values(treatmentsBySystem);
    console.log('✅ TreatmentModal: Final treatment recommendations:', result.length);
    return result;
  };

  // Fetch anamnez data and protocols when modal opens
  useEffect(() => {
    const fetchData = async () => {
      if (!patient || !isOpen) return;

      // Fetch anamnez data
      setFetchingAnamnez(true);
      try {
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        const querySnapshot = await getDocs(anamrezQuery);

        if (!querySnapshot.empty) {
          const data = querySnapshot.docs[0].data();
          setAnamrezData({
            selectedDiagnosisSystems: data.selectedDiagnosisSystems || [],
            complaintDetails: data.complaintDetails || '',
            symptomRatings: data.symptomRatings || {},
            toxicityAssessment: data.toxicityAssessment || null
          });
        }
      } catch (error) {
        console.error('Anamnez verisi yüklenirken hata:', error);
      } finally {
        setFetchingAnamnez(false);
      }

      // Fetch protocols
      await fetchSavedProtocols();
    };

    fetchData();
  }, [patient, isOpen]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAnamrezData(null);
      setSavedProtocols([]);
      setSelectedMainApplications([]);
    }
  }, [isOpen]);

  // Handle main application selection
  const handleMainApplicationToggle = (applicationName: string) => {
    setSelectedMainApplications(prev =>
      prev.includes(applicationName)
        ? prev.filter(name => name !== applicationName)
        : [...prev, applicationName]
    );
  };

  if (!isOpen || !patient) return null;

  // Start editing a protocol for this patient
  const handleEditProtocol = (protocol: SavedProtocol) => {
    setEditedProtocol({
      ...protocol,
      // Make it patient-specific
      id: `${protocol.id}_patient_${patient.id}`,
      name: `${protocol.name} (${patient.fullName} için özelleştirildi)`,
      patientId: patient.id,
      originalProtocolId: protocol.id,
      customizedAt: new Date().toISOString(),
      customizedBy: 'Dr. ' // You can get this from user context
    });
    setIsEditing(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedProtocol(null);
  };

  // Add 3 Regeneration phase
  const handleAdd3Regeneration = () => {
    if (!editedProtocol) return;
    setEditedProtocol({
      ...editedProtocol,
      phases: {
        ...editedProtocol.phases,
        regeneration3: { treatment: 'DTX-19', dosage: '3X1 TK' }
      }
    });
  };

  // Remove 3 Regeneration phase
  const handleRemove3Regeneration = () => {
    if (!editedProtocol) return;
    const { regeneration3, ...restPhases } = editedProtocol.phases;
    setEditedProtocol({
      ...editedProtocol,
      phases: restPhases
    });
  };

  // Add 4 Regeneration phase
  const handleAdd4Regeneration = () => {
    if (!editedProtocol) return;
    setEditedProtocol({
      ...editedProtocol,
      phases: {
        ...editedProtocol.phases,
        regeneration4: { treatment: 'SDS-X', dosage: '3X1 T' }
      }
    });
  };

  // Remove 4 Regeneration phase
  const handleRemove4Regeneration = () => {
    if (!editedProtocol) return;
    const { regeneration4, ...restPhases } = editedProtocol.phases;
    setEditedProtocol({
      ...editedProtocol,
      phases: restPhases
    });
  };

  // Save customized protocol for this patient (ONLY SAVE, DO NOTHING ELSE)
  const handleSaveCustomProtocol = async () => {
    if (!editedProtocol || !patient) return;

    try {
      setLoading(true);

      // Update patient record directly with customized protocol
      const patientRef = doc(db, 'patients', patient.id);

      const customizedProtocolData = {
        ...editedProtocol,
        patientId: patient.id,
        patientName: patient.fullName,
        originalProtocolId: editedProtocol.originalProtocolId,
        customizedAt: new Date().toISOString(),
        customizedBy: editedProtocol.customizedBy || 'Dr.', // You can get this from user context
        isCustomized: true
      };

      console.log('💾 TreatmentModal: About to save customized protocol to patient record:', {
        patientId: patient.id,
        patientName: patient.fullName,
        protocolName: customizedProtocolData.name,
        diagnosisSystem: customizedProtocolData.diagnosisSystem,
        ageGroup: customizedProtocolData.ageGroup,
        isCustomized: customizedProtocolData.isCustomized,
        phases: customizedProtocolData.phases ? Object.keys(customizedProtocolData.phases) : 'no phases'
      });

      // Update patient record with customized protocol
      await updateDoc(patientRef, {
        customizedProtocol: customizedProtocolData,
        customizedProtocolAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log('✅ Patient record updated with customized protocol');

      // Exit editing mode after successful save
      setIsEditing(false);
      setEditedProtocol(null);

      // Refresh protocols to include the saved customized version
      await fetchSavedProtocols();

      alert('Protokol başarıyla kaydedildi ve hastaya atandı!');

    } catch (error) {
      console.error('❌ Error saving customized protocol:', error);
      alert('Özelleştirilmiş protokol kaydedilirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // Start treatment with saved customized protocol
  const handleStartTreatmentWithCustomProtocol = async () => {
    if (!editedProtocol || !patient) return;

    try {
      setLoading(true);

      const customizedTreatmentOptions = {
        protocolId: editedProtocol.id,
        protocolName: editedProtocol.name,
        isCustomized: true,
        originalProtocolId: editedProtocol.originalProtocolId,
        customizedProtocol: editedProtocol,
        selectedMainApplications: selectedMainApplications
      };

      await onStartTreatment(patient, customizedTreatmentOptions);
      onClose();

    } catch (error) {
      console.error('❌ Error starting treatment:', error);
      alert('Tedaviye başlarken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTreatment = async () => {
    const allTreatments = getTreatmentsForAllSystems();
    if (allTreatments.length === 0) return;

    const selectedProtocol = allTreatments[0]; // First (best) protocol

    setLoading(true);
    try {
      const treatmentOptions = {
        protocolId: selectedProtocol.id,
        protocolName: selectedProtocol.name,
        isCustomized: false,
        selectedProtocol: selectedProtocol,
        selectedMainApplications: selectedMainApplications
      };

      await onStartTreatment(patient, treatmentOptions);
      onClose();
    } catch (error) {
      console.error('Error starting treatment:', error);
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[95vh] overflow-y-auto shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                🏥 Tedavi Başlatma
              </h2>
              <p className="text-gray-600">
                {patient.fullName} için tedavi seçeneklerini belirleyin
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all duration-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Patient Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
              <span className="text-lg">👤</span>
              Hasta Özeti
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-3">
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">Ad Soyad:</span> {patient.fullName}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">TC No:</span> {patient.tcNo}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">Yaş:</span> {patient.birthDate ?
                    new Date().getFullYear() - new Date(patient.birthDate).getFullYear() : 'Belirtilmemiş'
                  }
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">Cinsiyet:</span> {patient.gender === 'male' ? 'Erkek' : 'Kadın'}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">Geliş Nedeni:</span> {
                    fetchingAnamnez
                      ? 'Yükleniyor...'
                      : anamrezData?.complaintDetails || patient.visitReason || 'Belirtilmemiş'
                  }
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-900">Atanma Tarihi:</span> {formatDate(patient.assignedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Diagnosis Systems */}
          {fetchingAnamnez ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                <span className="text-lg">🔍</span>
                Seçilen Tanı Sistemleri
              </h3>
              <div className="text-gray-600">Tanı sistemleri yükleniyor...</div>
            </div>
          ) : (
            anamrezData?.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  Seçilen Tanı Sistemleri
                </h3>
                <div className="flex flex-wrap gap-3">
                  {anamrezData.selectedDiagnosisSystems.map((system, index) => (
                    <span
                      key={index}
                      className="px-4 py-2 bg-blue-100 border border-blue-300 text-blue-800 text-sm rounded-lg font-medium"
                    >
                      {system}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Treatment Options */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h3 className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
              <span className="text-lg">💊</span>
              Tedavi Seçenekleri
            </h3>

            <div className="space-y-4">
              {(fetchingAnamnez || fetchingProtocols) ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">
                    {fetchingAnamnez ? 'Anamnez verileri yükleniyor...' : 'Tedavi protokolleri yükleniyor...'}
                  </p>
                </div>
              ) : (
                <>
                  {(() => {
                    const allTreatments = getTreatmentsForAllSystems();

                    if (!allTreatments || allTreatments.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <div className="text-4xl mb-4">🔍</div>
                          <h4 className="text-gray-700 text-lg font-semibold mb-2">
                            Uygun Tedavi Bulunamadı
                          </h4>
                          <p className="text-gray-600 text-sm mb-4">
                            Hasta durumuna uygun tedavi protokolü bulunamadı.
                          </p>
                          <div className="text-sm text-gray-500">
                            {anamrezData?.symptomRatings?.stres && (
                              <p>Stres değeri: {anamrezData.symptomRatings.stres}/10</p>
                            )}
                            {anamrezData?.selectedDiagnosisSystems?.length > 0 && (
                              <p>Tanı sistemleri: {anamrezData.selectedDiagnosisSystems.join(', ')}</p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Patient Info Summary */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                          <h5 className="font-medium text-blue-900 mb-2">Hasta Durumu & Tedavi Kriterleri</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-blue-700 font-medium">Yaş Grubu:</span>
                              <span className="ml-2 text-blue-900">{getPatientAgeGroup(patient.birthDate)}</span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Tanı Sistemleri:</span>
                              <span className="ml-2 text-blue-900">{anamrezData?.selectedDiagnosisSystems?.length || 0}</span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Stres Değeri:</span>
                              <span className={`ml-2 font-medium ${
                                (anamrezData?.symptomRatings?.stres || 0) >= 7
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}>
                                {anamrezData?.symptomRatings?.stres || 0}/10
                              </span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-medium">Toksisite:</span>
                              <span className={`ml-2 font-medium ${
                                anamrezData?.toxicityAssessment?.hasToxicity
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}>
                                {anamrezData?.toxicityAssessment?.hasToxicity ? 'Yüksek' : 'Normal'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Show editing interface or normal display */}
                        {isEditing && editedProtocol ? (
                          <div className="mb-8">
                            {/* Editing Header */}
                            <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-t-2xl p-6">
                              <div className="text-center">
                                <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                                  ✏️ Protokol Düzenleniyor - {patient.fullName}
                                </h3>
                                <p className="text-white/90 text-lg font-medium mb-4">
                                  <input
                                    type="text"
                                    value={editedProtocol.name}
                                    onChange={(e) => setEditedProtocol({...editedProtocol, name: e.target.value})}
                                    className="bg-white/20 text-white placeholder-white/70 border border-white/30 rounded-lg px-4 py-2 w-full max-w-md text-center"
                                    placeholder="Protokol adı"
                                  />
                                </p>
                                <div className="flex items-center justify-center gap-6 text-sm">
                                  <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                    👤 {editedProtocol.ageGroup === 'adult' ? 'Yetişkin' : `${editedProtocol.ageGroup} Yaş`}
                                  </span>
                                  <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                    ⚡ Öncelik: {editedProtocol.priority}
                                  </span>
                                  <input
                                    type="text"
                                    value={editedProtocol.frequency}
                                    onChange={(e) => setEditedProtocol({...editedProtocol, frequency: e.target.value})}
                                    className="bg-white/20 text-white placeholder-white/70 border border-white/30 rounded-full px-4 py-2 text-sm font-medium text-center w-32"
                                    placeholder="Frekans"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Editable Treatment Phases */}
                            <div className="bg-white border-x border-gray-200 p-6">
                              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                💊 Tedavi Fazları (Düzenlenebilir)
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                                {/* Editable Remember */}
                                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">R</div>
                                    <h5 className="font-bold text-red-700">Remember</h5>
                                  </div>
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.remember.treatment}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        remember: { ...editedProtocol.phases.remember, treatment: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2"
                                  />
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.remember.dosage}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        remember: { ...editedProtocol.phases.remember, dosage: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                                  />
                                </div>

                                {/* Editable 1 Regeneration */}
                                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                                    <h5 className="font-bold text-orange-700">1 Regeneration</h5>
                                  </div>
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.regeneration1.treatment}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        regeneration1: { ...editedProtocol.phases.regeneration1, treatment: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2"
                                  />
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.regeneration1.dosage}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        regeneration1: { ...editedProtocol.phases.regeneration1, dosage: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                                  />
                                </div>

                                {/* Editable 2 Regeneration */}
                                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                                    <h5 className="font-bold text-yellow-700">2 Regeneration</h5>
                                  </div>
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.regeneration2.treatment}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        regeneration2: { ...editedProtocol.phases.regeneration2, treatment: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2"
                                  />
                                  <input
                                    type="text"
                                    value={editedProtocol.phases.regeneration2.dosage}
                                    onChange={(e) => setEditedProtocol({
                                      ...editedProtocol,
                                      phases: {
                                        ...editedProtocol.phases,
                                        regeneration2: { ...editedProtocol.phases.regeneration2, dosage: e.target.value }
                                      }
                                    })}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                                  />
                                </div>

                                {/* Optional 3 Regeneration */}
                                {editedProtocol.phases.regeneration3 ? (
                                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 relative">
                                    <button
                                      onClick={handleRemove3Regeneration}
                                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                                      title="3 Regeneration fazını kaldır"
                                    >
                                      ×
                                    </button>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                                      <h5 className="font-bold text-green-700">3 Regeneration</h5>
                                    </div>
                                    <input
                                      type="text"
                                      value={editedProtocol.phases.regeneration3.treatment}
                                      onChange={(e) => setEditedProtocol({
                                        ...editedProtocol,
                                        phases: {
                                          ...editedProtocol.phases,
                                          regeneration3: { ...editedProtocol.phases.regeneration3, treatment: e.target.value }
                                        }
                                      })}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2"
                                      placeholder="Tedavi adı"
                                    />
                                    <input
                                      type="text"
                                      value={editedProtocol.phases.regeneration3.dosage}
                                      onChange={(e) => setEditedProtocol({
                                        ...editedProtocol,
                                        phases: {
                                          ...editedProtocol.phases,
                                          regeneration3: { ...editedProtocol.phases.regeneration3, dosage: e.target.value }
                                        }
                                      })}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                                      placeholder="Doz"
                                    />
                                  </div>
                                ) : (
                                  <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[120px]">
                                    <div className="w-8 h-8 bg-green-200 text-green-600 rounded-full flex items-center justify-center text-sm font-bold mb-2">3</div>
                                    <h5 className="font-bold text-green-600 mb-2">3 Regeneration</h5>
                                    <button
                                      onClick={handleAdd3Regeneration}
                                      className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                    >
                                      + Ekle
                                    </button>
                                  </div>
                                )}

                                {/* Optional 4 Regeneration */}
                                {editedProtocol.phases.regeneration4 ? (
                                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 relative">
                                    <button
                                      onClick={handleRemove4Regeneration}
                                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                                      title="4 Regeneration fazını kaldır"
                                    >
                                      ×
                                    </button>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
                                      <h5 className="font-bold text-blue-700">4 Regeneration</h5>
                                    </div>
                                    <input
                                      type="text"
                                      value={editedProtocol.phases.regeneration4.treatment}
                                      onChange={(e) => setEditedProtocol({
                                        ...editedProtocol,
                                        phases: {
                                          ...editedProtocol.phases,
                                          regeneration4: { ...editedProtocol.phases.regeneration4, treatment: e.target.value }
                                        }
                                      })}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2"
                                      placeholder="Tedavi adı"
                                    />
                                    <input
                                      type="text"
                                      value={editedProtocol.phases.regeneration4.dosage}
                                      onChange={(e) => setEditedProtocol({
                                        ...editedProtocol,
                                        phases: {
                                          ...editedProtocol.phases,
                                          regeneration4: { ...editedProtocol.phases.regeneration4, dosage: e.target.value }
                                        }
                                      })}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                                      placeholder="Doz"
                                    />
                                  </div>
                                ) : (
                                  <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[120px]">
                                    <div className="w-8 h-8 bg-blue-200 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold mb-2">4</div>
                                    <h5 className="font-bold text-blue-600 mb-2">4 Regeneration</h5>
                                    <button
                                      onClick={handleAdd4Regeneration}
                                      className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                    >
                                      + Ekle
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Edit Action Buttons */}
                              <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-all duration-200"
                                >
                                  ❌ İptal Et
                                </button>

                                <button
                                  onClick={handleSaveCustomProtocol}
                                  disabled={loading}
                                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                  {loading ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                      Kaydediliyor...
                                    </>
                                  ) : (
                                    <>
                                      💾 Kaydet
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Normal Display Mode */
                          <>
                            {allTreatments.map((bestTreatment, systemIndex) => (
                            <div key={systemIndex} className="mb-8">
                              {/* Protocol Header */}
                              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-2xl p-6">
                                <div className="text-center">
                                  <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                                    📊 {bestTreatment.system} - {bestTreatment.isCustomized ? 'Özelleştirilmiş' : 'Seçilen'} Tedavi Protokolü
                                  </h3>
                                  <div className="flex items-center justify-center gap-2 mb-4">
                                    <p className="text-white/90 text-lg font-medium">{bestTreatment.name}</p>
                                    {bestTreatment.isCustomized && (
                                      <span className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm font-medium border border-orange-500/30">
                                        ✏️ Özelleştirildi
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-center gap-6 text-sm">
                                    <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                      👤 {bestTreatment.patientAgeGroup === 'adult' ? 'Yetişkin' : `${bestTreatment.patientAgeGroup} Yaş`}
                                    </span>
                                    <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                      ⚡ Öncelik: {bestTreatment.priority}
                                    </span>
                                    <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                      📅 {bestTreatment.frequency}
                                    </span>
                                    <button
                                      onClick={() => handleEditProtocol(bestTreatment)}
                                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full font-medium transition-all duration-200 flex items-center gap-2"
                                    >
                                      ✏️ Düzenle
                                    </button>
                                  </div>
                                </div>
                              </div>

                            {/* Treatment Phases Grid */}
                            <div className="bg-white border-x border-gray-200 p-6">
                              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                💊 Tedavi Fazları
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                                {/* Remember */}
                                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">R</div>
                                    <h5 className="font-bold text-red-700">Remember</h5>
                                  </div>
                                  <div className="text-gray-800 font-semibold">{bestTreatment.phases.remember.treatment}</div>
                                  <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.remember.dosage}</div>
                                </div>

                                {/* 1 Regeneration */}
                                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                                    <h5 className="font-bold text-orange-700">1 Regeneration</h5>
                                  </div>
                                  <div className="text-gray-800 font-semibold">{bestTreatment.phases.regeneration1.treatment}</div>
                                  <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.regeneration1.dosage}</div>
                                </div>

                                {/* 2 Regeneration */}
                                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                                    <h5 className="font-bold text-yellow-700">2 Regeneration</h5>
                                  </div>
                                  <div className="text-gray-800 font-semibold">{bestTreatment.phases.regeneration2.treatment}</div>
                                  <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.regeneration2.dosage}</div>
                                </div>

                                {/* 3 Regeneration - Optional */}
                                {bestTreatment.phases.regeneration3 && (
                                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                                      <h5 className="font-bold text-green-700">3 Regeneration</h5>
                                    </div>
                                    <div className="text-gray-800 font-semibold">{bestTreatment.phases.regeneration3.treatment}</div>
                                    <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.regeneration3.dosage}</div>
                                  </div>
                                )}

                                {/* 4 Regeneration - Optional */}
                                {bestTreatment.phases.regeneration4 && (
                                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
                                      <h5 className="font-bold text-blue-700">4 Regeneration</h5>
                                    </div>
                                    <div className="text-gray-800 font-semibold">{bestTreatment.phases.regeneration4.treatment}</div>
                                    <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.regeneration4.dosage}</div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Main Treatments */}
                            <div className="bg-white border-x border-gray-200 p-6">
                              <h4 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                                🏥 Ana Uygulamalar
                              </h4>
                              <p className="text-sm text-gray-600 mb-4">
                                Tedaviye başlamak için en az bir ana uygulama seçmelisiniz
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {bestTreatment.phases.mainTreatments.map((mainTreatment, mtIndex) => {
                                  const isSelected = selectedMainApplications.includes(mainTreatment.treatment);
                                  return (
                                    <div
                                      key={mtIndex}
                                      onClick={() => handleMainApplicationToggle(mainTreatment.treatment)}
                                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                                        isSelected
                                          ? 'bg-purple-100 border-purple-500 shadow-md'
                                          : 'bg-purple-50 border-purple-200 hover:border-purple-400 hover:bg-purple-75'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                          isSelected
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-purple-300 text-purple-700'
                                        }`}>
                                          {isSelected ? '✓' : mtIndex + 1}
                                        </div>
                                        <h5 className={`font-bold transition-all ${
                                          isSelected ? 'text-purple-800' : 'text-purple-700'
                                        }`}>
                                          {mainTreatment.treatment}
                                        </h5>
                                      </div>
                                      {mainTreatment.description && (
                                        <p className="text-sm text-gray-600 mt-2">{mainTreatment.description}</p>
                                      )}
                                      <div className={`text-sm font-medium mt-2 transition-all ${
                                        isSelected ? 'text-purple-700' : 'text-purple-600'
                                      }`}>
                                        {bestTreatment.frequency}
                                      </div>
                                      {isSelected && (
                                        <div className="mt-2 text-xs text-purple-700 font-medium">
                                          ✓ Seçildi
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Protocol Details */}
                            <div className="bg-white border-x border-gray-200 p-6">
                              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                📋 Protokol Detayları
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div className="bg-gray-50 rounded-xl p-4">
                                  <div className="text-sm text-gray-600 mb-1">Kontrol</div>
                                  <div className="font-semibold text-gray-900">{bestTreatment.control}</div>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4">
                                  <div className="text-sm text-gray-600 mb-1">Tanı Sistemi</div>
                                  <div className="font-semibold text-gray-900">{bestTreatment.diagnosisSystem}</div>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4">
                                  <div className="text-sm text-gray-600 mb-1">Oluşturan</div>
                                  <div className="font-semibold text-gray-900">{bestTreatment.createdBy}</div>
                                </div>
                              </div>

                              {/* Conditions */}
                              <div className="mb-6">
                                <h5 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                  🎯 Seçim Kriterleri
                                </h5>
                                <div className="flex flex-wrap gap-3">
                                  {bestTreatment.toxicityRequired && (
                                    <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                                      anamrezData?.toxicityAssessment?.hasToxicity
                                        ? 'bg-red-100 text-red-800 border-2 border-red-300'
                                        : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                                    }`}>
                                      ☠️ Yüksek Toksisite {anamrezData?.toxicityAssessment?.hasToxicity ? '✓' : '✗'}
                                    </div>
                                  )}
                                  {bestTreatment.symptomConditions.map((condition, idx) => {
                                    const patientRating = anamrezData?.symptomRatings?.[condition.symptomKey] || 0;
                                    const meetsRequirement = patientRating >= condition.threshold;
                                    return (
                                      <div key={idx} className={`px-4 py-2 rounded-full text-sm font-medium ${
                                        meetsRequirement
                                          ? 'bg-green-100 text-green-800 border-2 border-green-300'
                                          : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                                      }`}>
                                        📊 {condition.symptomLabel}: {patientRating}/{condition.threshold} {meetsRequirement ? '✓' : '✗'}
                                      </div>
                                    );
                                  })}
                                  {bestTreatment.symptomConditions.length === 0 && !bestTreatment.toxicityRequired && (
                                    <div className="px-4 py-2 bg-green-100 text-green-800 border-2 border-green-300 rounded-full text-sm font-medium">
                                      ✅ Normal Protokol
                                    </div>
                                  )}
                                  {(bestTreatment.symptomConditions.length > 1 || (bestTreatment.symptomConditions.length > 0 && bestTreatment.toxicityRequired)) && (
                                    <div className="px-4 py-2 bg-purple-100 text-purple-800 border-2 border-purple-300 rounded-full text-sm font-medium">
                                      🔗 {bestTreatment.conditionsLogic === 'all' ? 'TÜMÜ' : 'BİRİ YETER'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* End of Protocol Display */}
                            <div className="bg-white rounded-b-2xl"></div>
                          </div>
                        ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
            >
              İptal
            </button>
            <button
              onClick={handleStartTreatment}
              disabled={loading || selectedMainApplications.length === 0}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Başlatılıyor...
                </>
              ) : (
                <>
                  🏥 Tedaviye Başla
                  {selectedMainApplications.length === 0 && (
                    <span className="ml-2 text-xs opacity-75">(Ana uygulama seçin)</span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TreatmentModal;