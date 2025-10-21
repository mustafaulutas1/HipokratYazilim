import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, deleteDoc, doc, where, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

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

const Pharmacy: React.FC<{ doctorProfile: DoctorProfile | null }> = ({ doctorProfile }) => {
  const [savedMedications, setSavedMedications] = useState<SavedMedication[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMedication, setEditingMedication] = useState<SavedMedication | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPriceUpdateSection, setShowPriceUpdateSection] = useState(false);
  const [percentageIncrease, setPercentageIncrease] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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

  // Available dosage forms
  const DOSAGE_FORMS = [
    'Tablet',
    'Kapsül',
    'Şurup',
    'İnjeke',
    'Krem',
    'Merhem',
    'Damla',
    'Toz',
    'Fitil',
    'Şampuan',
    'Jel',
    'Sprey',
    'Transdermal Plaster',
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

  useEffect(() => {
    const fetchData = async () => {
      if (!doctorProfile?.clinicId) return;
      
      try {
        setLoading(true);
        console.log('🔍 Pharmacy: Fetching medications for clinicId:', doctorProfile.clinicId);
        
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
        
        console.log('✅ Pharmacy: Fetched medications:', medications.length);
        setSavedMedications(medications);
      } catch (error) {
        console.error('❌ Pharmacy: Error fetching medications:', error);
      } finally {
        setLoading(false);
      }
    };

    if (doctorProfile?.clinicId) {
      fetchData();
    }
  }, [doctorProfile?.clinicId]);

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

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            💊 Eczane Yönetimi
          </h1>
          <p className="text-white/70 text-lg">
            İlaç tanımlama, stok takibi ve fiyat yönetimi
          </p>
        </div>
      </div>

      {!showAddForm ? (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-2xl p-4">
              <div className="text-blue-300 text-2xl mb-1">💊</div>
              <div className="text-white text-2xl font-bold">{savedMedications.length}</div>
              <div className="text-white/70 text-sm">Toplam İlaç</div>
            </div>
            
            <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-2xl p-4">
              <div className="text-yellow-300 text-2xl mb-1">⚠️</div>
              <div className="text-white text-2xl font-bold">{lowStockMedications.length}</div>
              <div className="text-white/70 text-sm">Düşük Stok</div>
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

          {/* Action Buttons and Filters */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowAddForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-medium transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
              >
                ➕ Yeni İlaç Ekle
              </button>

              {savedMedications.length > 0 && (
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
                  placeholder="İlaç adı, barkod veya üretici ara..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all" className="text-gray-900 bg-white">Tüm Kategoriler</option>
                {MEDICATION_CATEGORIES.map(category => (
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
            {showPriceUpdateSection && savedMedications.length > 0 && (
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

            {/* Medications List */}
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <span className="ml-3 text-white">İlaçlar yükleniyor...</span>
                </div>
              ) : filteredAndSortedMedications.length === 0 ? (
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
                            
                            <div className="flex flex-wrap gap-2 mt-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                medication.stockQuantity <= medication.minStockLevel 
                                  ? 'bg-yellow-500/20 text-yellow-300' 
                                  : 'bg-green-500/20 text-green-300'
                              }`}>
                                📦 Stok: {medication.stockQuantity}
                              </span>
                              
                              {medication.expiryDate && (
                                <span className={`px-2 py-1 rounded text-xs ${
                                  new Date(medication.expiryDate) < new Date()
                                    ? 'bg-red-500/20 text-red-300'
                                    : new Date(medication.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                      ? 'bg-orange-500/20 text-orange-300'
                                      : 'bg-blue-500/20 text-blue-300'
                                }`}>
                                  📅 {new Date(medication.expiryDate).toLocaleDateString('tr-TR')}
                                </span>
                              )}
                            </div>
                            
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
              )}
            </div>
          </div>
        </>
      ) : (
        /* Add/Edit Medication Form */
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">
              {editingMedication ? '✏️ İlaç Düzenle' : '➕ Yeni İlaç Ekle'}
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 rounded-xl text-gray-300 hover:text-gray-200 transition-all duration-200"
            >
              ← Geri
            </button>
          </div>

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

              {/* Dosage Form */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Dozaj Şekli
                </label>
                <select
                  value={formData.dosageForm}
                  onChange={(e) => setFormData(prev => ({ ...prev, dosageForm: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="" className="text-gray-900 bg-white">Seçiniz</option>
                  {DOSAGE_FORMS.map(form => (
                    <option key={form} value={form} className="text-gray-900 bg-white">{form}</option>
                  ))}
                </select>
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
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
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

              {/* Stock Quantity */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Stok Miktarı
                </label>
                <input
                  type="number"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, stockQuantity: parseInt(e.target.value) || 0 }))}
                  placeholder="Stok miktarı"
                  min="0"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Minimum Stock Level */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Minimum Stok Seviyesi
                </label>
                <input
                  type="number"
                  value={formData.minStockLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, minStockLevel: parseInt(e.target.value) || 0 }))}
                  placeholder="Minimum stok uyarısı için"
                  min="0"
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
        </div>
      )}
    </div>
  );
};

export default Pharmacy;