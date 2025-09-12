import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { 
  DISEASE_CATEGORIES,
  AGE_GROUPS,
  TREATMENT_COURSES,
  APPLICATION_METHODS
} from '../../../constants';
import CreateDiseaseModal from './CreateDiseaseModal';
import CreateProtocolModal from './CreateProtocolModal';

interface Disease {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  icd10Code: string;
  description: string;
  symptoms: string[];
  riskFactors: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DiseaseProtocol {
  id: string;
  diseaseId: string;
  diseaseName: string;
  ageGroupId: string;
  ageGroupName: string;
  treatmentCourseId: string;
  treatmentCourseName: string;
  applicationMethods: string[];
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  precautions: string;
  expectedResults: string;
  followUpSchedule: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CombinedProtocol {
  id: string;
  name: string;
  description: string;
  primaryDiseaseId: string;
  primaryDiseaseName: string;
  secondaryConditions: string[];
  ageGroupId: string;
  ageGroupName: string;
  treatmentCourseId: string;
  treatmentCourseName: string;
  applicationMethods: string[];
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  precautions: string;
  expectedResults: string;
  followUpSchedule: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TreatmentProtocolsProps {
  doctorProfile: any;
}

const TreatmentProtocols: React.FC<TreatmentProtocolsProps> = ({ doctorProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDisease, setSelectedDisease] = useState<string>('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('');
  const [selectedSecondaryConditions, setSelectedSecondaryConditions] = useState<string[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<DiseaseProtocol | CombinedProtocol | null>(null);
  
  // Modal states
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCreateDiseaseModalOpen, setIsCreateDiseaseModalOpen] = useState(false);
  const [isCreateProtocolModalOpen, setIsCreateProtocolModalOpen] = useState(false);
  const [isEditDiseaseModalOpen, setIsEditDiseaseModalOpen] = useState(false);
  const [isEditProtocolModalOpen, setIsEditProtocolModalOpen] = useState(false);
  
  // Data states
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [diseaseProtocols, setDiseaseProtocols] = useState<DiseaseProtocol[]>([]);
  const [combinedProtocols, setCombinedProtocols] = useState<CombinedProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Available secondary conditions
  const secondaryConditions = ['Stres', 'Anksiyete', 'Depresyon', 'Uyku Problemi', 'Yorgunluk'];

  // Fetch data from Firebase
  const fetchDiseases = async () => {
    try {
      const diseasesRef = collection(db, 'diseases');
      const q = query(diseasesRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const diseasesData: Disease[] = [];
      querySnapshot.forEach((doc) => {
        diseasesData.push({
          id: doc.id,
          ...doc.data()
        } as Disease);
      });
      
      setDiseases(diseasesData);
    } catch (error) {
      console.error('Error fetching diseases:', error);
    }
  };

  const fetchDiseaseProtocols = async () => {
    try {
      const protocolsRef = collection(db, 'diseaseProtocols');
      const q = query(protocolsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const protocolsData: DiseaseProtocol[] = [];
      querySnapshot.forEach((doc) => {
        protocolsData.push({
          id: doc.id,
          ...doc.data()
        } as DiseaseProtocol);
      });
      
      setDiseaseProtocols(protocolsData);
    } catch (error) {
      console.error('Error fetching disease protocols:', error);
    }
  };

  const fetchCombinedProtocols = async () => {
    try {
      const protocolsRef = collection(db, 'combinedProtocols');
      const q = query(protocolsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const protocolsData: CombinedProtocol[] = [];
      querySnapshot.forEach((doc) => {
        protocolsData.push({
          id: doc.id,
          ...doc.data()
        } as CombinedProtocol);
      });
      
      setCombinedProtocols(protocolsData);
    } catch (error) {
      console.error('Error fetching combined protocols:', error);
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      await Promise.all([
        fetchDiseases(),
        fetchDiseaseProtocols(),
        fetchCombinedProtocols()
      ]);
      setLoading(false);
    };
    
    fetchAllData();
  }, []);

  // Filter diseases based on search and category
  const filteredDiseases = useMemo(() => {
    return diseases.filter(disease => {
      const matchesSearch = 
        disease.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        disease.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
        disease.icd10Code.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || disease.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory, diseases]);

  // Get protocols for selected disease and age group
  const availableProtocols = useMemo(() => {
    if (!selectedDisease) return [];
    
    let protocols: (DiseaseProtocol | CombinedProtocol)[] = [];
    
    // Get basic disease protocols
    const diseaseProtocolsFiltered = diseaseProtocols.filter(p => 
      p.diseaseId === selectedDisease && 
      (!selectedAgeGroup || p.ageGroupId === selectedAgeGroup)
    );
    protocols.push(...diseaseProtocolsFiltered);
    
    // Get combined protocols if secondary conditions are selected
    if (selectedSecondaryConditions.length > 0) {
      const combinedProtocolsFiltered = combinedProtocols.filter(p => 
        p.primaryDiseaseId === selectedDisease && 
        (!selectedAgeGroup || p.ageGroupId === selectedAgeGroup) &&
        selectedSecondaryConditions.some(condition => 
          p.secondaryConditions.includes(condition)
        )
      );
      protocols.push(...combinedProtocolsFiltered);
    }
    
    return protocols;
  }, [selectedDisease, selectedAgeGroup, selectedSecondaryConditions, diseaseProtocols, combinedProtocols]);

  const openProtocolDetails = (protocol: DiseaseProtocol | CombinedProtocol) => {
    setSelectedProtocol(protocol);
    setIsDetailsModalOpen(true);
  };

  const closeProtocolDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedProtocol(null);
  };

  const resetSelection = () => {
    setSelectedDisease('');
    setSelectedAgeGroup('');
    setSelectedSecondaryConditions([]);
  };

  const handleDiseaseSelect = (diseaseId: string) => {
    setSelectedDisease(diseaseId);
    setSelectedAgeGroup('');
    setSelectedSecondaryConditions([]);
  };

  const handleAgeGroupSelect = (ageGroupId: string) => {
    setSelectedAgeGroup(ageGroupId);
  };

  const handleSecondaryConditionToggle = (condition: string) => {
    setSelectedSecondaryConditions(prev => 
      prev.includes(condition) 
        ? prev.filter(c => c !== condition)
        : [...prev, condition]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Tedavi Protokolleri 📋
            </h1>
            <p className="text-white/70 text-lg">
              Hastalık bazlı filtreleme ile otomatik doz detayları
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-white/60 text-sm">Toplam Hastalık</div>
              <div className="text-2xl font-bold text-white">
                {diseases.length}
              </div>
            </div>
            <button
              onClick={() => setIsCreateDiseaseModalOpen(true)}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
            >
              + Yeni Hastalık
            </button>
          </div>
        </div>
      </div>

      {/* Search and Category Filter */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Hastalık Arama
            </label>
            <input
              type="text"
              placeholder="Hastalık adı, ICD-10 kodu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Kategori
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            >
              <option value="all" className="text-gray-900 bg-white">Tüm Kategoriler</option>
              {DISEASE_CATEGORIES.map(category => (
                <option key={category} value={category} className="text-gray-900 bg-white">{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Disease Selection */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Hastalık Seçimi</h2>
        
        {filteredDiseases.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-white/70">Arama kriterlerinize uygun hastalık bulunamadı.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDiseases.map((disease) => (
              <div
                key={disease.id}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  selectedDisease === disease.id
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 bg-white/5 hover:bg-white/10'
                }`}
                onClick={() => handleDiseaseSelect(disease.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-white">{disease.name}</h3>
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                    {disease.icd10Code}
                  </span>
                </div>
                <p className="text-white/60 text-sm mb-3">{disease.nameEn}</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                    {disease.category}
                  </span>
                </div>
                <p className="text-white/70 text-sm line-clamp-2">{disease.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Protocol Configuration */}
      {selectedDisease && (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Protokol Konfigürasyonu</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Age Group Selection */}
            <div>
              <h3 className="text-white font-medium mb-3">Yaş Grubu</h3>
              <div className="space-y-2">
                {AGE_GROUPS.map((ageGroup) => (
                  <label key={ageGroup.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="ageGroup"
                      value={ageGroup.id}
                      checked={selectedAgeGroup === ageGroup.id}
                      onChange={() => handleAgeGroupSelect(ageGroup.id)}
                      className="w-4 h-4 text-blue-600 bg-white/10 border-white/20 focus:ring-blue-500"
                    />
                    <span className="text-white/80">{ageGroup.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Secondary Conditions */}
            <div>
              <h3 className="text-white font-medium mb-3">Ek Koşullar</h3>
              <div className="space-y-2">
                {secondaryConditions.map((condition) => (
                  <label key={condition} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSecondaryConditions.includes(condition)}
                      onChange={() => handleSecondaryConditionToggle(condition)}
                      className="w-4 h-4 text-green-600 bg-white/10 border-white/20 focus:ring-green-500"
                    />
                    <span className="text-white/80">{condition}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Reset Button */}
            <div className="flex items-end">
              <button
                onClick={resetSelection}
                className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-300 hover:text-red-200 transition-all duration-200"
              >
                Seçimi Sıfırla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Available Protocols */}
      {availableProtocols.length > 0 && (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Mevcut Protokoller</h2>
            <button
              onClick={() => setIsCreateProtocolModalOpen(true)}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
            >
              + Yeni Protokol
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {availableProtocols.map((protocol) => (
              <div
                key={protocol.id}
                className="bg-white/5 border border-white/20 rounded-xl p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer"
                onClick={() => openProtocolDetails(protocol)}
              >
                {/* Protocol Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {'diseaseName' in protocol ? protocol.diseaseName : protocol.primaryDiseaseName}
                    </h3>
                    <p className="text-white/60 text-sm">
                      {protocol.ageGroupName} • {protocol.treatmentCourseName}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-medium">
                      {protocol.duration}
                    </div>
                  </div>
                </div>

                {/* Application Methods */}
                <div className="mb-4">
                  <h4 className="text-white/80 text-sm font-medium mb-2">Uygulama Yöntemleri:</h4>
                  <div className="flex flex-wrap gap-2">
                    {protocol.applicationMethods.map((methodId) => {
                      const method = APPLICATION_METHODS.find(m => m.id === methodId);
                      return method ? (
                        <span
                          key={method.id}
                          className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs"
                        >
                          {method.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* Dosage and Frequency */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-white/60 text-xs">Doz:</span>
                    <div className="text-white/80 text-sm font-medium">{protocol.dosage}</div>
                  </div>
                  <div>
                    <span className="text-white/60 text-xs">Sıklık:</span>
                    <div className="text-white/80 text-sm font-medium">{protocol.frequency}</div>
                  </div>
                </div>

                {/* Expected Results */}
                <div className="pt-4 border-t border-white/10">
                  <span className="text-white/60 text-xs">Beklenen Sonuç:</span>
                  <div className="text-white/80 text-sm font-medium line-clamp-2">
                    {protocol.expectedResults}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Protocols Available */}
      {selectedDisease && selectedAgeGroup && availableProtocols.length === 0 && (
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-bold text-white mb-2">Protokol Bulunamadı</h3>
          <p className="text-white/70 mb-4">
            Seçilen kriterler için henüz protokol tanımlanmamış.
          </p>
          <button
            onClick={() => setIsCreateProtocolModalOpen(true)}
            className="px-6 py-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
          >
            Yeni Protokol Oluştur
          </button>
        </div>
      )}

      {/* Protocol Details Modal */}
      {isDetailsModalOpen && selectedProtocol && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-white/20 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {('diseaseName' in selectedProtocol ? selectedProtocol.diseaseName : selectedProtocol.primaryDiseaseName)} Protokolü
                  </h2>
                  <p className="text-white/70">
                    {selectedProtocol.ageGroupName} • {selectedProtocol.treatmentCourseName}
                  </p>
                </div>
                <button
                  onClick={closeProtocolDetails}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <span className="text-white text-xl">✕</span>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white/80 font-medium mb-2">Yaş Grubu</h4>
                  <p className="text-white">{selectedProtocol.ageGroupName}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white/80 font-medium mb-2">Tedavi Kürü</h4>
                  <p className="text-white">{selectedProtocol.treatmentCourseName}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white/80 font-medium mb-2">Süre</h4>
                  <p className="text-white">{selectedProtocol.duration}</p>
                </div>
              </div>

              {/* Application Methods */}
              <div className="bg-white/5 rounded-xl p-4">
                <h4 className="text-white font-medium mb-3">Uygulama Yöntemleri</h4>
                <div className="space-y-4">
                  {selectedProtocol.applicationMethods.map((methodId) => {
                    const method = APPLICATION_METHODS.find(m => m.id === methodId);
                    return method ? (
                      <div key={method.id} className="border-l-2 border-blue-500 pl-4">
                        <h5 className="text-white font-medium mb-2">{method.name}</h5>
                        <p className="text-white/70 text-sm mb-2">{method.description}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-white/60">Süre:</span>
                            <span className="text-white ml-2">{method.duration}</span>
                          </div>
                          <div>
                            <span className="text-white/60">Sıklık:</span>
                            <span className="text-white ml-2">{method.frequency}</span>
                          </div>
                          <div>
                            <span className="text-white/60">Başarı Oranı:</span>
                            <span className="text-white ml-2">{method.successRate}</span>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Dosage and Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white font-medium mb-3">Doz ve Sıklık</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-white/60">Doz:</span>
                      <p className="text-white">{selectedProtocol.dosage}</p>
                    </div>
                    <div>
                      <span className="text-white/60">Sıklık:</span>
                      <p className="text-white">{selectedProtocol.frequency}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white font-medium mb-3">Talimatlar</h4>
                  <p className="text-white/80">{selectedProtocol.instructions}</p>
                </div>
              </div>

              {/* Precautions and Expected Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white font-medium mb-3">Dikkat Edilecekler</h4>
                  <p className="text-white/80">{selectedProtocol.precautions}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white font-medium mb-3">Beklenen Sonuçlar</h4>
                  <p className="text-white/80">{selectedProtocol.expectedResults}</p>
                </div>
              </div>

              {/* Follow-up Schedule */}
              <div className="bg-white/5 rounded-xl p-4">
                <h4 className="text-white font-medium mb-3">Takip Programı</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {selectedProtocol.followUpSchedule.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-white/80 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Disease Modal */}
      <CreateDiseaseModal
        isOpen={isCreateDiseaseModalOpen}
        onClose={() => setIsCreateDiseaseModalOpen(false)}
        onDiseaseAdded={() => {
          fetchDiseases();
          setIsCreateDiseaseModalOpen(false);
        }}
      />

      <CreateProtocolModal
        isOpen={isCreateProtocolModalOpen}
        onClose={() => setIsCreateProtocolModalOpen(false)}
        onProtocolAdded={() => {
          fetchDiseaseProtocols();
          fetchCombinedProtocols();
          setIsCreateProtocolModalOpen(false);
        }}
        selectedDiseaseId={selectedDisease}
        selectedAgeGroupId={selectedAgeGroup}
      />
    </div>
  );
};

export default TreatmentProtocols;
