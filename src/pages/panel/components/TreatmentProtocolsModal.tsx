import React, { useEffect } from 'react';

// Import types - these should match the main TreatmentProtocols component
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
    mainTreatments: { treatment: string; description: string }[]; // Multiple main treatments with descriptions
  };
  
  frequency: string;
  
  symptomConditions: SymptomCondition[];
  toxicityRequired: boolean;
  conditionsLogic: 'any' | 'all';
  
  // Clinic association - protocols are clinic-specific
  clinicId: string;
  
  priority: number;
  control: string;
  createdBy: string;
  createdAt: string;
}

interface TreatmentProtocolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnosisSystem: string;
  savedProtocols: SavedProtocol[];
  onCreateProtocol: (system: string) => void;
  onEditProtocol: (protocol: SavedProtocol) => void;
  doctorProfile?: any; // Add doctor profile for clinic validation
}

const TreatmentProtocolsModal: React.FC<TreatmentProtocolsModalProps> = ({
  isOpen,
  onClose,
  diagnosisSystem,
  savedProtocols,
  onCreateProtocol,
  onEditProtocol,
  doctorProfile
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Double-check clinic filtering as a safety measure
  const clinicFilteredProtocols = doctorProfile?.clinicId 
    ? savedProtocols.filter(p => p.clinicId === doctorProfile.clinicId)
    : savedProtocols;
    
  const systemProtocols = clinicFilteredProtocols.filter(p => p.diagnosisSystem === diagnosisSystem);
  
  console.log('🏥 TreatmentProtocolsModal: Filtering for clinicId:', doctorProfile?.clinicId);
  console.log('📋 TreatmentProtocolsModal: Total protocols received:', savedProtocols.length);
  console.log('🔍 TreatmentProtocolsModal: After clinic filter:', clinicFilteredProtocols.length);
  console.log('🎯 TreatmentProtocolsModal: After system filter:', systemProtocols.length);

  // Group protocols by age group for better organization
  const protocolsByAge = {
    '2-7': systemProtocols.filter(p => p.ageGroup === '2-7'),
    '8-14': systemProtocols.filter(p => p.ageGroup === '8-14'),
    'adult': systemProtocols.filter(p => p.ageGroup === 'adult')
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                📊 {diagnosisSystem} - Güncel Tedavi Protokolleri
              </h2>
              <p className="text-white/70">
                Bu tanı sistemi için oluşturulan tüm tedavi protokolleri
                {doctorProfile?.clinicName && (
                  <span className="block text-blue-400 text-sm mt-1">
                    🏥 {doctorProfile.clinicName} Kliniği
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 max-h-[calc(90vh-200px)] overflow-y-auto p-6 custom-scrollbar">
          {systemProtocols.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-xl font-bold text-white mb-2">
                Henüz Protokol Oluşturulmamış
              </h3>
              <p className="text-white/60 mb-6">
                Bu tanı sistemi için henüz tedavi protokolü oluşturulmamış.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onCreateProtocol(diagnosisSystem);
                }}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              >
                İlk Protokolü Oluştur
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(protocolsByAge).map(([ageGroup, protocols]) => {
                  if (protocols.length === 0) return null;
                  
                  return (
                    <div key={ageGroup} className="bg-white/5 border border-white/20 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        👥 {ageGroup === 'adult' ? 'Yetişkin' : `${ageGroup} Yaş`} Protokolleri
                      </h3>
                      
                      {/* Medical Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/20">
                              <th className="text-left text-white/70 font-medium p-3 bg-red-500/10 min-w-[120px]">Remember</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-orange-500/10 min-w-[120px]">1 Regeneration</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-yellow-500/10 min-w-[120px]">2 Regeneration</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-green-500/10 min-w-[120px]">3 Regeneration</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-blue-500/10 min-w-[120px]">4 Regeneration</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-purple-500/10 min-w-[140px]">Uygulamalar</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-gray-500/10 min-w-[100px]">Hastalık</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-indigo-500/10 min-w-[150px]">Koşullar</th>
                              <th className="text-left text-white/70 font-medium p-3 bg-blue-600/10 min-w-[80px]">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {protocols.map((protocol, index) => (
                              <tr key={protocol.id} className={`border-b border-white/10 ${index % 2 === 0 ? 'bg-white/5' : 'bg-white/2'}`}>
                                {/* Remember */}
                                <td className="p-3 text-white">
                                  <div className="font-medium text-red-300">{protocol.phases.remember.treatment}</div>
                                  <div className="text-xs text-white/60">{protocol.phases.remember.dosage}</div>
                                </td>
                                
                                {/* 1 Regeneration */}
                                <td className="p-3 text-white">
                                  <div className="font-medium text-orange-300">{protocol.phases.regeneration1.treatment}</div>
                                  <div className="text-xs text-white/60">{protocol.phases.regeneration1.dosage}</div>
                                </td>
                                
                                {/* 2 Regeneration */}
                                <td className="p-3 text-white">
                                  <div className="font-medium text-yellow-300">{protocol.phases.regeneration2.treatment}</div>
                                  <div className="text-xs text-white/60">{protocol.phases.regeneration2.dosage}</div>
                                </td>
                                
                                {/* 3 Regeneration */}
                                <td className="p-3 text-white">
                                  {protocol.phases.regeneration3 ? (
                                    <>
                                      <div className="font-medium text-green-300">{protocol.phases.regeneration3.treatment}</div>
                                      <div className="text-xs text-white/60">{protocol.phases.regeneration3.dosage}</div>
                                    </>
                                  ) : (
                                    <span className="text-white/40 text-xs">-</span>
                                  )}
                                </td>
                                
                                {/* 4 Regeneration */}
                                <td className="p-3 text-white">
                                  {protocol.phases.regeneration4 ? (
                                    <>
                                      <div className="font-medium text-blue-300">{protocol.phases.regeneration4.treatment}</div>
                                      <div className="text-xs text-white/60">{protocol.phases.regeneration4.dosage}</div>
                                    </>
                                  ) : (
                                    <span className="text-white/40 text-xs">-</span>
                                  )}
                                </td>
                                
                                {/* Main Treatments */}
                                <td className="p-3 text-white">
                                  <div className="space-y-2">
                                    {protocol.phases.mainTreatments.map((mainTreatment, mtIndex) => (
                                      <div key={mtIndex} className={`${mtIndex > 0 ? 'border-t border-white/10 pt-2' : ''}`}>
                                        <div className="font-medium text-purple-300">{mainTreatment.treatment}</div>
                                        {mainTreatment.description && (
                                          <div className="text-xs text-gray-400 italic mt-1">{mainTreatment.description}</div>
                                        )}
                                      </div>
                                    ))}
                                    {protocol.frequency && (
                                      <div className="text-xs text-green-400 mt-1">📅 {protocol.frequency}</div>
                                    )}
                                  </div>
                                </td>
                                
                                {/* Disease/System */}
                                <td className="p-3 text-white">
                                  <div className="text-xs text-gray-300 mb-1">{protocol.name}</div>
                                  <div className="text-xs text-white/60">{protocol.control}</div>
                                  <div className="text-xs text-blue-400 mt-1">Öncelik: {protocol.priority}</div>
                                </td>
                                
                                {/* Conditions */}
                                <td className="p-3 text-white">
                                  <div className="space-y-1">
                                    {protocol.toxicityRequired && (
                                      <div className="inline-block px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs mb-1 mr-1">
                                        ☠️ Yüksek Toksisite
                                      </div>
                                    )}
                                    {protocol.symptomConditions.map((condition, idx) => (
                                      <div key={idx} className="inline-block px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs mb-1 mr-1">
                                        📊 {condition.symptomLabel} ≥{condition.threshold}
                                      </div>
                                    ))}
                                    {protocol.symptomConditions.length === 0 && !protocol.toxicityRequired && (
                                      <div className="text-green-400 text-xs">✅ Normal Protokol</div>
                                    )}
                                    {(protocol.symptomConditions.length > 1 || (protocol.symptomConditions.length > 0 && protocol.toxicityRequired)) && (
                                      <div className="text-xs text-purple-300 mt-1 font-medium">
                                        🔗 {protocol.conditionsLogic === 'all' ? 'TÜMÜ' : 'BİRİ YETER'}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                
                                {/* Actions */}
                                <td className="p-3 text-white">
                                  <button
                                    onClick={() => {
                                      onEditProtocol(protocol);
                                      onClose();
                                    }}
                                    className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-xs"
                                  >
                                    ✏️ Düzenle
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Summary */}
                      <div className="mt-4 p-4 bg-white/5 border border-white/20 rounded-lg">
                        <div className="text-sm text-white/70">
                          <strong className="text-white">📈 Özet:</strong> {protocols.length} protokol • 
                          Normal: {protocols.filter(p => p.symptomConditions.length === 0 && !p.toxicityRequired).length} • 
                          Koşullu: {protocols.filter(p => p.symptomConditions.length > 0 || p.toxicityRequired).length} • 
                          Ortalama Öncelik: {Math.round(protocols.reduce((sum, p) => sum + p.priority, 0) / protocols.length)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Overall Summary */}
                <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-green-300 mb-4 flex items-center gap-2">
                    📊 Genel Özet - {diagnosisSystem}
                    {doctorProfile?.clinicName && (
                      <span className="text-sm text-blue-400 font-normal">
                        ({doctorProfile.clinicName})
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-white">{systemProtocols.length}</div>
                      <div className="text-sm text-white/70">Toplam Protokol</div>
                    </div>
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">
                        {systemProtocols.filter(p => p.symptomConditions.length === 0 && !p.toxicityRequired).length}
                      </div>
                      <div className="text-sm text-white/70">Normal Protokol</div>
                    </div>
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">
                        {systemProtocols.filter(p => p.symptomConditions.length > 0 || p.toxicityRequired).length}
                      </div>
                      <div className="text-sm text-white/70">Koşullu Protokol</div>
                    </div>
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-400">
                        {new Set(systemProtocols.map(p => p.createdBy)).size}
                      </div>
                      <div className="text-sm text-white/70">Farklı Doktor</div>
                    </div>
                  </div>
                  {doctorProfile?.clinicId && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="text-xs text-blue-300 text-center">
                        🏥 Bu protokoller sadece <strong>{doctorProfile.clinicName || doctorProfile.clinicId}</strong> kliniği için geçerlidir
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white p-6 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">
              Protokoller otomatik olarak hasta durumuna göre seçilecektir
              {doctorProfile?.clinicId && (
                <span className="block text-xs text-blue-400 mt-1">
                  🏥 Sadece bu klinik protokolleri görüntüleniyor
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onClose();
                  onCreateProtocol(diagnosisSystem);
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              >
                + Yeni Protokol Ekle
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white hover:text-white transition-all duration-200"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TreatmentProtocolsModal;
