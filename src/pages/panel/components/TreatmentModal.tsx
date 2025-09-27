import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

  // Helper function to get patient age group
  const getPatientAgeGroup = (birthDate: string): string => {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    if (age >= 2 && age <= 7) return '2-7';
    if (age >= 8 && age <= 14) return '8-14';
    return 'adult';
  };

  // Fetch saved protocols from Firestore
  const fetchSavedProtocols = async () => {
    if (!patient?.clinicId) return;

    try {
      setFetchingProtocols(true);
      console.log('🔍 TreatmentModal: Fetching protocols for clinicId:', patient.clinicId);

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

      // Sort by priority (highest first)
      protocols.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      console.log('✅ TreatmentModal: Fetched protocols:', protocols.length);
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

    const treatmentsBySystem: { [key: string]: any } = {};
    const patientAgeGroup = getPatientAgeGroup(patient.birthDate);

    anamrezData.selectedDiagnosisSystems.forEach(system => {
      console.log('🔍 TreatmentModal: Processing system:', system);

      // Find protocols for this diagnosis system and age group
      const systemProtocols = savedProtocols.filter(protocol =>
        protocol.diagnosisSystem === system && protocol.ageGroup === patientAgeGroup
      );

      console.log('🔍 TreatmentModal: Found protocols for', system, ':', systemProtocols.length);

      const applicableProtocols = [];

      systemProtocols.forEach(protocol => {
        // Check if protocol requirements are met
        const meetsRequirements = meetsTreatmentRequirements(protocol);

        console.log('🔍 TreatmentModal: Protocol', protocol.name, 'meets requirements:', meetsRequirements);

        if (meetsRequirements) {
          // Build treatment sequence from protocol phases
          const treatmentSequence = buildTreatmentSequence(protocol);

          applicableProtocols.push({
            ...protocol,
            system,
            patientAgeGroup,
            treatmentSequence,
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
        console.log('✅ TreatmentModal: Selected protocol for', system, ':', sortedProtocols[0].name);
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
    }
  }, [isOpen]);

  if (!isOpen || !patient) return null;

  const handleStartTreatment = async () => {
    setLoading(true);
    try {
      await onStartTreatment(patient, selectedTreatmentOptions);
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

                        {allTreatments.map((bestTreatment, systemIndex) => (
                          <div key={systemIndex} className="mb-8">
                            {/* Protocol Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-2xl p-6">
                              <div className="text-center">
                                <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                                  📊 {bestTreatment.system} - Seçilen Tedavi Protokolü
                                </h3>
                                <p className="text-white/90 text-lg font-medium mb-4">{bestTreatment.name}</p>
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
                              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                🏥 Ana Uygulamalar
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {bestTreatment.phases.mainTreatments.map((mainTreatment, mtIndex) => (
                                  <div key={mtIndex} className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                        {mtIndex + 1}
                                      </div>
                                      <h5 className="font-bold text-purple-700">{mainTreatment.treatment}</h5>
                                    </div>
                                    {mainTreatment.description && (
                                      <p className="text-sm text-gray-600 mt-2">{mainTreatment.description}</p>
                                    )}
                                    <div className="text-sm text-purple-600 font-medium mt-2">{bestTreatment.frequency}</div>
                                  </div>
                                ))}
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

                            {/* Action Footer */}
                            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-b-2xl p-6">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-bold text-lg">Bu protokol ile tedaviye başlamak istediğinizden emin misiniz?</h5>
                                  <p className="text-green-100 text-sm mt-1">
                                    Protokol hasta durumuna göre otomatik olarak seçilmiştir
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    console.log('Selected treatment:', bestTreatment.name);
                                    handleStartTreatment();
                                  }}
                                  disabled={loading}
                                  className="px-8 py-4 bg-white text-green-700 hover:bg-green-50 rounded-xl font-bold text-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                                >
                                  {loading ? (
                                    <>
                                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-700"></div>
                                      Başlatılıyor...
                                    </>
                                  ) : (
                                    <>
                                      🏥 Tedaviye Başla
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
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
              disabled={loading}
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