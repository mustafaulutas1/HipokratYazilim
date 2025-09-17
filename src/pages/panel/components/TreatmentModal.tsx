import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';

// Treatment protocols for different diagnosis systems
const TREATMENT_PROTOCOLS = {
  'Dermatolojik Sistem': {
    'HACAMAT': {
      name: 'HACAMAT',
      description: 'RTM TEDAVİ TRİADININ TEMİZLENME (DETOKS) BASAMAĞINA DESTEK VERİR, 3 AY ARAYLA 1 YILDA 4 DEFA GENEL TARAMA HACAMATI ÖNERİLİR.',
      ageGroups: {
        '2-7': {
          sessions: '2X1 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '2X1/2 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X1 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '3X1 A', order: 3 },
            { phase: 'Main Treatment', treatment: 'HACAMAT', dosage: '2X1 T', order: 4 }
          ]
        },
        '8-14': {
          sessions: '3X1 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '3X1/2 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X2 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '3X2 A', order: 3 },
            { phase: 'Main Treatment', treatment: 'HACAMAT', dosage: '3X1 T', order: 4 }
          ]
        },
        'adult': {
          sessions: '3X2 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '3X1 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X4 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '3X4 A', order: 3 },
            { phase: 'Main Treatment', treatment: 'HACAMAT', dosage: '3X2 T', order: 4 }
          ]
        }
      },
      supportingTreatments: ['DVD-REG', 'ISY-REG'],
      conditions: ['DERMATOLOJIK SİSTEM HASTALIKLARI'],
      symptomRequirements: {}, // No specific symptom requirements for HACAMAT
      priority: 1, // Lower priority than MINOR OZON when both conditions are met
      contraindications: [],
      control: '3 AYDA 1 KONTROL'
    },
    'MINOR OZON': {
      name: 'MINOR OZON',
      description: 'ALTI HAFTA SÜREYLE HER HAFTA MİNOR OZON UYGULAMASI YAPILIR. 10/20 GAMA ARASI',
      ageGroups: {
        '2-7': {
          sessions: '2X1 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '2X1/2 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X1 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '2X2 T', order: 3 },
            { phase: '3 Regeneration', treatment: 'DTX-19', dosage: '3X1 ÇK', order: 4 },
            { phase: '4 Regeneration', treatment: 'SDS-X', dosage: '2X1/2 T', order: 5 },
            { phase: 'Main Treatment', treatment: 'MINOR OZON', dosage: '2X1 T', order: 6 }
          ]
        },
        '8-14': {
          sessions: '3X1 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '3X1/2 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X2 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '2X4 A', order: 3 },
            { phase: '3 Regeneration', treatment: 'DTX-19', dosage: '3X1 TK', order: 4 },
            { phase: '4 Regeneration', treatment: 'SDS-X', dosage: '3X1/2 T', order: 5 },
            { phase: 'Main Treatment', treatment: 'MINOR OZON', dosage: '3X1 T', order: 6 }
          ]
        },
        'adult': {
          sessions: '3X2 T',
          frequency: 'Regülin',
          treatmentSequence: [
            { phase: 'Remember', treatment: 'ARD-REM', dosage: '3X1 T', order: 1 },
            { phase: '1 Regeneration', treatment: 'DVD-REG', dosage: '3X4 A', order: 2 },
            { phase: '2 Regeneration', treatment: 'ISY-REG', dosage: '3X4 A', order: 3 },
            { phase: '3 Regeneration', treatment: 'DTX-19', dosage: '3X1 TK', order: 4 },
            { phase: '4 Regeneration', treatment: 'SDS-X', dosage: '3X1 T', order: 5 },
            { phase: 'Main Treatment', treatment: 'MINOR OZON', dosage: '3X2 T', order: 6 }
          ]
        }
      },
      supportingTreatments: ['DVD-REG', 'ISY-REG', 'DTX-19', 'SDS-X'],
      conditions: ['DERMATOLOJIK SİSTEM HASTALIKLARI'],
      // MINOR OZON is indicated for high toxicity OR high stress
      toxicityRequirement: true, // Show for high toxicity patients
      symptomRequirements: {
        'stres': 7 // OR stress rating must be 7 or higher
      },
      priority: 2, // Higher priority than HACAMAT when conditions are met
      contraindications: [],
      duration: '6 hafta',
      dosage: '10/20 GAMA ARASI',
      control: '3 AYDA 1 KONTROL'
    }
  }
};

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

  // Helper function to get patient age group
  const getPatientAgeGroup = (birthDate: string): string => {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    if (age >= 2 && age <= 7) return '2-7';
    if (age >= 8 && age <= 14) return '8-14';
    return 'adult';
  };

  // Helper function to check if treatment requirements are met
  const meetsTreatmentRequirements = (treatment: any): boolean => {
    // Check toxicity requirement first (highest priority)
    if (treatment.toxicityRequirement) {
      const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
      if (hasHighToxicity) {
        return true; // High toxicity patients get MINOR OZON regardless of symptoms
      }
    }

    // If no high toxicity, check symptom requirements
    if (!treatment.symptomRequirements || Object.keys(treatment.symptomRequirements).length === 0) {
      return true; // No symptom requirements means always applicable
    }

    const symptomRatings = anamrezData?.symptomRatings || {};

    return Object.entries(treatment.symptomRequirements).every(([symptom, requiredRating]) => {
      const patientRating = symptomRatings[symptom] || 0;
      return patientRating >= requiredRating;
    });
  };

  // Helper function to build dynamic treatment sequence based on patient conditions
  const buildTreatmentSequence = (treatment: any, ageGroup: string) => {
    const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
    const hasHighStress = (anamrezData?.symptomRatings?.stres || 0) >= 7;

    // Base dosages by age group
    const baseDosages = {
      '2-7': {
        'ARD-REM': '2X1/2 T',
        'DVD-REG': '3X1 A',
        'ISY-REG': '3X1 A',
        'DTX-19': '3X1 ÇK',
        'SDS-X': '2X1/2 T',
        'HACAMAT': '2X1 T',
        'MINOR OZON': '2X1 T'
      },
      '8-14': {
        'ARD-REM': '3X1/2 T',
        'DVD-REG': '3X2 A',
        'ISY-REG': '3X2 A',
        'DTX-19': '3X1 TK',
        'SDS-X': '3X1/2 T',
        'HACAMAT': '3X1 T',
        'MINOR OZON': '3X1 T'
      },
      'adult': {
        'ARD-REM': '3X1 T',
        'DVD-REG': '3X4 A',
        'ISY-REG': '3X4 A',
        'DTX-19': '3X1 TK',
        'SDS-X': '3X1 T',
        'HACAMAT': '3X2 T',
        'MINOR OZON': '3X2 T'
      }
    };

    const dosages = baseDosages[ageGroup as keyof typeof baseDosages];
    let sequence = [];
    let order = 1;

    // Base sequence (all patients get these)
    sequence.push({ phase: 'Remember', treatment: 'ARD-REM', dosage: dosages['ARD-REM'], order: order++ });
    sequence.push({ phase: '1 Regeneration', treatment: 'DVD-REG', dosage: dosages['DVD-REG'], order: order++ });
    sequence.push({ phase: '2 Regeneration', treatment: 'ISY-REG', dosage: dosages['ISY-REG'], order: order++ });

    // Conditional regeneration steps
    if (hasHighToxicity) {
      sequence.push({ phase: '3 Regeneration', treatment: 'DTX-19', dosage: dosages['DTX-19'], order: order++ });
    }

    if (hasHighStress) {
      const phaseNumber = hasHighToxicity ? '4 Regeneration' : '3 Regeneration';
      sequence.push({ phase: phaseNumber, treatment: 'SDS-X', dosage: dosages['SDS-X'], order: order++ });
    }

    // Main treatment
    const mainTreatment = (hasHighToxicity || hasHighStress) ? 'MINOR OZON' : 'HACAMAT';
    sequence.push({
      phase: 'Main Treatment',
      treatment: mainTreatment,
      dosage: dosages[mainTreatment],
      order: order++
    });

    return sequence;
  };

  // Helper function to get the best treatment for selected diagnosis systems
  const getBestTreatment = () => {
    if (!anamrezData?.selectedDiagnosisSystems) return null;

    const applicableTreatments = [];

    anamrezData.selectedDiagnosisSystems.forEach(system => {
      const systemTreatments = TREATMENT_PROTOCOLS[system as keyof typeof TREATMENT_PROTOCOLS];
      if (systemTreatments) {
        Object.entries(systemTreatments).forEach(([treatmentKey, treatment]) => {
          // Check if treatment is suitable based on patient conditions
          const isApplicable = treatment.conditions.some(condition => {
            if (condition === 'DERMATOLOJIK SİSTEM HASTALIKLARI') {
              return system === 'Dermatolojik Sistem';
            }
            if (condition === 'Yüksek Toksisite') {
              return anamrezData.toxicityAssessment?.hasToxicity || false;
            }
            return true;
          });

          // Check if treatment requirements are met (toxicity + symptoms)
          const meetsRequirements = meetsTreatmentRequirements(treatment);

          if (isApplicable && meetsRequirements) {
            const ageGroup = getPatientAgeGroup(patient.birthDate);
            const ageGroupData = treatment.ageGroups[ageGroup as keyof typeof treatment.ageGroups];

            // Build dynamic treatment sequence based on patient conditions
            const dynamicSequence = buildTreatmentSequence(treatment, ageGroup);

            applicableTreatments.push({
              ...treatment,
              system,
              ageGroupData: {
                ...ageGroupData,
                treatmentSequence: dynamicSequence
              },
              patientAgeGroup: ageGroup,
              treatmentKey
            });
          }
        });
      }
    });

    // Sort by priority (higher priority first) and return the best treatment
    if (applicableTreatments.length === 0) return null;

    const sortedTreatments = applicableTreatments.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sortedTreatments[0]; // Return only the highest priority treatment
  };

  // Fetch anamnez data when modal opens
  useEffect(() => {
    const fetchAnamrezData = async () => {
      if (!patient || !isOpen) return;

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
    };

    fetchAnamrezData();
  }, [patient, isOpen]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAnamrezData(null);
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
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
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
              {fetchingAnamnez ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Tedavi seçenekleri yükleniyor...</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const bestTreatment = getBestTreatment();

                    if (!bestTreatment) {
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

                        {/* Recommended Treatment */}
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-1">
                          <div className="bg-white rounded-lg p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                  <span className="text-green-700 text-xl">🩺</span>
                                </div>
                                <div>
                                  <h5 className="text-xl font-bold text-gray-900 mb-1">
                                    {(() => {
                                      const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
                                      const hasHighStress = (anamrezData?.symptomRatings?.stres || 0) >= 7;
                                      return (hasHighToxicity || hasHighStress) ? 'MINOR OZON' : 'HACAMAT';
                                    })()}
                                  </h5>
                                  <span className="text-sm text-blue-600 bg-blue-100 px-3 py-1 rounded-full font-medium">
                                    Önerilen Tedavi - {bestTreatment.system}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-600">Yaş Grubu: {bestTreatment.patientAgeGroup}</div>
                                <div className="text-2xl font-bold text-green-600">
                                  {bestTreatment.ageGroupData?.sessions}
                                </div>
                                <div className="text-sm text-gray-600 font-medium">{bestTreatment.ageGroupData?.frequency}</div>
                              </div>
                            </div>

                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                              <p className="text-gray-800 text-sm leading-relaxed">
                                {(() => {
                                  const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
                                  const hasHighStress = (anamrezData?.symptomRatings?.stres || 0) >= 7;

                                  if (hasHighToxicity || hasHighStress) {
                                    return 'ALTI HAFTA SÜREYLE HER HAFTA MİNOR OZON UYGULAMASI YAPILIR. 10/20 GAMA ARASI';
                                  } else {
                                    return 'RTM TEDAVİ TRİADININ TEMİZLENME (DETOKS) BASAMAĞINA DESTEK VERİR, 3 AY ARAYLA 1 YILDA 4 DEFA GENEL TARAMA HACAMATI ÖNERİLİR.';
                                  }
                                })()}
                              </p>
                            </div>

                            {/* Complete Treatment Timeline */}
                            <div className="mb-6">
                              <h6 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <span className="text-blue-600">📋</span>
                                Tedavi Protokolü - {bestTreatment.patientAgeGroup} Yaş Grubu
                              </h6>

                              <div className="space-y-3">
                                {bestTreatment.ageGroupData?.treatmentSequence?.map((step, index) => (
                                  <div key={index} className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                                      {step.order}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-gray-900">{step.phase}</span>
                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                          {step.treatment}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm font-bold text-green-600">{step.dosage}</div>
                                      <div className="text-xs text-gray-500">
                                        {bestTreatment.ageGroupData?.frequency}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              {(() => {
                                const hasHighToxicity = anamrezData?.toxicityAssessment?.hasToxicity || false;
                                const hasHighStress = (anamrezData?.symptomRatings?.stres || 0) >= 7;
                                const isMinorOzon = hasHighToxicity || hasHighStress;

                                return (
                                  <>
                                    {isMinorOzon && (
                                      <div className="bg-gray-50 rounded-lg p-3">
                                        <span className="text-sm font-medium text-gray-700 block">Ana Tedavi Süresi</span>
                                        <span className="text-sm text-gray-900 font-semibold">6 hafta</span>
                                      </div>
                                    )}

                                    {isMinorOzon && (
                                      <div className="bg-gray-50 rounded-lg p-3">
                                        <span className="text-sm font-medium text-gray-700 block">Ana Tedavi Dozu</span>
                                        <span className="text-sm text-gray-900 font-semibold">10/20 GAMA ARASI</span>
                                      </div>
                                    )}

                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <span className="text-sm font-medium text-gray-700 block">Kontrol</span>
                                      <span className="text-sm text-gray-900 font-semibold">3 AYDA 1 KONTROL</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>


                            {/* Treatment Selection Criteria */}
                            <div className="mb-4">
                              <span className="text-sm font-medium text-gray-700 block mb-2">Tedavi Seçim Kriterleri:</span>
                              <div className="flex flex-wrap gap-2">
                                {/* High Toxicity Check */}
                                {bestTreatment.toxicityRequirement && (
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    anamrezData?.toxicityAssessment?.hasToxicity
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    Yüksek Toksisite: {anamrezData?.toxicityAssessment?.hasToxicity ? 'VAR ✓' : 'YOK'}
                                  </span>
                                )}

                                {/* Symptom Requirements */}
                                {Object.keys(bestTreatment.symptomRequirements || {}).length > 0 &&
                                  Object.entries(bestTreatment.symptomRequirements).map(([symptom, required]) => {
                                    const patientRating = anamrezData?.symptomRatings?.[symptom] || 0;
                                    const meetsRequirement = patientRating >= required;

                                    return (
                                      <span key={symptom} className={`text-xs px-2 py-1 rounded-full ${
                                        meetsRequirement
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {symptom === 'stres' ? 'Stres' : symptom}: {patientRating}/10
                                        {meetsRequirement ? ` ✓ (≥${required})` : ` (≥${required} gerekli)`}
                                      </span>
                                    );
                                  })
                                }

                                {/* Show primary reason for selection */}
                                {bestTreatment.toxicityRequirement && anamrezData?.toxicityAssessment?.hasToxicity && (
                                  <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full border border-red-200">
                                    🚨 Yüksek Toksisite nedeniyle seçildi
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">Endikasyonlar:</span>
                                <span className="ml-1">{bestTreatment.conditions.join(', ')}</span>
                              </div>
                              <button
                                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg"
                                onClick={() => {
                                  console.log('Selected treatment:', bestTreatment.name);
                                }}
                              >
                                Bu Tedaviyi Seç
                              </button>
                            </div>
                          </div>
                        </div>
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