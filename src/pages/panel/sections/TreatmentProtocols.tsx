import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { DIAGNOSIS_SYSTEMS } from '../../../constants';
import TreatmentProtocolsModal from '../components/TreatmentProtocolsModal';
import ApplicationManagementModal from '../components/ApplicationManagementModal';
import ApplicationSelector from '../components/ApplicationSelector';

interface TreatmentProtocolsProps {
  doctorProfile: {
    clinicId: string;
    fullName: string;
  } | null;
}

// Available symptoms from anamnesis
const AVAILABLE_SYMPTOMS = [
  { key: 'uykuHali', label: 'Uyku Hali' },
  { key: 'gozdeUcusmalar', label: 'Gözde Uçuşmalar' },
  { key: 'carpinti', label: 'Çarpıntı' },
  { key: 'siskinlik', label: 'Şişkinlik' },
  { key: 'adetDuzensizligi', label: 'Adet Düzensizliği' },
  { key: 'dengeKaybi', label: 'Denge Kaybı' },
  { key: 'yayginKasAgrisi', label: 'Yaygın Kas Ağrısı' },
  { key: 'nefesAlmadaGucluk', label: 'Nefes Almada Güçlük' },
  { key: 'ustume', label: 'Üşüme' },
  { key: 'terleme', label: 'Terleme' },
  { key: 'stres', label: 'Stres' },
  { key: 'agriliAdet', label: 'Ağrılı Adet' },
  { key: 'uykuDuzensizligi', label: 'Uyku Düzensizliği' },
  { key: 'oksuruk', label: 'Öksürük' },
  { key: 'balgam', label: 'Balgam' },
  { key: 'kasilmaVeKramplar', label: 'Kasılma Ve Kramplar' },
  { key: 'elAyakUyusmalari', label: 'El Ayak Uyuşmaları' },
  { key: 'unutkanlik', label: 'Unutkanlık' },
  { key: 'kasinti', label: 'Kaşıntı' },
  { key: 'idrarKacirma', label: 'İdrar Kaçırma' },
  { key: 'idrardaYanma', label: 'İdrarda Yanma' },
  { key: 'geceIdraraKalkma', label: 'Gece İdrara Kalkma' },
  { key: 'kesikKesikIdrar', label: 'Kesik Kesik İdrar' },
  { key: 'kabizlik', label: 'Kabızlık' },
  { key: 'karindaGaz', label: 'Karında Gaz' },
  { key: 'belAgrisi', label: 'Bel Ağrısı' },
  { key: 'ishal', label: 'İshal (Diare)' },
  { key: 'boyunAgrisi', label: 'Boyun Ağrısı' },
  { key: 'yayginOdem', label: 'Yaygın Ödem' },
  { key: 'basur', label: 'Basur' },
  { key: 'eklemAgrilari', label: 'Eklem Ağrıları' },
  { key: 'algiBozuklugu', label: 'Algı Bozukluğu' },
  { key: 'halsizlikYorgunluk', label: 'Halsizlik / Yorgunluk' },
  { key: 'yorgunUyanma', label: 'Yorgun Uyanma' },
  { key: 'basDonmesi', label: 'Baş Dönmesi' },
  { key: 'basAgrisi', label: 'Baş Ağrısı' },
  { key: 'mideAgisi', label: 'Mide Ağısı' },
  { key: 'mideYanmasi', label: 'Mide Yanması' }
];

interface SymptomCondition {
  symptomKey: string;
  symptomLabel: string;
  threshold: number;
}

interface SingleRowProtocol {
  id?: string;
  name: string;
  diagnosisSystem: string;
  ageGroup: '2-7' | '8-14' | 'adult';
  
  // Treatment phases for this single row
  phases: {
    remember: { treatment: string; dosage: string };
    regeneration1: { treatment: string; dosage: string };
    regeneration2: { treatment: string; dosage: string };
    regeneration3?: { treatment: string; dosage: string };
    regeneration4?: { treatment: string; dosage: string };
    mainTreatments: { treatment: string; description: string }[]; // Multiple main treatments with descriptions
  };
  
  frequency: string; // e.g., "Günlük", "Haftalık", "Aylık"
  
  // Activation conditions - now dynamic and flexible
  symptomConditions: SymptomCondition[]; // Multiple symptom requirements
  toxicityRequired: boolean; // Special separate condition  
  conditionsLogic: 'any' | 'all'; // OR vs AND logic for multiple conditions
  
  // Clinic association - protocols are clinic-specific
  clinicId: string;
  
  priority: number;
  control: string;
  createdBy: string;
  createdAt: string;
}

interface SavedProtocol extends SingleRowProtocol {
  id: string;
}

const TreatmentProtocols: React.FC<TreatmentProtocolsProps> = ({ doctorProfile }) => {
  const [selectedDiagnosisSystem, setSelectedDiagnosisSystem] = useState<string>('');
  const [showCreationForm, setShowCreationForm] = useState(false);
  const [showProtocolsModal, setShowProtocolsModal] = useState(false);
  const [modalDiagnosisSystem, setModalDiagnosisSystem] = useState<string>('');
  const [savedProtocols, setSavedProtocols] = useState<SavedProtocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProtocol, setEditingProtocol] = useState<SavedProtocol | null>(null);
  const [isEditingStandardProtocol, setIsEditingStandardProtocol] = useState(false);
  
  // Application management state
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [refreshApplications, setRefreshApplications] = useState(0);
  
  const [formData, setFormData] = useState<SingleRowProtocol>({
    name: '',
    diagnosisSystem: '',
    ageGroup: '2-7',
    phases: {
      remember: { treatment: 'ARD-REM', dosage: '' },
      regeneration1: { treatment: 'DVD-REG', dosage: '' },
      regeneration2: { treatment: 'ISY-REG', dosage: '' },
      mainTreatments: [] // Start with empty array
    },
    frequency: '',
    symptomConditions: [],
    toxicityRequired: false,
    conditionsLogic: 'any',
    clinicId: doctorProfile?.clinicId || 'default-clinic',
    priority: 1,
    control: '4 AYDA 1 KONTROL',
    createdBy: doctorProfile?.fullName || '',
    createdAt: new Date().toISOString()
  });


  // Load saved protocols for this clinic
  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchSavedProtocols();
    }
  }, [doctorProfile]);

  const fetchSavedProtocols = async () => {
    if (!doctorProfile?.clinicId) {
      console.warn('❌ TreatmentProtocols: No clinicId found in doctorProfile:', doctorProfile);
      return;
    }
    
    try {
      console.log('🔍 TreatmentProtocols: Refetching protocols for clinicId:', doctorProfile.clinicId);
      
      const protocolsRef = collection(db, 'treatmentProtocols');
      
      // Fetch all protocols (both clinic-specific and standard)
      const querySnapshot = await getDocs(protocolsRef);
      const protocols: SavedProtocol[] = [];
      const clinicProtocolKeys = new Set<string>();
      
      // First pass: collect clinic-specific protocols
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === doctorProfile.clinicId) {
          protocols.push({
            id: doc.id,
            ...data
          } as SavedProtocol);
          // Create unique key for protocol (diagnosisSystem + ageGroup + name)
          const key = `${data.diagnosisSystem}_${data.ageGroup}_${data.name}`;
          clinicProtocolKeys.add(key);
        }
      });
      
      // Second pass: add standard protocols that don't have clinic-specific versions
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.clinicId === 'STANDARD') {
          const key = `${data.diagnosisSystem}_${data.ageGroup}_${data.name}`;
          if (!clinicProtocolKeys.has(key)) {
            protocols.push({
              id: doc.id,
              ...data
            } as SavedProtocol);
          }
        }
      });
      
      // Client-side sort by createdAt (newest first)
      protocols.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('✅ TreatmentProtocols: Refetched', protocols.length, 'protocols');
      console.log('   - Clinic-specific:', clinicProtocolKeys.size);
      console.log('   - Standard:', protocols.length - clinicProtocolKeys.size);
      setSavedProtocols(protocols);
    } catch (error) {
      console.error('❌ TreatmentProtocols: Error refetching protocols:', error);
    }
  };

  const handleDiagnosisSystemSelect = (system: string) => {
    setSelectedDiagnosisSystem(system);
    setIsEditingStandardProtocol(false);
    setFormData(prev => ({
      ...prev,
      diagnosisSystem: system,
      name: `${system} Protokolü`
    }));
    setShowCreationForm(true);
  };

  const handleViewCurrentTreatments = (system: string) => {
    console.log('🔍 TreatmentProtocols: Opening modal for system:', system);
    console.log('📊 TreatmentProtocols: Current savedProtocols count:', savedProtocols.length);
    setModalDiagnosisSystem(system);
    setShowProtocolsModal(true);
    // Refresh protocols when modal opens to ensure fresh data
    fetchSavedProtocols();
  };

  const updatePhase = (phaseName: keyof typeof formData.phases, field: 'treatment' | 'dosage', value: string) => {
    setFormData(prev => ({
      ...prev,
      phases: {
        ...prev.phases,
        [phaseName]: {
          ...prev.phases[phaseName],
          [field]: value
        }
      }
    }));
  };

  const addConditionalPhase = (phaseType: 'regeneration3' | 'regeneration4') => {
    setFormData(prev => ({
      ...prev,
      phases: {
        ...prev.phases,
        [phaseType]: { treatment: '', dosage: '' }
      }
    }));
  };

  const removeConditionalPhase = (phaseType: 'regeneration3' | 'regeneration4') => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [phaseType]: _, ...restPhases } = formData.phases;
    setFormData(prev => ({
      ...prev,
      phases: restPhases
    }));
  };

  // Main treatment management
  const removeMainTreatment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      phases: {
        ...prev.phases,
        mainTreatments: prev.phases.mainTreatments.filter((_, i) => i !== index)
      }
    }));
  };

  // Symptom condition management
  const addSymptomCondition = () => {
    const newCondition: SymptomCondition = {
      symptomKey: 'stres',
      symptomLabel: 'Stres',
      threshold: 7
    };
    setFormData(prev => ({
      ...prev,
      symptomConditions: [...prev.symptomConditions, newCondition]
    }));
  };

  const removeSymptomCondition = (index: number) => {
    setFormData(prev => ({
      ...prev,
      symptomConditions: prev.symptomConditions.filter((_, i) => i !== index)
    }));
  };

  const updateSymptomCondition = (index: number, field: keyof SymptomCondition, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      symptomConditions: prev.symptomConditions.map((condition, i) => 
        i === index ? { ...condition, [field]: value } : condition
      )
    }));
  };

  const handleSymptomChange = (index: number, symptomKey: string) => {
    const selectedSymptom = AVAILABLE_SYMPTOMS.find(s => s.key === symptomKey);
    if (selectedSymptom) {
      updateSymptomCondition(index, 'symptomKey', symptomKey);
      updateSymptomCondition(index, 'symptomLabel', selectedSymptom.label);
    }
  };

  const saveProtocol = async () => {
    if (!doctorProfile?.clinicId) {
      alert('Klinik bilgisi bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }
    
    try {
      setLoading(true);
      
      // Clean the data to remove undefined values
      const cleanProtocolData = {
        name: formData.name,
        diagnosisSystem: formData.diagnosisSystem,
        ageGroup: formData.ageGroup,
        phases: {
          remember: formData.phases.remember,
          regeneration1: formData.phases.regeneration1,
          regeneration2: formData.phases.regeneration2,
          mainTreatments: formData.phases.mainTreatments || []
        },
        frequency: formData.frequency,
        symptomConditions: formData.symptomConditions || [],
        toxicityRequired: formData.toxicityRequired || false,
        conditionsLogic: formData.conditionsLogic || 'any',
        clinicId: doctorProfile.clinicId,
        priority: formData.priority || 1,
        control: formData.control || '4 AYDA 1 KONTROL',
        createdBy: formData.createdBy || doctorProfile?.fullName || '',
        createdAt: formData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add optional regeneration phases only if they exist and have treatment values
      if (formData.phases.regeneration3 && 
          formData.phases.regeneration3.treatment && 
          formData.phases.regeneration3.treatment.trim() !== '') {
        (cleanProtocolData.phases as any).regeneration3 = formData.phases.regeneration3;
      }
      
      if (formData.phases.regeneration4 && 
          formData.phases.regeneration4.treatment && 
          formData.phases.regeneration4.treatment.trim() !== '') {
        (cleanProtocolData.phases as any).regeneration4 = formData.phases.regeneration4;
      }
      
      if (editingProtocol) {
        // Updating existing protocol
        console.log('✏️ TreatmentProtocols: Updating protocol:', editingProtocol.id);
        await updateDoc(doc(db, 'treatmentProtocols', editingProtocol.id), cleanProtocolData);
        alert('Tedavi protokolü başarıyla güncellendi!');
      } else {
        // Creating new protocol
        console.log('💾 TreatmentProtocols: Creating new protocol for clinicId:', doctorProfile.clinicId);
        const protocolsRef = collection(db, 'treatmentProtocols');
        await addDoc(protocolsRef, cleanProtocolData);
        alert('Tedavi protokolü başarıyla kaydedildi!');
      }
      
      setShowCreationForm(false);
      setSelectedDiagnosisSystem('');
      setEditingProtocol(null);
      setIsEditingStandardProtocol(false);
      fetchSavedProtocols();
      
      // Reset form
      setFormData({
        name: '',
        diagnosisSystem: '',
        ageGroup: '2-7',
        phases: {
          remember: { treatment: 'ARD-REM', dosage: '' },
          regeneration1: { treatment: 'DVD-REG', dosage: '' },
          regeneration2: { treatment: 'ISY-REG', dosage: '' },
          mainTreatments: []
        },
        frequency: '',
        symptomConditions: [],
        toxicityRequired: false,
        conditionsLogic: 'any',
        clinicId: doctorProfile?.clinicId || 'default-clinic',
        priority: 1,
        control: '4 AYDA 1 KONTROL',
        createdBy: doctorProfile?.fullName || '',
        createdAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error saving protocol:', error);
      alert('Protokol kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProtocol = (protocol: SavedProtocol) => {
    console.log('✏️ TreatmentProtocols: Editing protocol:', protocol);
    
    // If editing a standard protocol, create a new clinic-specific version
    const isStandard = protocol.clinicId === 'STANDARD';
    setEditingProtocol(isStandard ? null : protocol);
    setIsEditingStandardProtocol(isStandard);
    
    // Build phases object with proper default values
    const newFormData = {
      name: protocol.name,
      diagnosisSystem: protocol.diagnosisSystem,
      ageGroup: protocol.ageGroup,
      phases: {
        remember: protocol.phases.remember || { treatment: 'ARD-REM', dosage: '' },
        regeneration1: protocol.phases.regeneration1 || { treatment: 'DVD-REG', dosage: '' },
        regeneration2: protocol.phases.regeneration2 || { treatment: 'ISY-REG', dosage: '' },
        mainTreatments: protocol.phases.mainTreatments || []
      } as any, // Temporary any type for flexibility
      frequency: protocol.frequency || '',
      symptomConditions: protocol.symptomConditions || [],
      toxicityRequired: protocol.toxicityRequired || false,
      conditionsLogic: protocol.conditionsLogic || 'any',
      clinicId: isStandard ? (doctorProfile?.clinicId || '') : protocol.clinicId,
      priority: protocol.priority || 1,
      control: protocol.control || '4 AYDA 1 KONTROL',
      createdBy: isStandard ? (doctorProfile?.fullName || '') : (protocol.createdBy || doctorProfile?.fullName || ''),
      createdAt: isStandard ? new Date().toISOString() : protocol.createdAt
    };
    
    // Add optional phases only if they have valid treatment values
    if (protocol.phases.regeneration3 && protocol.phases.regeneration3.treatment) {
      newFormData.phases.regeneration3 = protocol.phases.regeneration3;
    }
    
    if (protocol.phases.regeneration4 && protocol.phases.regeneration4.treatment) {
      newFormData.phases.regeneration4 = protocol.phases.regeneration4;
    }
    
    setFormData(newFormData);
    setSelectedDiagnosisSystem(protocol.diagnosisSystem);
    setShowCreationForm(true);
  };

  const deleteProtocol = async (protocolId: string) => {
    const protocol = savedProtocols.find(p => p.id === protocolId);
    
    // Prevent deleting standard protocols
    if (protocol?.clinicId === 'STANDARD') {
      alert('Standart protokoller silinemez. Sadece kendi kliniğinize özel protokolleri silebilirsiniz.');
      return;
    }
    
    if (window.confirm('Bu protokolü silmek istediğinizden emin misiniz?')) {
      try {
        console.log('🗑️ TreatmentProtocols: Deleting protocol:', protocolId);
        await deleteDoc(doc(db, 'treatmentProtocols', protocolId));
        fetchSavedProtocols();
        alert('Protokol başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting protocol:', error);
        alert('Protokol silinirken bir hata oluştu.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">
              Dinamik Tedavi Protokolleri 🔧
            </h1>
            <p className="text-white/70 text-lg">
              Tanı sistemlerine göre özelleştirilmiş tedavi protokolleri oluşturun
            </p>
          </div>
          <div className="ml-6">
            <button
              onClick={() => setShowApplicationModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
            >
              🏥 Uygulama Yönetimi
            </button>
          </div>
        </div>
      </div>

      {!showCreationForm ? (
        <>
          {/* Diagnosis System Selection */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Tanı Sistemi Seçin 🔍
              </h2>
              <p className="text-white/70 mb-6">
                Hangi tanı sistemi için tedavi protokolü oluşturmak istiyorsunuz?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DIAGNOSIS_SYSTEMS.map((system) => (
                <div
                  key={system}
                  className="p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm border border-white/20 rounded-2xl hover:from-blue-500/20 hover:to-purple-500/20 transition-all duration-300 group"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                      {system === 'Dermatolojik Sistem' ? '🧴' :
                       system === 'Solunum Sistemi' ? '🫁' :
                       system === 'Kas – İskelet Sistemi' ? '🦴' :
                       system === 'Santral Sinir Sistemi' ? '🧠' :
                       system === 'Gastrointestinal Sistem' ? '🫄' :
                       system === 'Kardiyovasküler Sistem' ? '❤️' :
                       system === 'Pisikolojik Değerlendirme' ? '🧘' :
                       system === 'Ürogental Sistem Hastalıkları' ? '🫧' :
                       system === 'Endokrin Sistem' ? '⚗️' : '🔬'
                      }
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-4">{system}</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => handleDiagnosisSystemSelect(system)}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm"
                      >
                        Protokol Oluştur
                      </button>
                      <button
                        onClick={() => handleViewCurrentTreatments(system)}
                        className="w-full py-2 px-4 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm"
                      >
                        Güncel Tedaviyi Görüntüle
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Protocols */}
          {savedProtocols.length > 0 && (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                📋 Kaydedilmiş Protokoller ({savedProtocols.length})
              </h2>
              
              <div className="space-y-4">
                {savedProtocols.map((protocol) => (
                  <div key={protocol.id} className="bg-white/5 border border-white/20 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">{protocol.name}</h3>
                        
                        {/* Activation Conditions */}
                        {(protocol.symptomConditions.length > 0 || protocol.toxicityRequired) && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {protocol.symptomConditions.map((condition, idx) => (
                              <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs flex items-center gap-1">
                                📊 {condition.symptomLabel} ≥{condition.threshold}
                              </span>
                            ))}
                            {protocol.toxicityRequired && (
                              <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs flex items-center gap-1">
                                ☠️ Yüksek Toksisite
                              </span>
                            )}
                            {(protocol.symptomConditions.length > 1 || (protocol.symptomConditions.length > 0 && protocol.toxicityRequired)) && (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                                {protocol.conditionsLogic === 'all' ? 'TÜMÜ' : 'BİRİ YETER'}
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-white/60 flex-wrap">
                          <span>🏥 {protocol.diagnosisSystem}</span>
                          <span>👤 {protocol.ageGroup === 'adult' ? 'Yetişkin' : `${protocol.ageGroup} Yaş`}</span>
                          {protocol.frequency && <span>📅 {protocol.frequency}</span>}
                          <span>👨‍⚕️ {protocol.createdBy}</span>
                          <span>📅 {new Date(protocol.createdAt).toLocaleDateString('tr-TR')}</span>
                          {protocol.clinicId === 'STANDARD' && (
                            <span className="px-2 py-1 bg-blue-500/20 border border-blue-400/30 rounded text-blue-300 text-xs font-medium">
                              🌐 Standart
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditProtocol(protocol)}
                          className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200"
                        >
                          {protocol.clinicId === 'STANDARD' ? '📋 Kopyala' : '✏️ Düzenle'}
                        </button>
                        {protocol.clinicId !== 'STANDARD' && (
                          <button
                            onClick={() => deleteProtocol(protocol.id)}
                            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200"
                          >
                            🗑️ Sil
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              {editingProtocol ? '✏️' : isEditingStandardProtocol ? '📋' : '🏥'} {selectedDiagnosisSystem} - {editingProtocol ? 'Tedavi Protokolü Düzenle' : isEditingStandardProtocol ? 'Varsayılan Protokolden Klinik Özel Kopya Oluştur' : 'Tedavi Protokolü Oluştur'}
            </h2>
            <button
              onClick={() => {
                setShowCreationForm(false);
                setSelectedDiagnosisSystem('');
                setEditingProtocol(null);
                setIsEditingStandardProtocol(false);
              }}
              className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded-xl text-gray-300 hover:text-gray-200 transition-all duration-200"
            >
              ← Geri
            </button>
          </div>

          {/* Warning for editing standard protocol */}
          {isEditingStandardProtocol && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="text-sm text-yellow-200">
                  <p className="font-medium mb-1">Varsayılan Protokol Kopyalanıyor</p>
                  <p className="text-yellow-200/80">
                    Bu varsayılan protokolü düzenliyorsunuz. Kaydettiğinizde <strong>sadece kendi kliniğinize özel</strong> bir kopya oluşturulacak. 
                    Diğer klinikler orijinal varsayılan protokolü görmeye devam edecek.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Protokol Adı *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Örn: Dermatolojik Sistem - Stres Protokolü"
                />
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Yaş Grubu *
                </label>
                <select
                  value={formData.ageGroup}
                  onChange={(e) => setFormData(prev => ({ ...prev, ageGroup: e.target.value as '2-7' | '8-14' | 'adult' }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="2-7" className="text-gray-900 bg-white">2-7 Yaş</option>
                  <option value="8-14" className="text-gray-900 bg-white">8-14 Yaş</option>
                  <option value="adult" className="text-gray-900 bg-white">Yetişkin</option>
                </select>
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Tedavi Sıklığı
                </label>
                <input
                  type="text"
                  value={formData.frequency}
                  onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value }))}
                  placeholder="Örn: Günlük, Haftalık, Aylık"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

            </div>

            {/* Activation Conditions */}
            <div className="bg-white/5 border border-white/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">⚠️ Ne Zaman Uygulanacak?</h3>
              <p className="text-white/70 text-sm mb-6">
                Bu protokol hangi hasta durumunda uygulanacağını belirleyin (anamnez sonuçlarına göre)
              </p>
              
              {/* Toxicity Requirement */}
              <div className="mb-6">
                <label className="flex items-center gap-3 cursor-pointer p-4 border-2 border-white/20 rounded-lg hover:border-red-500/50 transition-all duration-200">
                  <input
                    type="checkbox"
                    checked={formData.toxicityRequired}
                    onChange={(e) => setFormData(prev => ({ ...prev, toxicityRequired: e.target.checked }))}
                    className="w-5 h-5 text-red-600 bg-white/10 border-white/20 rounded focus:ring-red-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">☠️</span>
                    <div>
                      <span className="text-white font-medium">Yüksek Toksisite Gerekli</span>
                      <p className="text-white/60 text-sm">Bu protokol sadece anamnez sonucunda "Yüksek Toksisite" tespit edilen hastalara uygulanır</p>
                    </div>
                  </div>
                </label>
              </div>

              {/* Dynamic Symptom Conditions */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold flex items-center gap-2">
                    📊 Semptom Koşulları
                  </h4>
                  <button
                    onClick={addSymptomCondition}
                    type="button"
                    className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm"
                  >
                    + Semptom Koşulu Ekle
                  </button>
                </div>

                {formData.symptomConditions.length === 0 && (
                  <div className="p-4 border-2 border-dashed border-white/20 rounded-lg text-center">
                    <span className="text-white/50 text-sm">
                      Henüz semptom koşulu eklenmemiş. Bu protokol her zaman uygulanabilir olacak.
                    </span>
                  </div>
                )}

                <div className="space-y-4">
                  {formData.symptomConditions.map((condition, index) => (
                    <div key={index} className="p-4 bg-white/5 border border-white/20 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-white/70 text-xs font-medium mb-1">
                            Semptom
                          </label>
                          <select
                            value={condition.symptomKey}
                            onChange={(e) => handleSymptomChange(index, e.target.value)}
                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          >
                            {AVAILABLE_SYMPTOMS.map((symptom) => (
                              <option key={symptom.key} value={symptom.key} className="text-gray-900 bg-white">
                                {symptom.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-32">
                          <label className="block text-white/70 text-xs font-medium mb-1">
                            Minimum Değer
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="1"
                              max="10"
                              value={condition.threshold}
                              onChange={(e) => updateSymptomCondition(index, 'threshold', parseInt(e.target.value))}
                              className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="w-8 h-8 bg-white/10 border border-white/20 rounded flex items-center justify-center">
                              <span className="text-white text-xs font-semibold">{condition.threshold}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeSymptomCondition(index)}
                          type="button"
                          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 hover:text-red-200 text-sm transition-all duration-200"
                        >
                          Kaldır
                        </button>
                      </div>
                      <p className="text-white/50 text-xs mt-2">
                        Bu semptom {condition.threshold} ve üzeri değere sahip hastalara uygulanır
                      </p>
                    </div>
                  ))}
                </div>

                {/* Logic for Multiple Conditions */}
                {(formData.symptomConditions.length > 1 || (formData.symptomConditions.length > 0 && formData.toxicityRequired)) && (
                  <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <h5 className="text-purple-300 font-medium mb-3">🔗 Koşullar Arası Mantık</h5>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="conditionsLogic"
                          value="any"
                          checked={formData.conditionsLogic === 'any'}
                          onChange={(e) => setFormData(prev => ({ ...prev, conditionsLogic: e.target.value as 'any' | 'all' }))}
                          className="w-4 h-4 text-purple-600"
                        />
                        <span className="text-purple-200">
                          <strong>VEYA</strong> - Koşullardan herhangi biri karşılanırsa uygula
                        </span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="conditionsLogic"
                          value="all"
                          checked={formData.conditionsLogic === 'all'}
                          onChange={(e) => setFormData(prev => ({ ...prev, conditionsLogic: e.target.value as 'any' | 'all' }))}
                          className="w-4 h-4 text-purple-600"
                        />
                        <span className="text-purple-200">
                          <strong>VE</strong> - Tüm koşullar aynı anda karşılanmalı
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Treatment Row Configuration */}
            <div className="bg-white/5 border border-white/20 rounded-xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">💊 Tedavi Sırası - {formData.ageGroup === 'adult' ? 'Yetişkin' : `${formData.ageGroup} Yaş`}</h3>
              <p className="text-white/70 text-sm mb-6">
                Bu yaş grubu için tedavi sırasını ve dozajları belirleyin (tablodaki bir satıra denk gelir)
              </p>
              
              <div className="space-y-6">
                {/* Core Treatment Phases */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Remember */}
                  <div className="bg-white/5 border border-green-500/30 rounded-lg p-4">
                    <h4 className="text-green-300 font-medium mb-3 flex items-center gap-2">
                      🔄 Remember
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">İlaç Adı</label>
                        <input
                          type="text"
                          value={formData.phases.remember.treatment}
                          onChange={(e) => updatePhase('remember', 'treatment', e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">Dozaj</label>
                        <input
                          type="text"
                          value={formData.phases.remember.dosage}
                          onChange={(e) => updatePhase('remember', 'dosage', e.target.value)}
                          placeholder="Örn: 2X1/2 T"
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 1 Regeneration */}
                  <div className="bg-white/5 border border-green-500/30 rounded-lg p-4">
                    <h4 className="text-green-300 font-medium mb-3 flex items-center gap-2">
                      🔄 1 Regeneration
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">İlaç Adı</label>
                        <input
                          type="text"
                          value={formData.phases.regeneration1.treatment}
                          onChange={(e) => updatePhase('regeneration1', 'treatment', e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">Dozaj</label>
                        <input
                          type="text"
                          value={formData.phases.regeneration1.dosage}
                          onChange={(e) => updatePhase('regeneration1', 'dosage', e.target.value)}
                          placeholder="Örn: 3X1 A"
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2 Regeneration */}
                  <div className="bg-white/5 border border-green-500/30 rounded-lg p-4">
                    <h4 className="text-green-300 font-medium mb-3 flex items-center gap-2">
                      🔄 2 Regeneration
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">İlaç Adı</label>
                        <input
                          type="text"
                          value={formData.phases.regeneration2.treatment}
                          onChange={(e) => updatePhase('regeneration2', 'treatment', e.target.value)}
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/70 text-xs font-medium mb-1">Dozaj</label>
                        <input
                          type="text"
                          value={formData.phases.regeneration2.dosage}
                          onChange={(e) => updatePhase('regeneration2', 'dosage', e.target.value)}
                          placeholder="Örn: 2X2 T"
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Main Treatments */}
                  <div className="bg-white/5 border border-blue-500/30 rounded-lg p-4 col-span-2">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-blue-300 font-medium flex items-center gap-2">
                        ⭐ Uygulama
                      </h4>
                    </div>

                    {/* Application Selector */}
                    <div className="mb-4 p-3 bg-white/5 border border-green-500/30 rounded-lg">
                      <h5 className="text-green-300 font-medium mb-3 flex items-center gap-2">
                        📋 Kayıtlı Uygulamalardan Seç
                      </h5>
                      <div className="border border-white/10 rounded-lg p-2 bg-white/5">
                        <ApplicationSelector
                          clinicId={doctorProfile?.clinicId || ''}
                          onApplicationSelect={(application) => {
                            // Add selected application to main treatments
                            const newTreatment = {
                              treatment: application.name,
                              description: application.description || application.name
                            };
                            setFormData(prev => ({
                              ...prev,
                              phases: {
                                ...prev.phases,
                                mainTreatments: [...prev.phases.mainTreatments, newTreatment]
                              }
                            }));
                          }}
                          selectedApplications={formData.phases.mainTreatments.map(mt => mt.treatment)}
                          refreshTrigger={refreshApplications}
                        />
                      </div>
                    </div>

                    {/* Selected Applications Display */}
                    {formData.phases.mainTreatments.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-blue-300 font-medium flex items-center gap-2">
                          ✅ Seçilen Uygulamalar
                        </h5>
                        {formData.phases.mainTreatments.map((mainTreatment, index) => (
                          <div key={index} className="bg-white/5 border border-white/10 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-blue-200 text-sm font-medium">
                                {mainTreatment.treatment}
                              </span>
                              <button
                                onClick={() => removeMainTreatment(index)}
                                type="button"
                                className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 text-xs"
                              >
                                Kaldır
                              </button>
                            </div>
                            {mainTreatment.description && (
                              <p className="text-white/60 text-xs">
                                {mainTreatment.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Conditional Phases */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-medium">Koşullu Ek Fazlar</h4>
                    <div className="flex gap-2">
                      {!formData.phases.regeneration3 && (
                        <button
                          onClick={() => addConditionalPhase('regeneration3')}
                          className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-blue-300 text-sm transition-all duration-200"
                        >
                          + 3 Regeneration Ekle
                        </button>
                      )}
                      {!formData.phases.regeneration4 && (
                        <button
                          onClick={() => addConditionalPhase('regeneration4')}
                          className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded text-purple-300 text-sm transition-all duration-200"
                        >
                          + 4 Regeneration Ekle
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 3 Regeneration (Optional) */}
                    {formData.phases.regeneration3 && (
                      <div className="bg-white/5 border border-orange-500/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-orange-300 font-medium flex items-center gap-2">
                            🔄 3 Regeneration (Koşullu)
                          </h4>
                          <button
                            onClick={() => removeConditionalPhase('regeneration3')}
                            className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 text-xs"
                          >
                            Kaldır
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <input
                              type="text"
                              value={formData.phases.regeneration3.treatment}
                              onChange={(e) => updatePhase('regeneration3', 'treatment', e.target.value)}
                              placeholder="İlaç adı (örn: SDS-X, DTX-19)"
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={formData.phases.regeneration3.dosage}
                              onChange={(e) => updatePhase('regeneration3', 'dosage', e.target.value)}
                              placeholder="Dozaj (örn: 2X1/2 T)"
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4 Regeneration (Optional) */}
                    {formData.phases.regeneration4 && (
                      <div className="bg-white/5 border border-purple-500/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-purple-300 font-medium flex items-center gap-2">
                            🔄 4 Regeneration (Koşullu)
                          </h4>
                          <button
                            onClick={() => removeConditionalPhase('regeneration4')}
                            className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 text-xs"
                          >
                            Kaldır
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <input
                              type="text"
                              value={formData.phases.regeneration4.treatment}
                              onChange={(e) => updatePhase('regeneration4', 'treatment', e.target.value)}
                              placeholder="İlaç adı (örn: SDS-X)"
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={formData.phases.regeneration4.dosage}
                              onChange={(e) => updatePhase('regeneration4', 'dosage', e.target.value)}
                              placeholder="Dozaj (örn: 3X1/2 T)"
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveProtocol}
                disabled={
                  !formData.name || 
                  formData.phases.mainTreatments.length === 0 || 
                  loading
                }
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2"></div>
                    Kaydediliyor...
                  </>
                ) : (
                  editingProtocol ? '💾 Protokolü Güncelle' : '💾 Protokolü Kaydet'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Treatment Protocols Modal */}
      <TreatmentProtocolsModal
        isOpen={showProtocolsModal}
        onClose={() => setShowProtocolsModal(false)}
        diagnosisSystem={modalDiagnosisSystem}
        savedProtocols={savedProtocols}
        onCreateProtocol={(system) => {
          setSelectedDiagnosisSystem(system);
          setFormData(prev => ({
            ...prev,
            diagnosisSystem: system,
            name: `${system} Protokolü`
          }));
          setShowCreationForm(true);
          setShowProtocolsModal(false); // Close modal when creating new protocol
        }}
        onEditProtocol={handleEditProtocol}
        doctorProfile={doctorProfile} // Pass doctor profile for clinic validation
      />
      
      {/* Application Management Modal */}
      <ApplicationManagementModal
        isOpen={showApplicationModal}
        onClose={() => setShowApplicationModal(false)}
        doctorProfile={doctorProfile}
        onApplicationsUpdate={() => {
          // Trigger refresh of applications in selector
          setRefreshApplications(prev => prev + 1);
        }}
      />
    </div>
  );
};

export default TreatmentProtocols;
