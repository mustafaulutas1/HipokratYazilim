import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, updateDoc, doc, getDoc } from 'firebase/firestore';
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
    remember?: TreatmentPhase;
    regenerations?: TreatmentPhase[];
    // Legacy fields – kept for backward compatibility reading old Firestore docs
    regeneration1?: TreatmentPhase;
    regeneration2?: TreatmentPhase;
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
  routineProgram?: {
    enabled: boolean;
    frequency: string;
    totalSessions: number;
    notes: string;
    anamnezRequired?: boolean;
    anamnezTemplates?: string[];
  };
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

// ─── Pure helpers (no React state) ──────────────────────────────────────────

/** Returns the regenerations array from a protocol, falling back to legacy fields. */
const getRegenerations = (phases: SavedProtocol['phases']): TreatmentPhase[] => {
  if (phases.regenerations && phases.regenerations.length > 0) return phases.regenerations;
  const regs: TreatmentPhase[] = [];
  if (phases.regeneration1) regs.push(phases.regeneration1);
  if (phases.regeneration2) regs.push(phases.regeneration2);
  if (phases.regeneration3) regs.push(phases.regeneration3);
  if (phases.regeneration4) regs.push(phases.regeneration4);
  return regs;
};

/** Converts old regeneration1-4 fields to the new regenerations array. */
const normalizeProtocol = (protocol: SavedProtocol): SavedProtocol => {
  if (protocol.phases.regenerations !== undefined) return protocol;
  return {
    ...protocol,
    phases: { ...protocol.phases, regenerations: getRegenerations(protocol.phases) }
  };
};

/** Color palette for regeneration phase cards – cycles for phases beyond 8. */
const REGEN_COLORS = [
  { bg: 'bg-orange-50', border: 'border-orange-200', circle: 'bg-orange-500', label: 'text-orange-700', dashed: 'border-orange-300', lightCircle: 'bg-orange-200', lightLabel: 'text-orange-600', btn: 'bg-orange-500 hover:bg-orange-600' },
  { bg: 'bg-yellow-50', border: 'border-yellow-200', circle: 'bg-yellow-500', label: 'text-yellow-700', dashed: 'border-yellow-300', lightCircle: 'bg-yellow-200', lightLabel: 'text-yellow-600', btn: 'bg-yellow-500 hover:bg-yellow-600' },
  { bg: 'bg-green-50', border: 'border-green-200', circle: 'bg-green-500', label: 'text-green-700', dashed: 'border-green-300', lightCircle: 'bg-green-200', lightLabel: 'text-green-600', btn: 'bg-green-500 hover:bg-green-600' },
  { bg: 'bg-blue-50', border: 'border-blue-200', circle: 'bg-blue-500', label: 'text-blue-700', dashed: 'border-blue-300', lightCircle: 'bg-blue-200', lightLabel: 'text-blue-600', btn: 'bg-blue-500 hover:bg-blue-600' },
  { bg: 'bg-purple-50', border: 'border-purple-200', circle: 'bg-purple-500', label: 'text-purple-700', dashed: 'border-purple-300', lightCircle: 'bg-purple-200', lightLabel: 'text-purple-600', btn: 'bg-purple-500 hover:bg-purple-600' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', circle: 'bg-indigo-500', label: 'text-indigo-700', dashed: 'border-indigo-300', lightCircle: 'bg-indigo-200', lightLabel: 'text-indigo-600', btn: 'bg-indigo-500 hover:bg-indigo-600' },
  { bg: 'bg-pink-50', border: 'border-pink-200', circle: 'bg-pink-500', label: 'text-pink-700', dashed: 'border-pink-300', lightCircle: 'bg-pink-200', lightLabel: 'text-pink-600', btn: 'bg-pink-500 hover:bg-pink-600' },
  { bg: 'bg-teal-50', border: 'border-teal-200', circle: 'bg-teal-500', label: 'text-teal-700', dashed: 'border-teal-300', lightCircle: 'bg-teal-200', lightLabel: 'text-teal-600', btn: 'bg-teal-500 hover:bg-teal-600' },
];

// ─────────────────────────────────────────────────────────────────────────────

const TreatmentModal: React.FC<TreatmentModalProps> = ({
  isOpen,
  onClose,
  patient,
  onStartTreatment
}) => {
  console.log('🎬 TreatmentModal: Component render', { 
    isOpen, 
    patientId: patient?.id,
    patientName: patient?.fullName,
    patientClinicId: patient?.clinicId
  });
  
  const [,] = useState<TreatmentOptions>({});
  const [loading, setLoading] = useState(false);
  const [anamrezData, setAnamrezData] = useState<AnamrezData | null>(null);
  const [fetchingAnamnez, setFetchingAnamnez] = useState(false);
  const [savedProtocols, setSavedProtocols] = useState<SavedProtocol[]>([]);
  const [fetchingProtocols, setFetchingProtocols] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProtocol, setEditedProtocol] = useState<SavedProtocol | null>(null);
  const [selectedMainApplications, setSelectedMainApplications] = useState<string[]>([]);
  const [selectedApplicationsBySystem, setSelectedApplicationsBySystem] = useState<{[key: string]: string[]}>({});
  const [selectedProtocolBySystem, setSelectedProtocolBySystem] = useState<{[key: string]: string}>({});
  const [createRoutineProgram, setCreateRoutineProgram] = useState(false);
  const [routineTotalSessions, setRoutineTotalSessions] = useState<number>(8);
  const [routineFrequency, setRoutineFrequency] = useState<string>('Haftalık');
  const [routineNotes, setRoutineNotes] = useState<string>('');
  const [routineAnamnezRequired, setRoutineAnamnezRequired] = useState(false);
  const [routineAnamnezTemplates, setRoutineAnamnezTemplates] = useState<string[]>([]);
  const [medicationOptions, setMedicationOptions] = useState<string[]>([]);
  const [applicationOptions, setApplicationOptions] = useState<string[]>([]);

  console.log('🎬 TreatmentModal: Current state', {
    savedProtocolsCount: savedProtocols.length,
    anamrezDataExists: !!anamrezData,
    fetchingProtocols,
    fetchingAnamnez
  });

  // Helper function to get patient age group
  const getPatientAgeGroup = (birthDate: string): string => {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    if (age >= 2 && age <= 7) return '2-7';
    if (age >= 8 && age <= 14) return '8-14';
    return 'adult';
  };

  useEffect(() => {
    const fetchMedicationOptions = async () => {
      if (!patient?.clinicId) return;
      try {
        const medicationsQuery = query(
          collection(db, 'medications'),
          where('clinicId', '==', patient.clinicId)
        );
        const snapshot = await getDocs(medicationsQuery);
        const options = snapshot.docs
          .map((doc) => doc.data()?.name)
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
        setMedicationOptions(Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, 'tr')));
      } catch (error) {
        console.error('❌ TreatmentModal: Error fetching medications:', error);
      }
    };

    fetchMedicationOptions();
  }, [patient?.clinicId]);

  useEffect(() => {
    const fetchApplicationOptions = async () => {
      if (!patient?.clinicId) return;
      try {
        const applicationsSnapshot = await getDocs(collection(db, 'medicalApplications'));
        const clinicNames = new Set<string>();
        const options: string[] = [];

        applicationsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data?.clinicId === patient.clinicId && typeof data?.name === 'string') {
            options.push(data.name);
            clinicNames.add(data.name);
          }
        });

        applicationsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data?.clinicId === 'STANDARD' && typeof data?.name === 'string' && !clinicNames.has(data.name)) {
            options.push(data.name);
          }
        });

        setApplicationOptions(Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, 'tr')));
      } catch (error) {
        console.error('❌ TreatmentModal: Error fetching applications:', error);
      }
    };

    fetchApplicationOptions();
  }, [patient?.clinicId]);

  const renderMedicationSelect = (
    value: string,
    onChange: (nextValue: string) => void,
    className: string,
    placeholder = 'İlaç seçin'
  ) => {
    const options = value && !medicationOptions.includes(value)
      ? [value, ...medicationOptions]
      : medicationOptions;

    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        disabled={options.length === 0}
      >
        <option value="">{options.length === 0 ? 'İlaç bulunamadı' : placeholder}</option>
        {options.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    );
  };

  const renderApplicationSelect = (
    value: string,
    onChange: (nextValue: string) => void,
    className: string,
    placeholder = 'Uygulama seçin'
  ) => {
    const options = value && !applicationOptions.includes(value)
      ? [value, ...applicationOptions]
      : applicationOptions;

    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        disabled={options.length === 0}
      >
        <option value="">{options.length === 0 ? 'Uygulama bulunamadı' : placeholder}</option>
        {options.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    );
  };

  const getProtocolDisplayName = (protocol: SavedProtocol) => {
    if (!protocol.isCustomized) return protocol.name;
    return protocol.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  };

  const getManualProtocols = (ageGroup: '2-7' | '8-14' | 'adult') => {
    const customForPatient = savedProtocols.filter(
      (protocol) => protocol.isCustomized && protocol.patientId === patient?.id && protocol.ageGroup === ageGroup
    );

    const customByOriginalId = new Set(
      customForPatient
        .map((protocol) => protocol.originalProtocolId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const baseProtocols = savedProtocols.filter(
      (protocol) =>
        protocol.ageGroup === ageGroup &&
        !protocol.isCustomized &&
        !customByOriginalId.has(protocol.id)
    );

    return [...baseProtocols, ...customForPatient];
  };

  const renderEditingUI = () => {
    if (!editedProtocol) return null;

    return (
      <div className="mb-8">
        {/* Editing Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-t-2xl p-6">
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
              ✏️ Protokol Düzenleniyor - {patient?.fullName}
            </h3>
            <p className="text-white/90 text-lg font-medium mb-4">
              <input
                type="text"
                value={editedProtocol.name}
                onChange={(e) => setEditedProtocol({ ...editedProtocol, name: e.target.value })}
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
                onChange={(e) => setEditedProtocol({ ...editedProtocol, frequency: e.target.value })}
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
          <div className="mb-4">
            <button
              type="button"
              onClick={handleAddRegeneration}
              disabled={!editedProtocol?.phases?.remember}
              className="px-3 py-2 bg-orange-100 hover:bg-orange-200 border border-orange-200 text-orange-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + İlaç Ekle
            </button>
          </div>
          {/* Dynamic Regeneration Cards – unlimited */}
          <div className="flex flex-wrap gap-4 mb-6" style={{ overflowAnchor: 'none' }}>
            {/* Remember */}
            {editedProtocol.phases.remember ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 relative min-w-[180px]">
                <button
                  onClick={handleRemoveRemember}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                  title="Remember fazını kaldır"
                >×</button>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">R</div>
                  <h5 className="font-bold text-red-700">Remember</h5>
                </div>
                {renderMedicationSelect(
                  editedProtocol.phases.remember.treatment,
                  (value) => setEditedProtocol({
                    ...editedProtocol,
                    phases: {
                      ...editedProtocol.phases,
                      remember: { ...editedProtocol.phases.remember!, treatment: value }
                    }
                  }),
                  'w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2',
                  'İlaç seçin'
                )}
                <input
                  type="text"
                  value={editedProtocol.phases.remember.dosage}
                  onChange={(e) => setEditedProtocol({ ...editedProtocol, phases: { ...editedProtocol.phases, remember: { ...editedProtocol.phases.remember!, dosage: e.target.value } } })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                  placeholder="Doz"
                />
              </div>
            ) : (
              <div className="bg-red-50 border-2 border-dashed border-red-300 rounded-xl p-4 flex flex-col items-center justify-center text-center min-w-[180px] min-h-[120px]">
                <div className="w-8 h-8 bg-red-200 text-red-600 rounded-full flex items-center justify-center text-sm font-bold mb-2">R</div>
                <h5 className="font-bold text-red-600 mb-2">Remember</h5>
                <button onClick={handleAddRemember} className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1">+ Ekle</button>
              </div>
            )}

            {/* Existing regeneration phases */}
            {(editedProtocol.phases.regenerations || []).map((reg, index) => {
              const color = REGEN_COLORS[index % REGEN_COLORS.length];
              const isLast = index === (editedProtocol.phases.regenerations?.length ?? 0) - 1;
              return (
                <div key={index} className={`${color.bg} border-2 ${color.border} rounded-xl p-4 relative min-w-[180px]`}>
                  {isLast && (
                    <button
                      onClick={() => handleRemoveRegeneration(index)}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                      title={`${index + 1}. Rejenerasyon fazını kaldır`}
                    >×</button>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 ${color.circle} text-white rounded-full flex items-center justify-center text-sm font-bold`}>{index + 1}</div>
                    <h5 className={`font-bold ${color.label}`}>{index + 1} Regeneration</h5>
                  </div>
                  {renderMedicationSelect(
                    reg.treatment,
                    (value) => handleUpdateRegeneration(index, 'treatment', value),
                    'w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold mb-2',
                    'İlaç seçin'
                  )}
                  <input
                    type="text"
                    value={reg.dosage}
                    onChange={(e) => handleUpdateRegeneration(index, 'dosage', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                    placeholder="Doz"
                  />
                </div>
              );
            })}

            {/* Add next regeneration button (only visible when Remember exists) */}
            {editedProtocol.phases.remember && (() => {
              const nextIndex = (editedProtocol.phases.regenerations?.length || 0);
              const color = REGEN_COLORS[nextIndex % REGEN_COLORS.length];
              return (
                <div className={`${color.bg} border-2 border-dashed ${color.dashed} rounded-xl p-4 flex flex-col items-center justify-center text-center min-w-[180px] min-h-[120px]`}>
                  <div className={`w-8 h-8 ${color.lightCircle} ${color.lightLabel} rounded-full flex items-center justify-center text-sm font-bold mb-2`}>{nextIndex + 1}</div>
                  <h5 className={`font-bold ${color.lightLabel} mb-2`}>{nextIndex + 1} Regeneration</h5>
                  <button onClick={handleAddRegeneration} className={`px-3 py-1 ${color.btn} text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1`}>+ Ekle</button>
                </div>
              );
            })()}
          </div>

          {/* Editable Main Applications */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              🏥 Ana Uygulamalar (Düzenlenebilir)
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Ana uygulamaları düzenleyebilir, ekleyebilir veya silebilirsiniz
            </p>
            <div className="space-y-3">
              {editedProtocol?.phases?.mainTreatments?.map((mainTreatment, mtIndex) => (
                <div key={mtIndex} className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-purple-800">Ana Uygulama #{mtIndex + 1}</h5>
                    <button
                      onClick={() => {
                        const updatedMainTreatments = editedProtocol.phases.mainTreatments.filter((_, index) => index !== mtIndex);
                        setEditedProtocol({
                          ...editedProtocol,
                          phases: {
                            ...editedProtocol.phases,
                            mainTreatments: updatedMainTreatments
                          }
                        });
                      }}
                      className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-all"
                      title="Ana uygulamayı sil"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Uygulama Adı</label>
                    {renderApplicationSelect(
                      mainTreatment.treatment,
                      (value) => {
                        const updatedMainTreatments = [...editedProtocol.phases.mainTreatments];
                        updatedMainTreatments[mtIndex] = {
                          ...updatedMainTreatments[mtIndex],
                          treatment: value
                        };
                        setEditedProtocol({
                          ...editedProtocol,
                          phases: {
                            ...editedProtocol.phases,
                            mainTreatments: updatedMainTreatments
                          }
                        });
                      },
                      'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-purple-500 focus:border-transparent',
                      'Uygulama seçin'
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">Açıklama</label>
                    <textarea
                      value={mainTreatment.description || ''}
                      onChange={(e) => {
                        const updatedMainTreatments = [...editedProtocol.phases.mainTreatments];
                        updatedMainTreatments[mtIndex] = {
                          ...updatedMainTreatments[mtIndex],
                          description: e.target.value
                        };
                        setEditedProtocol({
                          ...editedProtocol,
                          phases: {
                            ...editedProtocol.phases,
                            mainTreatments: updatedMainTreatments
                          }
                        });
                      }}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      placeholder="Ana uygulama açıklamasını girin (opsiyonel)"
                    />
                  </div>
                </div>
              ))}

              {/* Add New Main Application Button */}
              <button
                onClick={() => {
                  const newMainTreatment = {
                    treatment: 'YENİ ANA UYGULAMA',
                    description: ''
                  };
                  setEditedProtocol({
                    ...editedProtocol,
                    phases: {
                      ...editedProtocol.phases,
                      mainTreatments: [...editedProtocol.phases.mainTreatments, newMainTreatment]
                    }
                  });
                }}
                className="w-full px-4 py-3 bg-purple-100 hover:bg-purple-200 border-2 border-dashed border-purple-300 rounded-lg text-purple-700 font-medium transition-all duration-200 flex items-center justify-center gap-2"
              >
                + Yeni Ana Uygulama Ekle
              </button>
            </div>
          </div>

          {/* Editable Protocol Details */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              📋 Protokol Detayları (Düzenlenebilir)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm text-gray-600 mb-2">Kontrol</label>
                <input
                  type="text"
                  value={editedProtocol.control || '4 AYDA 1 KONTROL'}
                  onChange={(e) => setEditedProtocol({ ...editedProtocol, control: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold uppercase"
                  placeholder="Örn: 4 AYDA 1 KONTROL"
                />
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm text-gray-600 mb-2">Tanı Sistemi</label>
                <div className="font-semibold text-gray-900 py-2">{editedProtocol.diagnosisSystem || ''}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm text-gray-600 mb-2">Oluşturan</label>
                <div className="font-semibold text-gray-900 py-2">{editedProtocol.createdBy || 'System Admin'}</div>
              </div>
            </div>
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
    );
  };

  // Fetch saved protocols from Firestore (including patient-specific ones)
  const fetchSavedProtocols = async () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 fetchSavedProtocols: START');
    
    if (!patient?.clinicId) {
      console.log('❌ fetchSavedProtocols: No clinicId found!', {
        hasPatient: !!patient,
        clinicId: patient?.clinicId
      });
      return;
    }

    try {
      setFetchingProtocols(true);
      console.log('🔍 fetchSavedProtocols: Fetching protocols for clinicId:', patient.clinicId);
      console.log('🔍 fetchSavedProtocols: Patient details:', {
        id: patient.id,
        name: patient.fullName,
        clinicId: patient.clinicId
      });

      // Fetch general clinic protocols
      const protocolsRef = collection(db, 'treatmentProtocols');
      console.log('🔍 fetchSavedProtocols: Created collection reference');
      
      // Fetch ALL protocols (not filtered by clinicId yet)
      const allProtocolsSnapshot = await getDocs(protocolsRef);
      console.log('🔍 fetchSavedProtocols: Query executed. Total documents in collection:', allProtocolsSnapshot.size);
      
      const protocols: SavedProtocol[] = [];
      const clinicProtocolKeys = new Set<string>();

      // First pass: collect clinic-specific protocols
      console.log('🔍 fetchSavedProtocols: First pass - collecting clinic-specific protocols...');
      allProtocolsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === patient.clinicId) {
          console.log('📄 fetchSavedProtocols: Found clinic-specific protocol:', {
            id: doc.id,
            name: data.name,
            diagnosisSystem: data.diagnosisSystem,
            ageGroup: data.ageGroup
          });
          protocols.push({
            id: doc.id,
            ...data
          } as SavedProtocol);
          // Create unique key for protocol (diagnosisSystem + ageGroup + name)
          const key = `${data.diagnosisSystem}_${data.ageGroup}_${data.name}`;
          clinicProtocolKeys.add(key);
        }
      });
      
      console.log(`✅ fetchSavedProtocols: Found ${protocols.length} clinic-specific protocol(s)`);
      
      // Second pass: add STANDARD protocols that don't have clinic-specific versions
      console.log('🔍 fetchSavedProtocols: Second pass - collecting STANDARD protocols...');
      allProtocolsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === 'STANDARD') {
          const key = `${data.diagnosisSystem}_${data.ageGroup}_${data.name}`;
          if (!clinicProtocolKeys.has(key)) {
            console.log('📄 fetchSavedProtocols: Found STANDARD protocol (no clinic override):', {
              id: doc.id,
              name: data.name,
              diagnosisSystem: data.diagnosisSystem,
              ageGroup: data.ageGroup
            });
            protocols.push({
              id: doc.id,
              ...data
            } as SavedProtocol);
          } else {
            console.log('⏭️ fetchSavedProtocols: Skipping STANDARD protocol (clinic override exists):', {
              name: data.name,
              diagnosisSystem: data.diagnosisSystem,
              ageGroup: data.ageGroup
            });
          }
        }
      });
      
      console.log('✅ fetchSavedProtocols: Processed general protocols:', protocols.length);

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

      console.log('✅ fetchSavedProtocols: TOTAL FETCHED PROTOCOLS:', protocols.length);
      console.log('📋 fetchSavedProtocols: All protocols summary:', protocols.map(p => ({
        id: p.id,
        name: p.name,
        diagnosisSystem: p.diagnosisSystem,
        ageGroup: p.ageGroup,
        patientId: p.patientId || 'none',
        isCustomized: p.isCustomized || false,
        priority: p.priority
      })));
      
      setSavedProtocols(protocols.map(normalizeProtocol));
      console.log('✅ fetchSavedProtocols: State updated with protocols');
      console.log('═══════════════════════════════════════════════════════════');
    } catch (error) {
      console.error('❌ fetchSavedProtocols: Error fetching protocols:', error);
      console.error('❌ fetchSavedProtocols: Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      console.log('═══════════════════════════════════════════════════════════');
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
    if (protocol.phases.remember) {
      sequence.push({
        phase: 'Remember',
        treatment: protocol.phases.remember.treatment,
        dosage: protocol.phases.remember.dosage,
        order: order++
      });
    }

    getRegenerations(protocol.phases).forEach((reg, idx) => {
      sequence.push({
        phase: `${idx + 1} Regeneration`,
        treatment: reg.treatment,
        dosage: reg.dosage,
        order: order++
      });
    });

    // Add main treatments
    protocol.phases.mainTreatments.forEach((mainTreatment) => {
      sequence.push({
        phase: 'Main Treatment',
        treatment: mainTreatment.treatment,
        dosage: '', // Main treatments don't need dosage, use empty string
        description: mainTreatment.description,
        order: order++
      });
    });

    return sequence;
  };

  // Helper function to get treatments for each selected diagnosis system
  const getTreatmentsForAllSystems = () => {
    if (!anamrezData?.selectedDiagnosisSystems || !patient) {
      console.log('❌ getTreatmentsForAllSystems: Missing data', {
        hasAnamrezData: !!anamrezData,
        hasSelectedSystems: !!anamrezData?.selectedDiagnosisSystems,
        hasPatient: !!patient
      });
      return [];
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 getTreatmentsForAllSystems: START');
    console.log('🔍 Selected diagnosis systems:', anamrezData.selectedDiagnosisSystems);
    console.log('🔍 Total available protocols:', savedProtocols.length);
    console.log('🔍 All available protocols:', savedProtocols.map(p => ({
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
    console.log('🔍 Patient age group:', patientAgeGroup);

    anamrezData.selectedDiagnosisSystems.forEach((system, index) => {
      console.log('───────────────────────────────────────────────────────────');
      console.log(`🔍 Processing system [${index + 1}/${anamrezData.selectedDiagnosisSystems.length}]:`, system);
      console.log('🔍 Patient ID:', patient.id);
      console.log('🔍 Patient age group:', patientAgeGroup);

      // Debug all protocols for this system first
      const systemProtocolsAll = savedProtocols.filter(protocol => protocol.diagnosisSystem === system);
      console.log(`🔍 Total protocols found for system "${system}":`, systemProtocolsAll.length);
      console.log('🔍 All protocols for this system:', systemProtocolsAll.map(p => ({
        id: p.id,
        name: p.name,
        ageGroup: p.ageGroup,
        patientId: p.patientId || 'NONE',
        isCustomized: p.isCustomized || false,
        priority: p.priority
      })));

      // FIRST: Look for patient-specific customized protocols
      console.log('🔍 Step 1: Looking for patient-specific protocols...');
      const patientSpecificProtocols = savedProtocols.filter(protocol => {
        const diagnosisSystemMatch = protocol.diagnosisSystem === system;
        const ageGroupMatch = protocol.ageGroup === patientAgeGroup;
        const patientIdMatch = protocol.patientId === patient.id;
        const isCustomizedMatch = protocol.isCustomized === true;
        const matches = diagnosisSystemMatch && ageGroupMatch && patientIdMatch && isCustomizedMatch;

        if (protocol.diagnosisSystem === system) {
          console.log(`  🔍 Checking protocol "${protocol.name}":`, {
            diagnosisSystemMatch,
            ageGroupMatch,
            patientIdMatch,
            isCustomizedMatch,
            overallMatch: matches
          });
        }

        return matches;
      });

      console.log(`✅ Found ${patientSpecificProtocols.length} patient-specific protocol(s) for "${system}"`);
      if (patientSpecificProtocols.length > 0) {
        console.log('🎯 Patient-specific protocols:', patientSpecificProtocols.map(p => ({
          id: p.id,
          name: p.name,
          patientId: p.patientId,
          isCustomized: p.isCustomized,
          priority: p.priority
        })));
      }

      // SECOND: If no patient-specific found, look for general clinic protocols
      console.log('🔍 Step 2: Looking for general clinic protocols...');
      const generalProtocols = patientSpecificProtocols.length === 0
        ? savedProtocols.filter(protocol => {
            const diagnosisSystemMatch = protocol.diagnosisSystem === system;
            const ageGroupMatch = protocol.ageGroup === patientAgeGroup;
            const noPatientId = !protocol.patientId;
            const matches = diagnosisSystemMatch && ageGroupMatch && noPatientId;

            if (protocol.diagnosisSystem === system) {
              console.log(`  🔍 Checking protocol "${protocol.name}":`, {
                diagnosisSystemMatch,
                ageGroupMatch,
                noPatientId,
                overallMatch: matches
              });
            }

            return matches;
          })
        : [];

      console.log(`✅ Found ${generalProtocols.length} general protocol(s) for "${system}"`);
      if (generalProtocols.length > 0) {
        console.log('🎯 General protocols:', generalProtocols.map(p => ({
          id: p.id,
          name: p.name,
          ageGroup: p.ageGroup,
          priority: p.priority,
          isCustomized: p.isCustomized || false
        })));
      }

      // Use patient-specific if available, otherwise use general
      const systemProtocols = patientSpecificProtocols.length > 0 ? patientSpecificProtocols : generalProtocols;
      console.log(`🔍 Step 3: Using ${systemProtocols.length} protocol(s) for evaluation (${patientSpecificProtocols.length > 0 ? 'patient-specific' : 'general'})`);

      const applicableProtocols: any[] = [];
      console.log('🔍 Step 4: Evaluating protocol requirements...');

      systemProtocols.forEach((protocol, idx) => {
        console.log(`  📋 Evaluating protocol [${idx + 1}/${systemProtocols.length}]: "${protocol.name}"`);
        
        // Check if protocol requirements are met
        const meetsRequirements = meetsTreatmentRequirements(protocol);

        console.log(`  ${meetsRequirements ? '✅' : '❌'} Requirements met: ${meetsRequirements}`, {
          protocolName: protocol.name,
          isCustomized: protocol.isCustomized || false,
          priority: protocol.priority
        });

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
              sessions: '', // Sessions should be empty for main treatments
              frequency: protocol.frequency,
              treatmentSequence: treatmentSequence
            }
          });
          console.log(`  ✅ Added to applicable protocols`);
        }
      });

      console.log(`✅ Step 4 Complete: ${applicableProtocols.length} protocol(s) meet requirements`);

      // Sort by priority and get the best protocol for this system
      console.log('🔍 Step 5: Selecting final protocol...');
      if (applicableProtocols.length > 0) {
        console.log('  ✅ Using protocols that meet requirements');
        const sortedProtocols = applicableProtocols.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        treatmentsBySystem[system] = sortedProtocols[0]; // Best protocol for this system
        console.log(`  ✅ SELECTED for "${system}":`, {
          name: sortedProtocols[0].name,
          isCustomized: sortedProtocols[0].isCustomized || false,
          priority: sortedProtocols[0].priority,
          isFallback: false
        });
      } else {
        // If no protocols meet the requirements, use the first protocol for this system/age as fallback
        console.log('  ⚠️ No applicable protocols found - attempting fallback...');
        
        if (systemProtocols.length > 0) {
          console.log(`  ⚠️ Using fallback from ${systemProtocols.length} available protocol(s)`);
          // Sort by priority and take the first one
          const sortedForFallback = [...systemProtocols].sort((a, b) => (b.priority || 0) - (a.priority || 0));
          const fallbackProtocol = sortedForFallback[0];
          const treatmentSequence = buildTreatmentSequence(fallbackProtocol);
          
          console.log('  📋 Fallback protocol details:', {
            name: fallbackProtocol.name,
            priority: fallbackProtocol.priority,
            ageGroup: fallbackProtocol.ageGroup,
            hasPhases: !!fallbackProtocol.phases,
            hasMainTreatments: !!fallbackProtocol.phases?.mainTreatments
          });
          
          treatmentsBySystem[system] = {
            ...fallbackProtocol,
            system,
            patientAgeGroup,
            treatmentSequence,
            isCustomized: fallbackProtocol.isCustomized || false,
            isFallback: true, // Mark this as a fallback selection
            ageGroupData: {
              sessions: '',
              frequency: fallbackProtocol.frequency,
              treatmentSequence: treatmentSequence
            }
          };
          
          console.log(`  ✅ SELECTED (FALLBACK) for "${system}":`, {
            name: fallbackProtocol.name,
            isCustomized: fallbackProtocol.isCustomized || false,
            priority: fallbackProtocol.priority,
            isFallback: true
          });
        } else {
          console.log(`  ❌ ERROR: No protocols available at all for "${system}" with age group "${patientAgeGroup}"`);
          console.log(`  ❌ Available system protocols:`, systemProtocolsAll.map(p => ({
            name: p.name,
            ageGroup: p.ageGroup,
            patientId: p.patientId || 'NONE'
          })));
        }
      }
    });

    const result = Object.values(treatmentsBySystem);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ getTreatmentsForAllSystems: COMPLETE');
    console.log('✅ Final treatment recommendations count:', result.length);
    console.log('✅ Treatments by system:', Object.keys(treatmentsBySystem));
    console.log('✅ Final result details:', result.map((r: any) => ({
      system: r.system,
      name: r.name,
      isCustomized: r.isCustomized,
      isFallback: r.isFallback || false,
      hasMainTreatments: r.phases?.mainTreatments?.length || 0
    })));
    console.log('═══════════════════════════════════════════════════════════');
    return result;
  };

  // Fetch anamnez data and protocols when modal opens
  useEffect(() => {
    const fetchData = async () => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 useEffect fetchData: TRIGGERED');
      console.log('🔍 useEffect fetchData: isOpen:', isOpen);
      console.log('🔍 useEffect fetchData: hasPatient:', !!patient);
      
      if (!patient || !isOpen) {
        console.log('❌ useEffect fetchData: Exiting early - patient or isOpen is false');
        console.log('═══════════════════════════════════════════════════════════');
        return;
      }
      
      console.log('🔍 useEffect fetchData: Patient details:', {
        id: patient.id,
        name: patient.fullName,
        clinicId: patient.clinicId
      });

      // Fetch anamnez data
      console.log('🔍 useEffect fetchData: Fetching anamnez data...');
      setFetchingAnamnez(true);
      try {
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        const querySnapshot = await getDocs(anamrezQuery);
        console.log('🔍 useEffect fetchData: Anamnez records found:', querySnapshot.size);

        if (!querySnapshot.empty) {
          const data = querySnapshot.docs[0].data();
          setAnamrezData({
            selectedDiagnosisSystems: data.selectedDiagnosisSystems || [],
            complaintDetails: data.complaintDetails || '',
            symptomRatings: data.symptomRatings || {},
            toxicityAssessment: data.toxicityAssessment || null
          });
          console.log('✅ useEffect fetchData: Anamnez data set:', {
            systems: data.selectedDiagnosisSystems?.length || 0,
            hasSymptoms: !!data.symptomRatings,
            hasToxicity: !!data.toxicityAssessment
          });
        } else {
          console.log('⚠️ useEffect fetchData: No anamnez records found');
        }
      } catch (error) {
        console.error('❌ useEffect fetchData: Error fetching anamnez:', error);
      } finally {
        setFetchingAnamnez(false);
      }

      // Fetch protocols
      console.log('🔍 useEffect fetchData: About to call fetchSavedProtocols...');
      await fetchSavedProtocols();
      console.log('✅ useEffect fetchData: fetchSavedProtocols completed');
      console.log('═══════════════════════════════════════════════════════════');
    };

    fetchData();
  }, [patient, isOpen]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAnamrezData(null);
      setSavedProtocols([]);
      setSelectedMainApplications([]);
      setSelectedApplicationsBySystem({});
      setSelectedProtocolBySystem({});
      setIsEditing(false);
      setEditedProtocol(null);
    }
  }, [isOpen]);

  // Auto-select all main treatments when protocols are available
  useEffect(() => {
    if (savedProtocols.length > 0 && anamrezData && patient && isOpen) {
      const allTreatments = getTreatmentsForAllSystems();
      const allMainApps = new Set<string>();
      const appsBySystem: {[key: string]: string[]} = {};

      allTreatments.forEach(protocol => {
        const systemApps: string[] = [];
        if (protocol.phases && protocol.phases.mainTreatments) {
            protocol.phases.mainTreatments.forEach((mt: any) => {
                allMainApps.add(mt.treatment);
                systemApps.push(mt.treatment);
            });
        }
        appsBySystem[protocol.system] = systemApps;
      });

      setSelectedMainApplications(Array.from(allMainApps));
      setSelectedApplicationsBySystem(appsBySystem);
    }
  }, [savedProtocols, anamrezData, patient, isOpen]);

  // Handle main application selection with system tracking
  const handleMainApplicationToggle = (applicationName: string, systemName: string) => {
    // Update global selection for backwards compatibility
    setSelectedMainApplications(prev =>
      prev.includes(applicationName)
        ? prev.filter(name => name !== applicationName)
        : [...prev, applicationName]
    );

    // Update system-specific selection
    setSelectedApplicationsBySystem(prev => {
      const currentSystemSelections = prev[systemName] || [];
      const newSystemSelections = currentSystemSelections.includes(applicationName)
        ? currentSystemSelections.filter(name => name !== applicationName)
        : [...currentSystemSelections, applicationName];
      
      return {
        ...prev,
        [systemName]: newSystemSelections
      };
    });
  };

  // Check if all diseases have at least one treatment method selected
  const areAllDiseasesValidated = () => {
    const allTreatments = getTreatmentsForAllSystems();
    
    // If no automatic treatments were found, check if doctor manually selected at least one treatment
    if (allTreatments.length === 0) {
      // Check if any main applications are selected from manual selection
      return selectedMainApplications.length > 0;
    }

    // If there's only one disease, use the existing validation
    if (allTreatments.length === 1) {
      return selectedMainApplications.length > 0;
    }

    // For multiple diseases, check each system has at least one selection
    return allTreatments.every(treatment => {
      const systemSelections = selectedApplicationsBySystem[treatment.system] || [];
      return systemSelections.length > 0;
    });
  };

  if (!isOpen || !patient) return null;

  // Start editing a protocol for this patient
  const handleEditProtocol = (protocol: SavedProtocol) => {
    const normalizedProtocol = normalizeProtocol(protocol);
    setEditedProtocol({
      ...normalizedProtocol,
      // Make it patient-specific
      id: `${protocol.id}_patient_${patient.id}`,
      name: getProtocolDisplayName(protocol),
      patientId: patient.id,
      originalProtocolId: protocol.originalProtocolId || protocol.id,
      customizedAt: new Date().toISOString(),
      customizedBy: 'Dr. ' // You can get this from user context
    });
    setSelectedProtocolBySystem((prev) => ({
      ...prev,
      [protocol.diagnosisSystem]: protocol.id
    }));
    setIsEditing(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedProtocol(null);
  };

  // Add Remember phase
  const handleAddRemember = () => {
    if (!editedProtocol) return;
    setEditedProtocol({
      ...editedProtocol,
      phases: {
        ...editedProtocol.phases,
        remember: { treatment: '', dosage: '' }
      }
    });
  };

  // Remove Remember phase
  const handleRemoveRemember = () => {
    if (!editedProtocol) return;
    
    // Prevent removing Remember if Regeneration 1 exists
    if (editedProtocol.phases.regeneration1) {
      alert('Remember fazını kaldırmak için önce 1. Rejenerasyon fazını kaldırmalısınız.');
      return;
    }

    const { remember, ...restPhases } = editedProtocol.phases;
    setEditedProtocol({
      ...editedProtocol,
      phases: restPhases
    });
  };

  // Add next regeneration phase (unlimited)
  const handleAddRegeneration = () => {
    if (!editedProtocol) return;
    if (!editedProtocol.phases.remember) {
      alert('Rejenerasyon fazı eklemek için önce Remember fazını eklemelisiniz.');
      return;
    }
    const current = editedProtocol.phases.regenerations || [];
    setEditedProtocol({
      ...editedProtocol,
      phases: { ...editedProtocol.phases, regenerations: [...current, { treatment: '', dosage: '' }] }
    });
  };

  // Remove regeneration phase by index (only the last one)
  const handleRemoveRegeneration = (index: number) => {
    if (!editedProtocol) return;
    const current = editedProtocol.phases.regenerations || [];
    if (index !== current.length - 1) {
      alert('Yalnızca son rejenerasyon fazını kaldırabilirsiniz.');
      return;
    }
    setEditedProtocol({
      ...editedProtocol,
      phases: { ...editedProtocol.phases, regenerations: current.slice(0, -1) }
    });
  };

  // Update a field of a specific regeneration phase
  const handleUpdateRegeneration = (index: number, field: 'treatment' | 'dosage', value: string) => {
    if (!editedProtocol) return;
    const current = [...(editedProtocol.phases.regenerations || [])];
    current[index] = { ...current[index], [field]: field === 'treatment' ? value.toUpperCase() : value };
    setEditedProtocol({
      ...editedProtocol,
      phases: { ...editedProtocol.phases, regenerations: current }
    });
  };

  // Save customized protocol for this patient (ONLY SAVE, DO NOTHING ELSE)
  const handleSaveCustomProtocol = async () => {
    if (!editedProtocol || !patient) return;

    try {
      setLoading(true);

      // Update patient record directly with customized protocol
      const patientRef = doc(db, 'patients', patient.id);

      // Strip legacy regeneration1-4 fields; save only the regenerations array
      const { regeneration1, regeneration2, regeneration3, regeneration4, ...cleanPhases } = editedProtocol.phases;
      const customizedProtocolData = {
        ...editedProtocol,
        phases: { ...cleanPhases, regenerations: editedProtocol.phases.regenerations || [] },
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
  /*
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
  */

  const handleStartTreatment = async () => {
    const allTreatments = getTreatmentsForAllSystems();
    
    setLoading(true);
    try {
      let treatmentOptions: TreatmentOptions;
      
      if (allTreatments.length === 0) {
        // Manual selection mode: find the protocol that contains the selected main applications
        const patientAgeGroup = patient ? getPatientAgeGroup(patient.birthDate) : 'adult';
        const allAvailableProtocols = getManualProtocols(patientAgeGroup as '2-7' | '8-14' | 'adult');
        
        // Find the protocol(s) that contain the selected main applications
        let matchingProtocol = allAvailableProtocols.find(protocol => 
          protocol.phases.mainTreatments.some(mt => 
            selectedMainApplications.includes(mt.treatment)
          )
        );
        
        // If no matching protocol found, use the first available one
        if (!matchingProtocol && allAvailableProtocols.length > 0) {
          matchingProtocol = allAvailableProtocols[0];
        }
        
        if (!matchingProtocol) {
          console.error('No protocol found for manual selection');
          alert('Tedavi protokolü bulunamadı. Lütfen tekrar deneyin.');
          setLoading(false);
          return;
        }
        
        // Build protocol with sequence for the manually selected protocol
        const treatmentSequence = buildTreatmentSequence(matchingProtocol);
        const manualProtocol = {
          ...matchingProtocol,
          system: matchingProtocol.diagnosisSystem,
          patientAgeGroup,
          treatmentSequence,
          isCustomized: false,
          isManualSelection: true, // Mark as manual selection
          ageGroupData: {
            sessions: '',
            frequency: matchingProtocol.frequency,
            treatmentSequence: treatmentSequence
          }
        };
        
        treatmentOptions = {
          protocolId: manualProtocol.id,
          protocolName: manualProtocol.name,
          isCustomized: false,
          selectedProtocol: manualProtocol,
          selectedMainApplications: selectedMainApplications,
          notes: 'Manuel seçim - Hasta anamnezine uygun otomatik tedavi bulunamadı'
        };
      } else {
        // Normal mode: use the automatically selected protocol
        const selectedProtocol = allTreatments[0]; // First (best) protocol
        
        treatmentOptions = {
          protocolId: selectedProtocol.id,
          protocolName: selectedProtocol.name,
          isCustomized: false,
          selectedProtocol: selectedProtocol,
          selectedMainApplications: selectedMainApplications
        };
      }

      if (createRoutineProgram) {
        treatmentOptions.routineProgram = {
          enabled: true,
          frequency: routineFrequency,
          totalSessions: routineTotalSessions,
          notes: routineNotes,
          anamnezRequired: routineAnamnezRequired,
          anamnezTemplates: routineAnamnezRequired ? routineAnamnezTemplates : undefined,
        };
      }

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
      <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[95vh] shadow-2xl border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 rounded-t-2xl">
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

        <div
          className="flex-1 overflow-y-scroll"
          style={{ scrollbarGutter: 'stable', overflowAnchor: 'none' }}
        >
          {/* Content */}
          <div className="p-6 space-y-6" style={{ overflowAnchor: 'none' }}>
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
                  <span className="font-medium text-gray-900">Cinsiyet:</span> {patient.gender === 'Erkek' ? 'Erkek' : patient.gender === 'Kadın' ? 'Kadın' : patient.gender === 'male' ? 'Erkek' : patient.gender === 'female' ? 'Kadın' : patient.gender || 'Belirtilmemiş'}
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
                      if (isEditing && editedProtocol) {
                        return renderEditingUI();
                      }

                      const patientAgeGroup = patient ? getPatientAgeGroup(patient.birthDate) : 'adult';
                      const allAvailableProtocols = getManualProtocols(patientAgeGroup as '2-7' | '8-14' | 'adult');

                      if (allAvailableProtocols.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <div className="text-4xl mb-4">🔍</div>
                            <h4 className="text-gray-700 text-lg font-semibold mb-2">
                              Tedavi Protokolü Bulunamadı
                            </h4>
                            <p className="text-gray-600 text-sm mb-4">
                              Bu yaş grubuna uygun tedavi protokolü sistemde kayıtlı değil.
                            </p>
                            <div className="text-sm text-gray-500">
                              <p>Yaş Grubu: {patientAgeGroup === 'adult' ? 'Yetişkin' : `${patientAgeGroup} Yaş`}</p>
                            </div>
                          </div>
                        );
                      }

                      const protocolsBySystem: { [key: string]: SavedProtocol[] } = {};
                      allAvailableProtocols.forEach(protocol => {
                        if (!protocolsBySystem[protocol.diagnosisSystem]) {
                          protocolsBySystem[protocol.diagnosisSystem] = [];
                        }
                        protocolsBySystem[protocol.diagnosisSystem].push(protocol);
                      });

                      return (
                        <div className="space-y-6">
                          {/* Warning Banner */}
                          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">⚠️</div>
                              <div>
                                <h4 className="text-amber-800 font-semibold mb-1">
                                  Hasta Anamnezine Uygun Tedavi Bulunamadı
                                </h4>
                                <p className="text-amber-700 text-sm">
                                  Hasta değerlerine göre otomatik eşleşen bir tedavi protokolü bulunamadı.
                                  Aşağıdaki mevcut tedavi seçeneklerinden manuel olarak seçim yapabilirsiniz.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Patient Info Summary */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h5 className="font-medium text-blue-900 mb-2">Hasta Durumu & Tedavi Kriterleri</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-blue-700 font-medium">Yaş Grubu:</span>
                                <span className="ml-2 text-blue-900">{patientAgeGroup === 'adult' ? 'Yetişkin' : `${patientAgeGroup} Yaş`}</span>
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

                          {/* All Available Protocols by System */}
                          <div>
                            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                              📋 Mevcut Tedavi Protokolleri
                            </h4>
                            <p className="text-sm text-gray-600 mb-4">
                              Tedaviye devam etmek için aşağıdaki protokollerden birini seçin ve ana uygulamalardan en az birini işaretleyin.
                            </p>

                            {Object.entries(protocolsBySystem).map(([systemName, protocols]) => (
                              <div key={systemName} className="mb-6">
                                <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                                  {systemName}
                                </h5>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {(() => {
                                    const sorted = [...protocols].sort((a, b) => (b.priority || 0) - (a.priority || 0));
                                    const editedForSystem = editedProtocol && editedProtocol.diagnosisSystem === systemName
                                      ? editedProtocol
                                      : null;
                                    const customizedForSystem = sorted.find((p) => p.isCustomized && p.patientId === patient?.id);
                                    const topProtocol = editedForSystem
                                      || customizedForSystem
                                      || sorted[0];

                                    return topProtocol ? [topProtocol] : [];
                                  })().map((protocol) => {
                                    const treatmentSequence = buildTreatmentSequence(protocol);
                                    const protocolWithSequence = {
                                      ...protocol,
                                      system: systemName,
                                      patientAgeGroup,
                                      treatmentSequence,
                                      isCustomized: protocol.isCustomized || false,
                                      isFallback: false,
                                      ageGroupData: {
                                        sessions: '',
                                        frequency: protocol.frequency,
                                        treatmentSequence: treatmentSequence
                                      }
                                    };

                                    const systemSelections = selectedApplicationsBySystem[systemName] || [];
                                    const hasAnySelection = systemSelections.length > 0;
                                    const isSelected = selectedProtocolBySystem[systemName] === protocol.id;

                                    return (
                                      <div
                                        key={protocol.id}
                                        onClick={() =>
                                          setSelectedProtocolBySystem((prev) => {
                                            const current = prev[systemName];
                                            if (current === protocol.id) {
                                              const { [systemName]: _, ...rest } = prev;
                                              return rest;
                                            }
                                            return {
                                              ...prev,
                                              [systemName]: protocol.id
                                            };
                                          })
                                        }
                                        className={`border-2 rounded-xl p-4 transition-all duration-200 ${
                                          isSelected
                                            ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-400 shadow-lg'
                                            : hasAnySelection
                                              ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-200 shadow-md'
                                              : 'bg-white border-gray-200 hover:border-blue-300'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-3">
                                          <div>
                                            <h6 className="font-bold text-gray-900">{getProtocolDisplayName(protocol)}</h6>
                                            <div className="flex items-center gap-2 mt-1">
                                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                                                Öncelik: {protocol.priority}
                                              </span>
                                              {protocol.frequency && (
                                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-full">
                                                  {protocol.frequency}
                                                </span>
                                              )}
                                              {isSelected && (
                                                <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded-full">
                                                  Seçildi
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => handleEditProtocol(protocolWithSequence)}
                                            className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-all duration-200"
                                          >
                                            ✏️ Düzenle
                                          </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-3">
                                          {protocol.phases.remember && (
                                            <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                                              R: {protocol.phases.remember.treatment}
                                            </span>
                                          )}
                                          {getRegenerations(protocol.phases).map((reg, idx) => (
                                            <span key={idx} className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                                              {idx + 1}: {reg.treatment}
                                            </span>
                                          ))}
                                        </div>

                                        <div className="border-t border-gray-200 pt-3">
                                          <p className="text-xs text-gray-600 mb-2 font-medium">Ana Uygulamalar (seçim yapın):</p>
                                          <div className="flex flex-wrap gap-2">
                                            {protocol.phases.mainTreatments.map((mainTreatment, mtIndex) => {
                                              const isSelected = systemSelections.includes(mainTreatment.treatment);
                                              return (
                                                <button
                                                  key={mtIndex}
                                                  onClick={() => handleMainApplicationToggle(mainTreatment.treatment, systemName)}
                                                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                    isSelected
                                                      ? 'bg-purple-500 text-white shadow-md'
                                                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                                  }`}
                                                >
                                                  {isSelected ? '✓ ' : ''}{mainTreatment.treatment}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (isEditing && editedProtocol) {
                      return renderEditingUI();
                    }

                    return (
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
                                  <p className="text-white/90 text-lg font-medium">{getProtocolDisplayName(bestTreatment)}</p>
                                </div>
                                <div className="flex items-center justify-center gap-6 text-sm">
                                  <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                    👤 {bestTreatment.patientAgeGroup === 'adult' ? 'Yetişkin' : `${bestTreatment.patientAgeGroup} Yaş`}
                                  </span>
                                  <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                    ⚡ Öncelik: {bestTreatment.priority}
                                  </span>
                                  {bestTreatment.frequency && (
                                    <span className="px-4 py-2 bg-white/20 text-white rounded-full font-medium">
                                      📅 {bestTreatment.frequency}
                                    </span>
                                  )}
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
                              <div className="flex flex-wrap gap-4 mb-6" style={{ overflowAnchor: 'none' }}>
                                {bestTreatment.phases.remember && (
                                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 min-w-[160px]">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold">R</div>
                                      <h5 className="font-bold text-red-700">Remember</h5>
                                    </div>
                                    <div className="text-gray-800 font-semibold">{bestTreatment.phases.remember.treatment}</div>
                                    <div className="text-sm text-gray-600 mt-1">{bestTreatment.phases.remember.dosage}</div>
                                  </div>
                                )}
                                {getRegenerations(bestTreatment.phases).map((reg, idx) => {
                                  const color = REGEN_COLORS[idx % REGEN_COLORS.length];
                                  return (
                                    <div key={idx} className={`${color.bg} border-2 ${color.border} rounded-xl p-4 min-w-[160px]`}>
                                      <div className="flex items-center gap-2 mb-3">
                                        <div className={`w-8 h-8 ${color.circle} text-white rounded-full flex items-center justify-center text-sm font-bold`}>{idx + 1}</div>
                                        <h5 className={`font-bold ${color.label}`}>{idx + 1} Regeneration</h5>
                                      </div>
                                      <div className="text-gray-800 font-semibold">{reg.treatment}</div>
                                      <div className="text-sm text-gray-600 mt-1">{reg.dosage}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Main Treatments */}
                            <div className="bg-white border-x border-gray-200 p-6">
                              <h4 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                                🏥 Ana Uygulamalar
                              </h4>
                              <p className="text-sm text-gray-600 mb-4">
                                {(() => {
                                  const allTreatments = getTreatmentsForAllSystems();
                                  return allTreatments.length > 1
                                    ? `${bestTreatment.system} hastalığı için en az bir ana uygulama seçmelisiniz`
                                    : 'Tedaviye başlamak için en az bir ana uygulama seçmelisiniz';
                                })()}
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {bestTreatment.phases.mainTreatments.map((mainTreatment: any, mtIndex: number) => {
                                  const systemSelections = selectedApplicationsBySystem[bestTreatment.system] || [];
                                  const isSelected = systemSelections.includes(mainTreatment.treatment);
                                  return (
                                    <div
                                      key={mtIndex}
                                      onClick={() => handleMainApplicationToggle(mainTreatment.treatment, bestTreatment.system)}
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
                                      {bestTreatment.frequency && (
                                        <div className={`text-sm font-medium mt-2 transition-all ${
                                          isSelected ? 'text-purple-700' : 'text-purple-600'
                                        }`}>
                                          📅 {bestTreatment.frequency}
                                        </div>
                                      )}
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
                                  <div className="font-semibold text-gray-900">{bestTreatment.control || '4 AYDA 1 KONTROL'}</div>
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
                                  {bestTreatment.symptomConditions.map((condition: any, idx: number) => {
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

                            <div className="bg-white rounded-b-2xl"></div>
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

          {/* Rutin Tedavi Programı */}
          <div className="px-6 pb-2">
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createRoutineProgram}
                onChange={(e) => setCreateRoutineProgram(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-semibold text-gray-700">
                Rutin Tedavi Programı Oluştur (Çağrı Merkezi için)
              </span>
            </label>

            {createRoutineProgram && (
              <>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sıklık</label>
                  <select
                    value={routineFrequency}
                    onChange={(e) => setRoutineFrequency(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="Günlük">Günlük</option>
                    <option value="Haftada 2 kez">Haftada 2 kez</option>
                    <option value="Haftalık">Haftalık</option>
                    <option value="2 Haftada 1">2 Haftada 1</option>
                    <option value="Aylık">Aylık</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Seans Sayısı</label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={routineTotalSessions}
                    onChange={(e) => setRoutineTotalSessions(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Çağrı Merkezi Notu</label>
                  <input
                    type="text"
                    value={routineNotes}
                    onChange={(e) => setRoutineNotes(e.target.value)}
                    placeholder="Örn: Sabah saatlerini tercih ediyor"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* Rutin Anamnez Talebi */}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={routineAnamnezRequired}
                    onChange={(e) => setRoutineAnamnezRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">Her randevuda anamnez talep et</span>
                </label>
                {routineAnamnezRequired && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Talep Edilecek Anamnez Formları</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Genel Kontrol','Dermatolojik Sistem','Solunum Sistemi','Kas – İskelet Sistemi','Santral Sinir Sistemi','Gastrointestinal Sistem','Kardiyovasküler Sistem','Psikolojik Değerlendirme','Ürogenital Sistem Hastalıkları','Endokrin Sistem'].map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={routineAnamnezTemplates.includes(s)}
                            onChange={(e) => setRoutineAnamnezTemplates(prev =>
                              e.target.checked ? [...prev, s] : prev.filter(t => t !== s)
                            )}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-700">{s}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </>
            )}
          </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 p-6 rounded-b-2xl">
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 hover:text-gray-900 font-medium transition-all duration-200"
            >
              İptal
            </button>
            <button
              onClick={handleStartTreatment}
              disabled={loading || !areAllDiseasesValidated()}
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
                  {!areAllDiseasesValidated() && (
                    <span className="ml-2 text-xs opacity-75">
                      {(() => {
                        const allTreatments = getTreatmentsForAllSystems();
                        return allTreatments.length > 1 
                          ? "(Her hastalık için tedavi seçin)" 
                          : "(Ana uygulama seçin)";
                      })()}
                    </span>
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