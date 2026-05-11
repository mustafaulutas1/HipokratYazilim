import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../../firebase/config';
import { nowISO } from '../../../utils/dateUtils';
import { DIAGNOSIS_SPECIFIC_QUESTIONS, DIAGNOSIS_SYSTEMS, DIAGNOSIS_ILLNESSES } from '../../../constants';

// Use shared diagnosis structure from constants

interface Patient {
  id: string;
  fullName: string;
  tcNo?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  emergencyPhone?: string;
  visitReason?: string;
  clinicId?: string;
  isAnamnezCompleted?: boolean;
  anamrezCompletedAt?: string;
  anamrezCompletedBy?: string;
  createdAt?: string;
  doctorProfile?: any;
}

interface AnamrezViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  anamrezRecord?: any;
  editable?: boolean;
  onDataUpdated?: () => void;
}

interface AnamrezData {
  id: string;
  patientId: string;
  patientName: string;
  selectedDiagnosisSystems: string[];
  selectedIllnesses?: Record<string, string[]>;
  selectedDoctor?: {
    id: string;
    name: string;
    specialization: string;
    department: string;
    email: string;
  };
  complaintDetails: string;
  pastMedicalHistory: string;
  familyHistory: string;
  hasSurgery: string;
  surgicalHistory: string;
  allergies: string;
  symptomRatings: Record<string, number>;
  symptomNotes?: Record<string, string>;
  customSymptomQuestions?: Array<{
    id: string;
    label: string;
    rating: number;
    note: string;
    categoryTitle: string;
  }>;
  diagnosisResponses: Record<string, Record<string, number>>;
  additionalQuestions: {
    education: string;
    profession: string;
    exerciseFrequency: string;
    dailySleepHours: string;
    monthlyVegetableConsumption: string;
    monthlyRedMeatConsumption: string;
    monthlyChickenConsumption: string;
    dailyWaterConsumption: string;
    smokingFrequency: string;
    alcoholFrequency: string;
  };
  customQuestions: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
  conventionalTreatment: {
    currentMedications: string;
    otherTreatments: string;
    deviceScanFileUrl?: string;
  };
  optionalScans?: {
    meridianScan?: {
      enabled: boolean;
      fileUrl: string;
    };
    thermalScan?: {
      enabled: boolean;
      fileUrl: string;
    };
    toxicityScan?: {
      enabled: boolean;
      fileUrl: string;
    };
    biyokimya?: {
      enabled: boolean;
      fileUrl: string;
    };
    radyoloji?: {
      enabled: boolean;
      fileUrl: string;
    };
    patoloji?: {
      enabled: boolean;
      fileUrl: string;
    };
    epikriz?: {
      enabled: boolean;
      fileUrl: string;
    };
  };
  toxicityAssessment: {
    totalScore: number;
    ratedSymptomsCount: number;
    hasToxicity: boolean;
    toxicityScores: Record<string, number>;
  };
  completedBy: {
    id: string;
    name: string;
    role: string;
    email: string;
  };
  createdAt: string;
}

interface MediaFile {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video';
  uploadedAt: string;
  uploadedBy?: string;
}

const LightboxOverlay: React.FC<{
  media: MediaFile;
  currentIndex: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ media, currentIndex, total, hasPrev, hasNext, onClose, onPrev, onNext }) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onPrev();
    else if (e.key === 'ArrowRight') onNext();
    else if (e.key === 'Escape') onClose();
  }, [onPrev, onNext, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div className="relative max-w-5xl w-full max-h-[90vh] flex items-center" onClick={(e) => e.stopPropagation()}>
        {/* Previous button */}
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
            hasPrev
              ? 'bg-white/20 hover:bg-white/40 text-white cursor-pointer'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          ‹
        </button>

        {/* Image */}
        <div className="flex-1 flex flex-col items-center">
          <button
            onClick={onClose}
            className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl font-bold z-10"
          >
            ✕
          </button>
          <img
            src={media.url}
            alt={media.name}
            className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
          />
          <div className="text-center mt-3">
            <p className="text-white text-sm">{media.name}</p>
            <p className="text-gray-400 text-xs">
              {new Date(media.uploadedAt).toLocaleDateString('tr-TR')} — {currentIndex + 1} / {total}
            </p>
            <p className="text-gray-500 text-xs mt-1">← → ok tuşları ile gezinebilirsiniz</p>
          </div>
        </div>

        {/* Next button */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
            hasNext
              ? 'bg-white/20 hover:bg-white/40 text-white cursor-pointer'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          ›
        </button>
      </div>
    </div>
  );
};

const ComparisonOverlay: React.FC<{
  images: MediaFile[];
  onClose: () => void;
}> = ({ images, onClose }) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 bg-black/95 flex flex-col z-[60]"
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/60 border-b border-white/10 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-white font-semibold text-sm">
          🔍 Karşılaştırma Görünümü — {images.length} fotoğraf
        </span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-2xl leading-none font-bold"
        >
          ✕
        </button>
      </div>

      {/* Images side by side */}
      <div className="flex flex-1 gap-2 p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {images.map((img) => (
          <div key={img.id} className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <img
                src={img.url}
                alt={img.name}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{ maxHeight: 'calc(100vh - 130px)' }}
              />
            </div>
            <div className="text-center mt-2 shrink-0">
              <p className="text-white/80 text-xs truncate px-2" title={img.name}>{img.name}</p>
              <p className="text-white/40 text-xs">{new Date(img.uploadedAt).toLocaleDateString('tr-TR')}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="text-center py-2 shrink-0">
        <p className="text-white/30 text-xs">Kapatmak için ESC veya dışarıya tıklayın</p>
      </div>
    </div>
  );
};

const AnamrezViewModal: React.FC<AnamrezViewModalProps> = ({
  isOpen,
  onClose,
  patient,
  anamrezRecord,
  editable = false,
  onDataUpdated
}) => {
  const [anamrezData, setAnamrezData] = useState<AnamrezData | null>(null);
  const [allAnamrezRecords, setAllAnamrezRecords] = useState<AnamrezData[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState<any>(null);
  const [activeSection, setActiveSection] = useState('patient-info');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedMediaForPreview, setSelectedMediaForPreview] = useState<MediaFile | null>(null);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [showComparisonOverlay, setShowComparisonOverlay] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<AnamrezData | null>(null);
  const [saving, setSaving] = useState(false);

  // Symptom sort state: 'default' | 'desc' | 'asc'
  const [symptomSortOrder, setSymptomSortOrder] = useState<'default' | 'desc' | 'asc'>('default');
  const [diagnosisSortOrder, setDiagnosisSortOrder] = useState<'default' | 'desc' | 'asc'>('default');
  const [toxicitySortOrder, setToxicitySortOrder] = useState<'default' | 'desc' | 'asc'>('default');

  // Comparison mode
  const [showComparison, setShowComparison] = useState(false);
  const previousRecord: AnamrezData | null = allAnamrezRecords.length > 1 && selectedRecordIndex < allAnamrezRecords.length - 1
    ? allAnamrezRecords[selectedRecordIndex + 1]
    : null;

  // Diğer (Other) illness input states for edit mode
  const [viewDigerOpen, setViewDigerOpen] = useState<Record<string, boolean>>({});
  const [viewDigerInput, setViewDigerInput] = useState<Record<string, string>>({});
  const [viewDigerFocused, setViewDigerFocused] = useState<Record<string, boolean>>({});

  const handleViewDigerAdd = (system: string, value?: string) => {
    if (!editedData) return;
    const illness = (value || viewDigerInput[system] || '').trim().toUpperCase();
    if (!illness) return;
    const currentIllnesses = editedData.selectedIllnesses?.[system] || [];
    if (currentIllnesses.includes(illness)) {
      toast.warning('Bu hastalık zaten eklenmiş.');
      return;
    }
    const updatedIllnesses = { ...(editedData.selectedIllnesses || {}) };
    updatedIllnesses[system] = [...currentIllnesses, illness];
    setEditedData({ ...editedData, selectedIllnesses: updatedIllnesses });
    setViewDigerInput(prev => ({ ...prev, [system]: '' }));
  };

  const getViewDigerSuggestions = (system: string): string[] => {
    const input = (viewDigerInput[system] || '').toUpperCase();
    if (!input || !editedData) return [];
    const predefinedIllnesses = DIAGNOSIS_ILLNESSES[system] || [];
    const allIllnesses = predefinedIllnesses.map(i => i.toUpperCase());
    const currentSelected = (editedData.selectedIllnesses?.[system] || []).map(i => i.toUpperCase());
    return allIllnesses.filter(i => i.includes(input) && !currentSelected.includes(i));
  };

  const startEditing = () => {
    if (anamrezData) {
      setEditedData(JSON.parse(JSON.stringify(anamrezData)));
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setEditedData(null);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!editedData || !editedData.id) return;
    setSaving(true);
    try {
      // Recalculate toxicity assessment from symptom ratings
      const toxicityKeys = ['halsizlikYorgunluk', 'dengeKaybi', 'unutkanlik', 'kasinti', 'carpinti',
        'uykuDuzensizligi', 'gozdeUcusmalar', 'oksuruk', 'yorgunUyanma', 'kabizlik'];
      const toxicityScores: Record<string, number> = {};
      let totalScore = 0;
      let ratedSymptomsCount = 0;
      toxicityKeys.forEach(key => {
        const val = editedData.symptomRatings?.[key] || 0;
        toxicityScores[key] = val;
        if (val > 0) {
          totalScore += val;
          ratedSymptomsCount++;
        }
      });
      const hasToxicity = ratedSymptomsCount >= 5 && totalScore >= 30;

      const updatedData = {
        ...editedData,
        toxicityAssessment: { totalScore, ratedSymptomsCount, hasToxicity, toxicityScores },
        updatedAt: nowISO(),
      };

      // Remove id before saving to Firestore
      const { id, ...dataToSave } = updatedData;
      await updateDoc(doc(db, 'anamrezRecords', editedData.id), dataToSave);

      // Update local state
      setAnamrezData(updatedData);
      setAllAnamrezRecords(prev => prev.map(r => r.id === updatedData.id ? updatedData : r));
      setIsEditing(false);
      setEditedData(null);
      onDataUpdated?.();
    } catch (error) {
      console.error('Anamnez güncellenirken hata:', error);
      alert('Kaydetme sırasında bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  // If an anamrezRecord is passed directly, use it as current but still fetch all for comparison
  useEffect(() => {
    if (anamrezRecord && isOpen) {
      setAnamrezData(anamrezRecord as AnamrezData);
      setSelectedRecordIndex(0);
      // Don't set allAnamrezRecords here - let the fetch handle it
    }
  }, [anamrezRecord, isOpen]);

  // Print Function (Replaces PDF Generation)
  const handlePrint = () => {
    if (!patient || !anamrezData) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Lütfen açılır pencerelere izin verin.');
      return;
    }

    const logoHtml = doctorProfile?.logoUrl 
      ? `<div style="text-align: center; margin-bottom: 8px;"><img src="${doctorProfile.logoUrl}" style="max-height: 50px; max-width: 100%; object-fit: contain;" /></div>` 
      : '';

    const symptomLabels: Record<string, string> = {
      'uykuHali': 'Uyku Hali', 'gozdeUcusmalar': 'Gözde Uçuşmalar', 'carpinti': 'Çarpıntı',
      'siskinlik': 'Şişkinlik', 'adetDuzensizligi': 'Adet Düzensizliği', 'dengeKaybi': 'Denge Kaybı',
      'yayginKasAgrisi': 'Yaygın Kas Ağrısı', 'nefesAlmadaGucluk': 'Nefes Almada Güçlük', 'ustume': 'Üşüme',
      'terleme': 'Terleme', 'stres': 'Stres', 'agriliAdet': 'Ağrılı Adet', 'uykuDuzensizligi': 'Uyku Düzensizliği',
      'oksuruk': 'Öksürük', 'balgam': 'Balgam', 'kasilmaVeKramplar': 'Kasılma Ve Kramplar',
      'elAyakUyusmalari': 'El Ayak Uyuşmaları', 'unutkanlik': 'Unutkanlık', 'kasinti': 'Kaşıntı',
      'idrarKacirma': 'İdrar Kaçırma', 'idrardaYanma': 'İdrarda Yanma', 'geceIdraraKalkma': 'Gece İdrara Kalkma',
      'kesikKesikIdrar': 'Kesik Kesik İdrar', 'kabizlik': 'Kabızlık', 'karindaGaz': 'Karında Gaz',
      'belAgrisi': 'Bel Ağrısı', 'ishal': 'İshal', 'boyunAgrisi': 'Boyun Ağrısı', 'yayginOdem': 'Yaygın Ödem',
      'basur': 'Basur', 'eklemAgrilari': 'Eklem Ağrıları', 'algiBozuklugu': 'Algı Bozukluğu',
      'halsizlikYorgunluk': 'Halsizlik / Yorgunluk', 'yorgunUyanma': 'Yorgun Uyanma', 'basDonmesi': 'Baş Dönmesi',
      'basAgrisi': 'Baş Ağrısı', 'mideAgisi': 'Mide Ağısı', 'mideYanmasi': 'Mide Yanması'
    };

    const lifestyleLabels: Record<string, string> = {
      'exerciseFrequency': 'Spor Yapma Sıklığı',
      'dailySleepHours': 'Günlük Uyku Saati', 'monthlyVegetableConsumption': 'Aylık Sebze Tüketimi',
      'monthlyRedMeatConsumption': 'Aylık Kırmızı Et Tüketimi', 'monthlyChickenConsumption': 'Aylık Tavuk Eti Tüketimi',
      'dailyWaterConsumption': 'Günlük Su Tüketimi', 'smokingFrequency': 'Sigara İçme Sıklığı',
      'alcoholFrequency': 'Alkol Kullanma Sıklığı'
    };

    // Format date for display
    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Render a scan file block with download button + preview
    const renderScanFileBlock = (label: string, fileUrl: string): string => {
      const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
      const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
      return `
        <div style="border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <p style="font-size:11px; font-weight:bold; color:#2c5282; margin:0;">📎 ${label}</p>
            <a href="${fileUrl}" target="_blank"
               style="font-size:10px; background:#3182ce; color:white; padding:4px 12px; border-radius:4px; text-decoration:none; font-weight:600; display:inline-block;">
              ⬇️ İndir / Görüntüle
            </a>
          </div>
          ${isImage ? `<img src="${fileUrl}" alt="${label}" style="max-width:100%; height:auto; max-height:200px; border-radius:4px; display:block;" />` : ''}
          ${isPdf ? `
            <div style="padding:10px; background:#fff5f5; border:1px solid #fed7d7; border-radius:6px; display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">📄</span>
              <div>
                <p style="font-size:11px; font-weight:bold; color:#c53030; margin:0 0 4px 0;">PDF Dosyası</p>
                <a href="${fileUrl}" target="_blank" style="font-size:10px; color:#3182ce; text-decoration:underline;">Görüntülemek için tıklayın</a>
              </div>
            </div>` : ''}
          ${!isImage && !isPdf ? `
            <div style="padding:10px; background:#f7fafc; border:1px solid #e2e8f0; border-radius:6px; display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">📎</span>
              <div>
                <p style="font-size:11px; font-weight:bold; color:#4a5568; margin:0 0 4px 0;">Ek Dosya</p>
                <a href="${fileUrl}" target="_blank" style="font-size:10px; color:#3182ce; text-decoration:underline;">İndirmek için tıklayın</a>
              </div>
            </div>` : ''}
        </div>
      `;
    };

    // Get all records sorted by date (oldest first for column display)
    const sortedRecords = [...allAnamrezRecords].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Generate date comparison table for symptoms
    const generateSymptomComparisonTable = () => {
      if (sortedRecords.length === 0) return '';
      
      // Get all unique symptom keys from all records
      const allSymptomKeys = new Set<string>();
      sortedRecords.forEach(record => {
        if (record.symptomRatings) {
          Object.keys(record.symptomRatings).forEach(key => allSymptomKeys.add(key));
        }
      });

      if (allSymptomKeys.size === 0) return '';

      const headerRow = `
        <tr style="background: #2c5282; color: white;">
          <th style="padding: 4px 6px; text-align: left; border: 1px solid #e2e8f0; font-size:9px;">Semptom</th>
          ${sortedRecords.map(record => `
            <th style="padding: 4px 6px; text-align: center; border: 1px solid #e2e8f0; min-width: 55px; font-size:9px;">
              ${formatDate(record.createdAt)}
            </th>
          `).join('')}
        </tr>
      `;

      const filteredSymptomKeys = Array.from(allSymptomKeys).filter(key => {
        return sortedRecords.some(record => (record.symptomRatings?.[key] || 0) > 0);
      });

      if (filteredSymptomKeys.length === 0) return '';

      const dataRows = filteredSymptomKeys.map(key => {
        const label = symptomLabels[key] || key;
        return `
          <tr>
            <td style="padding: 3px 6px; border: 1px solid #e2e8f0; font-weight: 500; font-size:9px;">${label}</td>
            ${sortedRecords.map(record => {
              const value = record.symptomRatings?.[key] || 0;
              const bgColor = value <= 3 ? '#f0fff4' : value <= 6 ? '#fffaf0' : '#fff5f5';
              const textColor = value <= 3 ? '#276749' : value <= 6 ? '#9c4221' : '#c53030';
              return `
                <td style="padding: 3px 6px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor}; font-weight: bold; font-size:9px;">
                  ${value}/10
                </td>
              `;
            }).join('')}
          </tr>
        `;
      }).join('');

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 4px;">
          ${headerRow}
          ${dataRows}
        </table>
      `;
    };

    // Generate date comparison table for toxicity
    const generateToxicityComparisonTable = () => {
      if (sortedRecords.length === 0) return '';
      
      const toxicityKeys = ['halsizlikYorgunluk', 'dengeKaybi', 'unutkanlik', 'kasinti', 'carpinti', 
                           'uykuDuzensizligi', 'gozdeUcusmalar', 'oksuruk', 'yorgunUyanma', 'kabizlik'];
      
      const headerRow = `
        <tr style="background: #742a2a; color: white;">
          <th style="padding: 4px 6px; text-align: left; border: 1px solid #e2e8f0; font-size:9px;">Toksisite Parametresi</th>
          ${sortedRecords.map(record => `
            <th style="padding: 4px 6px; text-align: center; border: 1px solid #e2e8f0; min-width: 55px; font-size:9px;">
              ${formatDate(record.createdAt)}
            </th>
          `).join('')}
        </tr>
      `;

      const filteredToxicityKeys = toxicityKeys.filter(key => {
        return sortedRecords.some(record => (record.toxicityAssessment?.toxicityScores?.[key] || 0) > 0);
      });

      const hasToxicityData = filteredToxicityKeys.length > 0 || sortedRecords.some(r => (r.toxicityAssessment?.totalScore || 0) > 0);
      if (!hasToxicityData) return '';

      const dataRows = filteredToxicityKeys.map(key => {
        const label = symptomLabels[key] || key;
        return `
          <tr>
            <td style="padding: 3px 6px; border: 1px solid #e2e8f0; font-weight: 500; font-size:9px;">${label}</td>
            ${sortedRecords.map(record => {
              const value = record.toxicityAssessment?.toxicityScores?.[key] || 0;
              const bgColor = value <= 3 ? '#f0fff4' : value <= 6 ? '#fffaf0' : '#fff5f5';
              const textColor = value <= 3 ? '#276749' : value <= 6 ? '#9c4221' : '#c53030';
              return `
                <td style="padding: 3px 6px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor}; font-weight: bold; font-size:9px;">
                  ${value}/10
                </td>
              `;
            }).join('')}
          </tr>
        `;
      }).join('');

      // Summary row
      const summaryRow = `
        <tr style="background: #f7fafc; font-weight: bold;">
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-size:9px;">TOPLAM PUAN</td>
          ${sortedRecords.map(record => {
            const total = record.toxicityAssessment?.totalScore || 0;
            const hasToxicity = record.toxicityAssessment?.hasToxicity;
            const bgColor = hasToxicity ? '#fff5f5' : '#f0fff4';
            const textColor = hasToxicity ? '#c53030' : '#276749';
            return `
              <td style="padding: 4px 6px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor}; font-size:9px;">
                ${total}
              </td>
            `;
          }).join('')}
        </tr>
      `;

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 4px;">
          ${headerRow}
          ${dataRows}
          ${summaryRow}
        </table>
      `;
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Anamnez Raporu - ${patient.fullName}</title>
          <style>
            @media print {
              @page { size: A4 portrait; margin: 8mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-break { break-inside: avoid; }
            }
            body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 9.5px; line-height: 1.3; color: #333; margin: 0 auto; padding: 10px; background: #e8e8e8; }
            .page { background: white; max-width: 210mm; margin: 0 auto; padding: 10mm; }
            h1 { text-align: center; font-size: 15px; margin-bottom: 6px; color: #1a365d; text-transform: uppercase; letter-spacing: 1px; }
            .section { margin-bottom: 8px; break-inside: avoid; }
            .section-title { font-size: 10px; font-weight: 700; color: #2c5282; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
            .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
            .field { margin-bottom: 2px; }
            .label { font-weight: 600; color: #718096; font-size: 8px; display: block; margin-bottom: 1px; text-transform: uppercase; }
            .value { color: #2d3748; font-weight: 500; font-size: 9.5px; }
            .full-width { grid-column: span 2; }
            .text-content { white-space: pre-wrap; background: #f8fafc; padding: 4px 6px; border-radius: 3px; border: 1px solid #edf2f7; font-size: 9.5px; }
            .tag { display: inline-block; padding: 1px 5px; background: #ebf8ff; color: #2b6cb0; border-radius: 3px; font-size: 9px; margin-right: 3px; margin-bottom: 3px; border: 1px solid #bee3f8; }
            .score-item { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; border-bottom: 1px solid #f7fafc; }
            .score-item:last-child { border-bottom: none; }
            .score-val { font-weight: bold; padding: 1px 4px; border-radius: 3px; font-size: 9px; }
            .score-low { background: #f0fff4; color: #276749; }
            .score-med { background: #fffaf0; color: #9c4221; }
            .score-high { background: #fff5f5; color: #c53030; }
            .check-item { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
            .check-icon { color: #38a169; font-weight: bold; }
            .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #edf2f7; text-align: center; color: #a0aec0; font-size: 8px; }
            .date-badge { display: inline-block; padding: 1px 5px; background: #ebf8ff; color: #2b6cb0; border-radius: 3px; font-size: 8px; font-weight: bold; margin-bottom: 3px; }
            .records-summary { background: #f7fafc; padding: 4px 8px; border-radius: 3px; margin-bottom: 8px; text-align: center; font-size: 9.5px; }
          </style>
        </head>
        <body>
          <div class="page">
          ${logoHtml}
          <h1>ANAMNEZ RAPORU</h1>
          
          <div class="records-summary">
            <span style="font-weight: bold; color: #2c5282;">📊 Toplam ${allAnamrezRecords.length} Anamnez Kaydı</span>
            ${allAnamrezRecords.length > 1 ? `<span style="margin-left: 20px; color: #718096;">| Tarih aralığı: ${formatDate(sortedRecords[0]?.createdAt)} - ${formatDate(sortedRecords[sortedRecords.length - 1]?.createdAt)}</span>` : ''}
          </div>
          
          <div class="section">
            <div class="section-title">Hasta Bilgileri</div>
            <div class="grid">
              <div class="field"><span class="label">Ad Soyad</span><span class="value">${patient.fullName}</span></div>
              <div class="field"><span class="label">TC Kimlik No</span><span class="value">${patient.tcNo}</span></div>
              <div class="field"><span class="label">Doğum Tarihi</span><span class="value">${patient.birthDate}</span></div>
              <div class="field"><span class="label">Cinsiyet</span><span class="value">${patient.gender}</span></div>
              <div class="field"><span class="label">Telefon</span><span class="value">${patient.phone}</span></div>
              <div class="field"><span class="label">Acil Durum Tel</span><span class="value">${patient.emergencyPhone}</span></div>
              <div class="field full-width"><span class="label">Adres</span><span class="value">${patient.address}</span></div>
              <div class="field full-width"><span class="label">Başvuru Nedeni</span><span class="value">${patient.visitReason}</span></div>
              ${anamrezData.selectedDoctor ? `
              <div class="field full-width" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0;">
                <span class="label">İlgilenen Doktor</span>
                <span class="value">Dr. ${anamrezData.selectedDoctor.name} (${anamrezData.selectedDoctor.specialization})</span>
              </div>` : ''}
            </div>
          </div>

          <div class="section">
            <div class="section-title">Tıbbi Geçmiş <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div class="grid">
              <div class="field full-width">
                <span class="label">Şikayet Detayları</span>
                <div class="text-content">${anamrezData.complaintDetails || '-'}</div>
              </div>
              <div class="field full-width">
                <span class="label">Hastalık Geçmişi</span>
                <div class="text-content">${anamrezData.pastMedicalHistory || '-'}</div>
              </div>
              <div class="field full-width">
                <span class="label">Aile Öyküsü</span>
                <div class="text-content">${anamrezData.familyHistory || '-'}</div>
              </div>
              <div class="field full-width">
                <span class="label">Ameliyatlar</span>
                <div class="text-content">${anamrezData.hasSurgery === 'var' ? anamrezData.surgicalHistory : 'Ameliyat geçmişi yok'}</div>
              </div>
              <div class="field full-width">
                <span class="label">Alerjiler</span>
                <div class="text-content">${anamrezData.allergies || '-'}</div>
              </div>
            </div>
          </div>

          ${(() => { const t = generateSymptomComparisonTable(); return t ? `
          <div class="section no-break">
            <div class="section-title">📊 Semptom Değerlendirmesi - Tarihsel Karşılaştırma</div>
            <p style="font-size: 8px; color: #718096; margin-bottom: 4px;">Her sütun bir anamnez kaydının tarihini gösterir. Değerler 1-10 arasındadır.</p>
            ${t}
          </div>` : ''; })()}

          ${(() => { const t = generateToxicityComparisonTable(); return t ? `
          <div class="section no-break">
            <div class="section-title">🔬 Toksisite Değerlendirmesi - Tarihsel Karşılaştırma</div>
            <p style="font-size: 8px; color: #718096; margin-bottom: 4px;">Her sütun bir anamnez kaydının tarihini gösterir. 5+ semptomda yüksek puan = Toksisite riski.</p>
            ${t}
          </div>` : ''; })()}

          ${anamrezData.selectedIllnesses && Object.keys(anamrezData.selectedIllnesses).length > 0 ? `
          <div class="section no-break">
            <div class="section-title">Seçilen Hastalıklar</div>
            ${Object.entries(anamrezData.selectedIllnesses).map(([system, illnesses]: [string, string[]]) => {
              if (!illnesses || illnesses.length === 0) return '';
              return `
                <div style="margin-bottom: 10px;">
                  <div style="font-weight:bold; font-size:11px; color:#4a5568; margin-bottom:5px;">${system}</div>
                  <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    ${illnesses.map(illness => `<span style="padding:2px 8px; background:#fff5f5; color:#c53030; border-radius:12px; font-size:10px; border:1px solid #fed7d7;">${illness}</span>`).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>` : ''}

          ${anamrezData.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0 ? `
          <div class="section no-break">
            <div class="section-title">Sistem Sorgulaması <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            ${anamrezData.selectedDiagnosisSystems.map(diagnosis => {
              const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
              if (!questionSet) return '';
              return `
                <div style="margin-bottom: 6px;">
                  <div style="font-weight:bold; font-size:9px; color:#4a5568; margin-bottom:2px;">${questionSet.label}</div>
                  <div class="grid-3" style="background:#f7fafc; padding:4px; border-radius:3px;">
                    ${questionSet.questions.map(question => {
                      const rating = anamrezData.diagnosisResponses?.[diagnosis]?.[question] || 0;
                      const scoreClass = rating <= 3 ? 'score-low' : rating <= 6 ? 'score-med' : 'score-high';
                      return `
                        <div class="score-item">
                          <span style="font-size:10px;">${question}</span>
                          <span class="score-val ${scoreClass}">${rating}/10</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>` : ''}

          <div class="section no-break">
            <div class="section-title">Yaşam Tarzı <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div class="grid">
              ${Object.entries(anamrezData.additionalQuestions || {}).map(([key, value]) => {
                if (!value) return '';
                return `<div class="field"><span class="label">${lifestyleLabels[key] || key}</span><span class="value">${value}</span></div>`;
              }).join('')}
            </div>
          </div>

          ${anamrezData.customQuestions && anamrezData.customQuestions.length > 0 ? `
          <div class="section no-break">
            <div class="section-title">Ek Sorular <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${anamrezData.customQuestions.map((q, i) => `
                <div style="border-left:4px solid #ed8936; padding:8px 12px; background:#fffaf0; border-radius:0 4px 4px 0;">
                  <div style="font-weight:600; color:#2d3748; font-size:12px; margin-bottom:4px;">${i + 1}. ${q.question || '-'}</div>
                  <div style="color:#4a5568; font-size:12px;">${q.answer || '-'}</div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          ${(anamrezData.optionalScans?.meridianScan?.enabled || anamrezData.optionalScans?.thermalScan?.enabled || anamrezData.optionalScans?.toxicityScan?.enabled || anamrezData.optionalScans?.biyokimya?.enabled || anamrezData.optionalScans?.radyoloji?.enabled || anamrezData.optionalScans?.patoloji?.enabled || anamrezData.optionalScans?.epikriz?.enabled) ? `
          <div class="section no-break">
            <div class="section-title">Opsiyonel Taramalar <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div style="display:flex; flex-direction:column; gap:2px; margin-bottom:5px;">
              ${anamrezData.optionalScans.meridianScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Meridyen Tarama</div>' : ''}
              ${anamrezData.optionalScans.thermalScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Termal Tarama (IRIS-XP)</div>' : ''}
              ${anamrezData.optionalScans.toxicityScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Toksisite Ölçümü</div>' : ''}
              ${anamrezData.optionalScans.biyokimya?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Biyokimya</div>' : ''}
              ${anamrezData.optionalScans.radyoloji?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Radyolojik Görüntüleme</div>' : ''}
              ${anamrezData.optionalScans.patoloji?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Patoloji</div>' : ''}
              ${anamrezData.optionalScans.epikriz?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Epikriz</div>' : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${anamrezData.optionalScans.meridianScan?.enabled ? (() => {
                const scan = anamrezData.optionalScans.meridianScan as any;
                const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                  (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                return urls.map((u: string, i: number) => renderScanFileBlock(`Meridyen Tarama Dosyası ${urls.length > 1 ? i + 1 : ''}`, u)).join('');
              })() : ''}
              ${anamrezData.optionalScans.thermalScan?.enabled && anamrezData.optionalScans.thermalScan?.fileUrl && anamrezData.optionalScans.thermalScan.fileUrl !== 'pending' ? renderScanFileBlock('Termal Tarama Dosyası', anamrezData.optionalScans.thermalScan.fileUrl) : ''}
              ${anamrezData.optionalScans.toxicityScan?.enabled && anamrezData.optionalScans.toxicityScan?.fileUrl && anamrezData.optionalScans.toxicityScan.fileUrl !== 'pending' ? renderScanFileBlock('Toksisite Ölçümü Dosyası', anamrezData.optionalScans.toxicityScan.fileUrl) : ''}
              ${anamrezData.optionalScans.biyokimya?.enabled && anamrezData.optionalScans.biyokimya?.fileUrl && anamrezData.optionalScans.biyokimya.fileUrl !== 'pending' ? renderScanFileBlock('Biyokimya Dosyası', anamrezData.optionalScans.biyokimya.fileUrl) : ''}
              ${anamrezData.optionalScans.radyoloji?.enabled && anamrezData.optionalScans.radyoloji?.fileUrl && anamrezData.optionalScans.radyoloji.fileUrl !== 'pending' ? renderScanFileBlock('Radyolojik Görüntüleme Dosyası', anamrezData.optionalScans.radyoloji.fileUrl) : ''}
              ${anamrezData.optionalScans.patoloji?.enabled && anamrezData.optionalScans.patoloji?.fileUrl && anamrezData.optionalScans.patoloji.fileUrl !== 'pending' ? renderScanFileBlock('Patoloji Dosyası', anamrezData.optionalScans.patoloji.fileUrl) : ''}
              ${anamrezData.optionalScans.epikriz?.enabled && anamrezData.optionalScans.epikriz?.fileUrl && anamrezData.optionalScans.epikriz.fileUrl !== 'pending' ? renderScanFileBlock('Epikriz Dosyası', anamrezData.optionalScans.epikriz.fileUrl) : ''}
            </div>
          </div>` : ''}

          <div class="section">
            <div class="section-title">Konvansiyonel Tedavi <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div class="grid">
              <div class="field full-width">
                <span class="label">Kullandığı İlaçlar</span>
                <div class="text-content">${anamrezData.conventionalTreatment?.currentMedications || '-'}</div>
              </div>
              <div class="field full-width">
                <span class="label">Diğer Tedaviler</span>
                <div class="text-content">${anamrezData.conventionalTreatment?.otherTreatments || '-'}</div>
              </div>
              ${anamrezData.conventionalTreatment?.deviceScanFileUrl && anamrezData.conventionalTreatment.deviceScanFileUrl !== 'pending' ? `
              <div class="field full-width" style="margin-top:10px; border-top:1px solid #e2e8f0; padding-top:10px;">
                <span class="label">📎 Cihaz Tarama Dosyası</span>
                <img src="${anamrezData.conventionalTreatment.deviceScanFileUrl}" alt="Cihaz Tarama" style="max-width:100%; height:auto; max-height:200px; border-radius:4px; border:1px solid #e2e8f0; padding:5px;" />
              </div>` : ''}
            </div>
          </div>

          ${mediaFiles.length > 0 ? `
          <div class="section">
            <div class="section-title">Hasta Görüntüleri</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
              ${mediaFiles.filter(m => m.type === 'image').map(media => `
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                  <img src="${media.url}" alt="${media.name}" style="width: 100%; height: 180px; object-fit: cover;" />
                  <div style="padding: 4px 8px; font-size: 9px; color: #718096;">${media.name} - ${new Date(media.uploadedAt).toLocaleDateString('tr-TR')}</div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <div class="footer">
            Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')} |
            ${anamrezData.completedBy?.name} tarafından oluşturulmuştur.
          </div>
          </div>

          <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 800); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  useEffect(() => {
    const fetchAnamrezData = async () => {
      if (!patient || !isOpen) return;

      // Get patientId from either patient prop or passed anamrezRecord
      const patientId = patient.id || (anamrezRecord as any)?.patientId;
      if (!patientId) return;

      setLoading(true);
      try {
        // Fetch from BOTH collections: anamrezRecords and patientHistoryRecords
        const [anamrezSnapshot, historySnapshot] = await Promise.all([
          getDocs(query(collection(db, 'anamrezRecords'), where('patientId', '==', patientId))),
          getDocs(query(collection(db, 'patientHistoryRecords'), where('patientId', '==', patientId)))
        ]);

        const anamrezDocs = anamrezSnapshot.docs.map(d => {
          const data = d.data() as AnamrezData;
          data.id = d.id;
          (data as any)._source = 'anamrezRecords';
          return data;
        });

        const historyDocs = historySnapshot.docs.map(d => {
          const data = d.data() as AnamrezData;
          data.id = d.id;
          (data as any)._source = 'patientHistoryRecords';
          return data;
        });

        const combinedRecords = [...anamrezDocs, ...historyDocs];

        if (combinedRecords.length > 0) {
          // Get ALL anamnez records for this patient
          const allRecords = combinedRecords
            // Include completed records and records without a status (legacy/manual entries)
            .filter(record => !record.hasOwnProperty('status') || (record as any).status === 'completed' || (record as any).status === 'submitted')
            // Sort by effective date: use historyDate for past records, createdAt for normal ones
            .sort((a, b) => {
              const dateA = (a as any).historyDate ? new Date((a as any).historyDate).getTime() : new Date(a.createdAt).getTime();
              const dateB = (b as any).historyDate ? new Date((b as any).historyDate).getTime() : new Date(b.createdAt).getTime();
              return dateB - dateA;
            });

          setAllAnamrezRecords(allRecords);
          
          // If an anamrezRecord was passed, find its index in the sorted list
          if (anamrezRecord && allRecords.length > 0) {
            const passedId = anamrezRecord.id || (anamrezRecord as any)?.id;
            const idx = allRecords.findIndex(r => r.id === passedId);
            if (idx >= 0) {
              setSelectedRecordIndex(idx);
              setAnamrezData(allRecords[idx]);
            }
          } else if (allRecords.length > 0) {
            setAnamrezData(allRecords[0]);
            setSelectedRecordIndex(0);
          }

          // Fetch doctor profile for logo if clinicId exists
          if (patient.clinicId) {
            console.log('Fetching doctor profile for clinicId:', patient.clinicId);
            try {
              // 1. Try fetching as a Doctor document directly (if clinicId is actually a doctorId)
              let doctorDoc = await getDoc(doc(db, 'doctors', patient.clinicId));
              
              if (doctorDoc.exists()) {
                 console.log('Found in doctors collection by ID');
                 setDoctorProfile(doctorDoc.data());
                 return;
              }

              // 2. Try fetching as a Clinic User document directly
              let clinicUserDoc = await getDoc(doc(db, 'clinicUsers', patient.clinicId));
              if (clinicUserDoc.exists()) {
                 console.log('Found in clinicUsers collection by ID');
                 setDoctorProfile(clinicUserDoc.data());
                 return;
              }

              // 3. If clinicId is a shared ID (e.g. a unique code), search for it in 'doctors' collection
              const doctorsQuery = query(collection(db, 'doctors'), where('clinicId', '==', patient.clinicId));
              const doctorsSnapshot = await getDocs(doctorsQuery);
              if (!doctorsSnapshot.empty) {
                  console.log('Found in doctors collection by clinicId query');
                  // Use the first doctor found as the "clinic owner" profile for the logo
                  setDoctorProfile(doctorsSnapshot.docs[0].data());
                  return;
              }

              // 4. Search in 'clinicUsers' collection
              const clinicUsersQuery = query(collection(db, 'clinicUsers'), where('clinicId', '==', patient.clinicId));
              const clinicUsersSnapshot = await getDocs(clinicUsersQuery);
               if (!clinicUsersSnapshot.empty) {
                  console.log('Found in clinicUsers collection by clinicId query');
                  // Use the first user found, or filter for role='doctor'/'admin' if needed
                  setDoctorProfile(clinicUsersSnapshot.docs[0].data());
                  return;
              }

              console.warn('Doctor profile not found anywhere for clinicId:', patient.clinicId);

            } catch (err) {
              console.error('Doktor bilgisi çekilirken hata:', err);
            }
          } else {
             console.warn('Patient has no clinicId, skipping doctor profile fetch.');
          }
        }
      } catch (error) {
        console.error('Anamnez verisi yüklenirken hata:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnamrezData();
  }, [patient, isOpen, anamrezRecord]);

  // Fetch media files from patient record
  useEffect(() => {
    const fetchMediaFiles = async () => {
      if (!patient?.id || !isOpen) return;

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

    fetchMediaFiles();
  }, [patient?.id, isOpen]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSection('patient-info');
      setIsEditing(false);
      setEditedData(null);
      if (!anamrezRecord) {
        setAnamrezData(null);
        setAllAnamrezRecords([]);
        setSelectedRecordIndex(0);
      }
    }
  }, [isOpen, anamrezRecord]);

  // Handle record selection change
  const handleRecordChange = (index: number) => {
    setSelectedRecordIndex(index);
    setAnamrezData(allAnamrezRecords[index]);
  };

  if (!isOpen || !patient) return null;

  const sections = [
    { id: 'patient-info', label: 'Hasta Bilgileri', icon: '👤' },
    { id: 'diagnosis', label: 'Tanı & Şikayet', icon: '🔍' },
    { id: 'medical-history', label: 'Tıbbi Geçmiş', icon: '📋' },
    { id: 'symptoms', label: 'Semptom Değerlendirmesi', icon: '📊' },
    { id: 'diagnosis-responses', label: 'Sistem Soruları', icon: '🩺' },
    { id: 'lifestyle', label: 'Yaşam Tarzı', icon: '🏃‍♂️' },
    { id: 'toxicity', label: 'Toksisite Değerlendirmesi', icon: '⚠️' },
    { id: 'optional-scans', label: 'Opsiyonel Taramalar', icon: '📋' },
    { id: 'treatment', label: 'Konvansiyonel Tedavi', icon: '💊' },
    ...(mediaFiles.length > 0 ? [{ id: 'patient-images', label: 'Hasta Görüntüleri', icon: '🖼️' }] : [])
  ];

  const scrollToTop = () => {
    const modal = document.querySelector('.anamnez-view-modal-content');
    if (modal) {
      modal.scrollTop = 0;
    }
  };

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    scrollToTop();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl sm:rounded-2xl max-w-7xl w-full h-[95vh] sm:h-[90vh] md:h-[85vh] overflow-hidden shadow-2xl flex flex-col anamnez-view-modal-content">
          {/* Header */}
          <div className="p-3 sm:p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
            <div className="flex items-start sm:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 truncate">
                  {isEditing ? '✏️ Anamnez Düzenleme' : '📄 Anamnez Görüntüleme'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                  {patient.fullName} - {patient.tcNo}
                </p>
                {/* Record selector when multiple anamnez records exist */}
                {allAnamrezRecords.length > 1 && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">Anamnez Kaydı:</span>
                    <select
                      value={selectedRecordIndex}
                      onChange={(e) => handleRecordChange(Number(e.target.value))}
                      className="text-xs sm:text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {allAnamrezRecords.map((record, index) => (
                        <option key={record.id} value={index}>
                          {(() => {
                            const displayDate = (record as any).historyDate
                              ? new Date((record as any).historyDate).toLocaleDateString('tr-TR')
                              : new Date(record.createdAt).toLocaleDateString('tr-TR');
                            return displayDate;
                          })()} - #{index + 1}
                          {(record as any).isPastHistory ? ' (Geçmiş Kayıt)' : ''}
                          {(record as any).appointmentDate && ` (Randevu: ${new Date((record as any).appointmentDate).toLocaleDateString('tr-TR')})`}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400">({allAnamrezRecords.length} kayıt)</span>
                  </div>
                )}
                {allAnamrezRecords.length === 1 && anamrezData && (
                  <p className="text-green-600 text-xs sm:text-sm mt-1 truncate">
                    ✅ {new Date(anamrezData.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Edit / Save / Cancel Buttons - Only when editable */}
                {editable && anamrezData && !isEditing && (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors duration-200 font-medium shadow-md hover:shadow-lg text-xs sm:text-sm"
                    title="Anamnezi Düzenle"
                  >
                    ✏️ <span className="hidden sm:inline">Düzenle</span>
                  </button>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={cancelEditing}
                      className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200 font-medium shadow-md text-xs sm:text-sm"
                    >
                      <span className="hidden sm:inline">İptal</span>
                      <span className="sm:hidden">✕</span>
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-md hover:shadow-lg text-xs sm:text-sm disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <>💾 <span className="hidden sm:inline">Kaydet</span></>
                      )}
                    </button>
                  </>
                )}
                {/* PDF Download Button */}
                {anamrezData && !isEditing && (
                  <button
                    onClick={handlePrint}
                    disabled={loading}
                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-md hover:shadow-lg text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title={loading ? "Veriler yükleniyor..." : "PDF Olarak İndir"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-4 sm:h-4">
                      <path d="M12 16L7 11L8.4 9.6L11 12.2V4H13V12.2L15.6 9.6L17 11L12 16Z" fill="currentColor"/>
                      <path d="M5 20V18H19V20H5Z" fill="currentColor"/>
                    </svg>
                    <span className="hidden sm:inline">Yazdır / PDF</span>
                  </button>
                )}
                {/* DEV ONLY: Delete all anamnez records */}
                <button
                  onClick={async () => {
                    if (!window.confirm('⚠️ TÜM anamnez kayıtlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return;
                    try {
                      const patientId = patient.id || (anamrezRecord as any)?.patientId;
                      if (!patientId) return;
                      const [snap1, snap2] = await Promise.all([
                        getDocs(query(collection(db, 'anamrezRecords'), where('patientId', '==', patientId))),
                        getDocs(query(collection(db, 'patientHistoryRecords'), where('patientId', '==', patientId)))
                      ]);
                      await Promise.all([
                        ...snap1.docs.map(d => deleteDoc(doc(db, 'anamrezRecords', d.id))),
                        ...snap2.docs.map(d => deleteDoc(doc(db, 'patientHistoryRecords', d.id)))
                      ]);
                      toast.success(`${snap1.size + snap2.size} anamnez kaydı silindi.`);
                      setAnamrezData(null);
                      setAllAnamrezRecords([]);
                      onDataUpdated?.();
                      onClose();
                    } catch (err) {
                      console.error(err);
                      toast.error('Silme hatası!');
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 hover:bg-red-700 text-white rounded-lg transition-colors text-[10px] font-medium"
                  title="DEV: Tüm anamnez kayıtlarını sil"
                >
                  🗑️ <span className="hidden sm:inline">Tümünü Sil</span>
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 transition-colors text-lg sm:text-xl font-bold px-2"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row flex-1 min-h-0">
              {/* Navigation Sidebar - Horizontal on mobile, vertical on desktop */}
              <div className="w-full md:w-56 lg:w-64 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 overflow-x-auto md:overflow-y-auto flex-shrink-0">
                <div className="p-2 sm:p-3 md:p-4">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-2 md:mb-4 hidden md:block">Bölümler</h3>
                  <nav className="flex md:flex-col gap-1 md:gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => handleSectionChange(section.id)}
                        className={`flex-shrink-0 md:w-full text-left px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
                          activeSection === section.id
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                      >
                        <span className="text-sm sm:text-base">{section.icon}</span>
                        <span className="hidden sm:inline">{section.label}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 min-h-0">
                {anamrezData ? (
                  <>
                    {/* Patient Info Section */}
                    {activeSection === 'patient-info' && (
                      <div className="space-y-4 sm:space-y-6">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                          👤 Hasta Bilgileri
                        </h3>
                        
                        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">Ad Soyad</label>
                              <div className="text-gray-900 font-semibold">{patient.fullName}</div>
                            </div>
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">TC Kimlik No</label>
                              <div className="text-gray-900 font-semibold">{patient.tcNo}</div>
                            </div>
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">Doğum Tarihi</label>
                              <div className="text-gray-900 font-semibold">{patient.birthDate}</div>
                            </div>
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">Cinsiyet</label>
                              <div className="text-gray-900 font-semibold">{patient.gender}</div>
                            </div>
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">Telefon</label>
                              <div className="text-gray-900 font-semibold">{patient.phone}</div>
                            </div>
                            <div>
                              <label className="block text-gray-600 text-sm font-medium mb-2">Acil Telefon</label>
                              <div className="text-gray-900 font-semibold">{patient.emergencyPhone}</div>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-gray-600 text-sm font-medium mb-2">Adres</label>
                              <div className="text-gray-900 font-semibold text-sm sm:text-base">{patient.address}</div>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-gray-600 text-sm font-medium mb-2">Başvuru Nedeni</label>
                              <div className="text-gray-900 font-semibold text-sm sm:text-base">{patient.visitReason}</div>
                            </div>
                            {anamrezData.selectedDoctor && (
                              <div className="sm:col-span-2">
                                <label className="block text-gray-600 text-sm font-medium mb-2">Tercih Edilen Doktor</label>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                      <span className="text-blue-600 font-semibold">Dr</span>
                                    </div>
                                    <div>
                                      <div className="text-gray-900 font-semibold">Dr. {anamrezData.selectedDoctor.name}</div>
                                      <div className="text-sm text-gray-600">{anamrezData.selectedDoctor.specialization}</div>
                                      <div className="text-sm text-gray-500">{anamrezData.selectedDoctor.department}</div>
                                      <div className="text-sm text-gray-500">{anamrezData.selectedDoctor.email}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Diagnosis & Complaint Section */}
                    {activeSection === 'diagnosis' && (
                      <div className="space-y-4 sm:space-y-6">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                          🔍 Tanı & Şikayet
                        </h3>

                        <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                          <h4 className="font-bold text-gray-800 mb-4">Seçilen Tanı Sistemleri</h4>
                          {isEditing && editedData ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                              {DIAGNOSIS_SYSTEMS.map((system) => (
                                <label key={system} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editedData.selectedDiagnosisSystems?.includes(system) || false}
                                    onChange={(e) => {
                                      const current = editedData.selectedDiagnosisSystems || [];
                                      const updated = e.target.checked
                                        ? [...current, system]
                                        : current.filter(s => s !== system);
                                      setEditedData({ ...editedData, selectedDiagnosisSystems: updated });
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                  <span className="text-sm text-gray-700">{system}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 mb-6">
                              {anamrezData.selectedDiagnosisSystems?.map((system, index) => (
                                <span
                                  key={index}
                                  className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium"
                                >
                                  {system}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Selected Illnesses per System */}
                          {isEditing && editedData ? (
                            <div className="mt-4 space-y-3">
                              {(editedData.selectedDiagnosisSystems || []).map((system) => {
                                const availableIllnesses = DIAGNOSIS_ILLNESSES[system] || [];
                                if (availableIllnesses.length === 0) return null;
                                const selectedIllnesses = editedData.selectedIllnesses?.[system] || [];
                                const viewSuggestions = getViewDigerSuggestions(system);
                                // Find custom (non-predefined) illnesses
                                const customIllnesses = selectedIllnesses.filter(i => !availableIllnesses.includes(i));
                                return (
                                  <div key={system} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-sm font-semibold text-gray-700 mb-2">{system}</p>
                                    <div className="flex flex-wrap gap-2">
                                      {availableIllnesses.map((illness) => (
                                        <label key={illness} className="flex items-center gap-1 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={selectedIllnesses.includes(illness)}
                                            onChange={(e) => {
                                              const currentIllnesses = { ...(editedData.selectedIllnesses || {}) };
                                              const current = currentIllnesses[system] || [];
                                              currentIllnesses[system] = e.target.checked
                                                ? [...current, illness]
                                                : current.filter(i => i !== illness);
                                              setEditedData({ ...editedData, selectedIllnesses: currentIllnesses });
                                            }}
                                            className="w-3 h-3 text-red-600 rounded"
                                          />
                                          <span className="px-2 py-1 text-xs text-gray-700">{illness}</span>
                                        </label>
                                      ))}
                                      {/* Diğer checkbox */}
                                      <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={viewDigerOpen[system] || false}
                                          onChange={(e) => {
                                            setViewDigerOpen(prev => ({ ...prev, [system]: e.target.checked }));
                                            if (!e.target.checked) {
                                              setViewDigerInput(prev => ({ ...prev, [system]: '' }));
                                              setViewDigerFocused(prev => ({ ...prev, [system]: false }));
                                            }
                                          }}
                                          className="w-3 h-3 text-red-600 rounded"
                                        />
                                        <span className="px-2 py-1 text-xs text-gray-700 font-medium">Diğer</span>
                                      </label>
                                    </div>
                                    {/* Diğer input */}
                                    {viewDigerOpen[system] && (
                                      <div className="mt-2 relative">
                                        <div className="flex gap-2">
                                          <div className="relative flex-1">
                                            <input
                                              type="text"
                                              value={viewDigerInput[system] || ''}
                                              onChange={(e) => setViewDigerInput(prev => ({ ...prev, [system]: e.target.value.toUpperCase() }))}
                                              onFocus={() => setViewDigerFocused(prev => ({ ...prev, [system]: true }))}
                                              onBlur={() => setTimeout(() => setViewDigerFocused(prev => ({ ...prev, [system]: false })), 200)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  handleViewDigerAdd(system);
                                                }
                                              }}
                                              placeholder="Hastalık adı yazınız..."
                                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase"
                                              style={{ textTransform: 'uppercase' }}
                                            />
                                            {viewDigerFocused[system] && viewSuggestions.length > 0 && (
                                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                                {viewSuggestions.map((suggestion) => (
                                                  <button
                                                    key={suggestion}
                                                    type="button"
                                                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      handleViewDigerAdd(system, suggestion);
                                                    }}
                                                  >
                                                    {suggestion}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleViewDigerAdd(system)}
                                            disabled={!(viewDigerInput[system] || '').trim()}
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                          >
                                            Ekle
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    {/* Show custom illnesses with remove button */}
                                    {customIllnesses.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {customIllnesses.map((illness) => (
                                          <span key={illness} className="px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium inline-flex items-center gap-1 border border-red-200">
                                            {illness}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const currentIllnesses = { ...(editedData.selectedIllnesses || {}) };
                                                currentIllnesses[system] = (currentIllnesses[system] || []).filter(i => i !== illness);
                                                setEditedData({ ...editedData, selectedIllnesses: currentIllnesses });
                                              }}
                                              className="text-red-500 hover:text-red-800 font-bold"
                                              title="Kaldır"
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            anamrezData.selectedIllnesses && Object.keys(anamrezData.selectedIllnesses).length > 0 && (
                              <div className="mt-4 space-y-3">
                                {Object.entries(anamrezData.selectedIllnesses).map(([system, illnesses]) => (
                                  illnesses && illnesses.length > 0 && (
                                    <div key={system} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <p className="text-sm font-semibold text-gray-700 mb-2">{system}</p>
                                      <div className="flex flex-wrap gap-2">
                                        {illnesses.map((illness, idx) => (
                                          <span
                                            key={idx}
                                            className="px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium border border-red-200"
                                          >
                                            {illness}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                ))}
                              </div>
                            )
                          )}
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <h4 className="font-bold text-gray-800 mb-4">Ana Şikayet</h4>
                          {isEditing && editedData ? (
                            <textarea
                              value={editedData.complaintDetails || ''}
                              onChange={(e) => setEditedData({ ...editedData, complaintDetails: e.target.value })}
                              className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[120px] resize-y"
                              placeholder="Şikayet detaylarını yazın..."
                            />
                          ) : (
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.complaintDetails || 'Belirtilmemiş'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Medical History Section */}
                    {activeSection === 'medical-history' && (
                      <div className="space-y-4 sm:space-y-6">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                          📋 Tıbbi Geçmiş
                        </h3>
                        
                        <div className="grid grid-cols-1 gap-4 sm:gap-6">
                          <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Hastalık Geçmişi</h4>
                            {isEditing && editedData ? (
                              <textarea
                                value={editedData.pastMedicalHistory || ''}
                                onChange={(e) => setEditedData({ ...editedData, pastMedicalHistory: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] resize-y"
                                placeholder="Hastalık geçmişi..."
                              />
                            ) : (
                              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {anamrezData.pastMedicalHistory || 'Belirtilmemiş'}
                              </div>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Soy Geçmişi</h4>
                            {isEditing && editedData ? (
                              <textarea
                                value={editedData.familyHistory || ''}
                                onChange={(e) => setEditedData({ ...editedData, familyHistory: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] resize-y"
                                placeholder="Soy geçmişi..."
                              />
                            ) : (
                              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {anamrezData.familyHistory || 'Belirtilmemiş'}
                              </div>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Ameliyat Geçmişi</h4>
                            {isEditing && editedData ? (
                              <>
                                <div className="flex items-center gap-3 mb-3">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="hasSurgery"
                                      checked={editedData.hasSurgery === 'var'}
                                      onChange={() => setEditedData({ ...editedData, hasSurgery: 'var' })}
                                      className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">Var</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="hasSurgery"
                                      checked={editedData.hasSurgery !== 'var'}
                                      onChange={() => setEditedData({ ...editedData, hasSurgery: 'yok', surgicalHistory: '' })}
                                      className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">Yok</span>
                                  </label>
                                </div>
                                {editedData.hasSurgery === 'var' && (
                                  <textarea
                                    value={editedData.surgicalHistory || ''}
                                    onChange={(e) => setEditedData({ ...editedData, surgicalHistory: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-y"
                                    placeholder="Ameliyat detayları..."
                                  />
                                )}
                              </>
                            ) : (
                              <>
                                <div className="mb-2">
                                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    anamrezData.hasSurgery === 'var'
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-green-100 text-green-800'
                                  }`}>
                                    {anamrezData.hasSurgery === 'var' ? 'Var' : 'Yok'}
                                  </span>
                                </div>
                                {anamrezData.hasSurgery === 'var' && (
                                  <div className="text-gray-700 leading-relaxed whitespace-pre-wrap mt-3">
                                    {anamrezData.surgicalHistory || 'Detay belirtilmemiş'}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Alerjiler</h4>
                            {isEditing && editedData ? (
                              <textarea
                                value={editedData.allergies || ''}
                                onChange={(e) => setEditedData({ ...editedData, allergies: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-y"
                                placeholder="Alerjiler..."
                              />
                            ) : (
                              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {anamrezData.allergies || 'Belirtilmemiş'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Symptoms Section */}
                    {activeSection === 'symptoms' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            📊 Semptom Değerlendirmesi
                          </h3>
                          <div className="flex items-center gap-2">
                            {/* Comparison toggle */}
                            {previousRecord && !isEditing && (
                              <button
                                onClick={() => setShowComparison(prev => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                  showComparison
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M21 3l-7 7M3 21l7-7"/>
                                </svg>
                                {showComparison ? 'Karşılaştırma Açık' : 'Karşılaştır'}
                              </button>
                            )}
                            {/* Sort button */}
                            <button
                              onClick={() => setSymptomSortOrder(prev => prev === 'default' ? 'desc' : prev === 'desc' ? 'asc' : 'default')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                symptomSortOrder === 'default'
                                  ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                  : symptomSortOrder === 'desc'
                                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              }`}
                              title={symptomSortOrder === 'default' ? 'Varsayılan sıralama' : symptomSortOrder === 'desc' ? 'Çoktan aza' : 'Azdan çoka'}
                            >
                              {symptomSortOrder === 'default' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg> Varsayılan</>
                              ) : symptomSortOrder === 'desc' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Çoktan Aza</>
                              ) : (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Azdan Çoka</>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Comparison legend */}
                        {showComparison && previousRecord && (
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
                            <span className="font-medium text-indigo-800">🔄 Karşılaştırma:</span>
                            <span className="text-gray-600">
                              {new Date(anamrezData!.createdAt).toLocaleDateString('tr-TR')} vs {new Date(previousRecord.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> İyileşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Kötüleşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span> Değişim yok</span>
                          </div>
                        )}
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          {(() => {
                              // New categorized labels
                              const symptomCategories = [
                                { title: '1. Baş – Nörolojik Sistem', icon: '🧠', keys: ['basAgrisi', 'basDonmesi', 'gozdeUcusmalar', 'bilincDegisikligi', 'uykuDuzeniDuzensizligi'] },
                                { title: '2. Psikolojik Durum', icon: '🧘', keys: ['stres', 'kaygi', 'aniOfkelenme', 'duyguDurumDegisiklikleri'] },
                                { title: '3. Kardiyovasküler Sistem', icon: '❤️', keys: ['carpinti', 'gogusAgrisi', 'tansiyonDegisikligi'] },
                                { title: '4. Solunum Sistemi', icon: '🫁', keys: ['nefesDarligi', 'oksuruk', 'balgam', 'hirilti'] },
                                { title: '5. Gastrointestinal Sistem – Mide', icon: '🍽️', keys: ['mideYanmasi', 'mideBulantisi', 'kusma', 'siskinlikGaz', 'istahDurumu'] },
                                { title: '5. Gastrointestinal Sistem – Bağırsak', icon: '🔄', keys: ['kabizlik', 'ishal', 'mukusluYagliDiskilama', 'karinAgrisi', 'hemoroid'] },
                                { title: '6. Üriner Sistem – Erkek', icon: '🚹', keys: ['sikIdraraCikmaErkek', 'idrarYaparkenYanma', 'idrardaKopuklenme', 'kesikIdrarYapma', 'idrariTamBosaltamama', 'idrarSonrasiDamlama'] },
                                { title: '6. Üriner Sistem – Kadın', icon: '🚺', keys: ['adetDuzeniDuzensizligi', 'sonAdetTarihi', 'vajinalAkinti', 'vajinalKuruluk', 'cinselIsteksizlik', 'sikIYE', 'atesBasmasi', 'terleme'] },
                                { title: '7. Kas – Eklem Sistemi', icon: '💪', keys: ['kasAgrilari', 'eklemAgrilari', 'hareketKisitliligi', 'belBoyunSirtAgrisi', 'kasilmaKramp', 'uyusma'] },
                                { title: '8. Genel Durum', icon: '🏥', keys: ['halsizlik', 'yorgunluk', 'yorgunUyanma', 'ates', 'kiloDegisikligi', 'kasintikizariklikDokuntu'] },
                              ];
                              const symptomLabels: Record<string, string> = {
                                'basAgrisi': 'Baş ağrısı', 'basDonmesi': 'Baş dönmesi', 'gozdeUcusmalar': 'Gözlerde uçuşmalar / siyah nokta görülmesi',
                                'bilincDegisikligi': 'Bilinç değişikliği', 'uykuDuzeniDuzensizligi': 'Uyku düzeni / düzensizliği',
                                'stres': 'Stres', 'kaygi': 'Kaygı', 'aniOfkelenme': 'Ani öfkelenme', 'duyguDurumDegisiklikleri': 'Duygu durum değişiklikleri',
                                'carpinti': 'Çarpıntı', 'gogusAgrisi': 'Göğüs ağrısı', 'tansiyonDegisikligi': 'Tansiyon yüksekliği / düşüklüğü',
                                'nefesDarligi': 'Nefes darlığı', 'oksuruk': 'Öksürük', 'balgam': 'Balgam', 'hirilti': 'Hırıltı',
                                'mideYanmasi': 'Mide yanması', 'mideBulantisi': 'Mide bulantısı', 'kusma': 'Kusma', 'siskinlikGaz': 'Şişkinlik / gaz', 'istahDurumu': 'İştah durumu',
                                'kabizlik': 'Kabızlık', 'ishal': 'İshal', 'mukusluYagliDiskilama': 'Mukuslu / yağlı dışkılama', 'karinAgrisi': 'Karın ağrısı', 'hemoroid': 'Hemoroid',
                                'sikIdraraCikmaErkek': 'Sık idrara çıkma', 'idrarYaparkenYanma': 'İdrar yaparken yanma', 'idrardaKopuklenme': 'İdrarda köpüklenme',
                                'kesikIdrarYapma': 'Kesik idrar yapma', 'idrariTamBosaltamama': 'İdrarı tam boşaltamama', 'idrarSonrasiDamlama': 'İdrar sonrası damlama',
                                'adetDuzeniDuzensizligi': 'Adet düzeni / düzensizliği', 'sonAdetTarihi': 'Son adet tarihi (SAT)', 'vajinalAkinti': 'Vajinal akıntı',
                                'vajinalKuruluk': 'Vajinal kuruluk', 'cinselIsteksizlik': 'Cinsel isteksizlik', 'sikIYE': 'Sık İYE', 'atesBasmasi': 'Ateş basması', 'terleme': 'Terleme',
                                'kasAgrilari': 'Kas ağrıları', 'eklemAgrilari': 'Eklem ağrıları', 'hareketKisitliligi': 'Hareket kısıtlılığı',
                                'belBoyunSirtAgrisi': 'Bel / boyun / sırt ağrısı', 'kasilmaKramp': 'Kasılma, kramp', 'uyusma': 'Uyuşma',
                                'halsizlik': 'Halsizlik', 'yorgunluk': 'Yorgunluk', 'yorgunUyanma': 'Yorgun uyanma', 'ates': 'Ateş',
                                'kiloDegisikligi': 'Kilo değişikliği', 'kasintikizariklikDokuntu': 'Vücutta kaşıntı, kızarıklık, döküntü',
                                // Legacy labels
                                'uykuHali': 'Uyku Hali', 'siskinlik': 'Şişkinlik', 'adetDuzensizligi': 'Adet Düzensizliği',
                                'dengeKaybi': 'Denge Kaybı', 'yayginKasAgrisi': 'Yaygın Kas Ağrısı', 'nefesAlmadaGucluk': 'Nefes Almada Güçlük',
                                'ustume': 'Üşüme', 'agriliAdet': 'Ağrılı Adet', 'uykuDuzensizligi': 'Uyku Düzensizliği',
                                'kasilmaVeKramplar': 'Kasılma Ve Kramplar', 'elAyakUyusmalari': 'El Ayak Uyuşmaları', 'unutkanlik': 'Unutkanlık',
                                'kasinti': 'Kaşıntı', 'idrarKacirma': 'İdrar Kaçırma', 'idrardaYanma': 'İdrarda Yanma',
                                'geceIdraraKalkma': 'Gece İdrara Kalkma', 'kesikKesikIdrar': 'Kesik Kesik İdrar',
                                'karindaGaz': 'Karında Gaz', 'belAgrisi': 'Bel Ağrısı', 'boyunAgrisi': 'Boyun Ağrısı',
                                'yayginOdem': 'Yaygın Ödem', 'basur': 'Basur', 'algiBozuklugu': 'Algı Bozukluğu',
                                'halsizlikYorgunluk': 'Halsizlik / Yorgunluk', 'mideAgisi': 'Mide Ağısı'
                              };
                              const ratings = isEditing && editedData ? editedData.symptomRatings : anamrezData.symptomRatings;
                              const notes = anamrezData.symptomNotes || {};
                              const customSQ = anamrezData.customSymptomQuestions || [];
                              if (!ratings) return null;

                              // Collect all known keys from categories
                              const knownKeys = new Set(symptomCategories.flatMap(c => c.keys));
                              // Find legacy/unknown keys that exist in ratings but not in categories
                              const legacyKeys = Object.keys(ratings).filter(k => !knownKeys.has(k) && (ratings[k] as number) > 0);

                              // Sort helper function
                              const sortKeys = (keys: string[]) => {
                                if (symptomSortOrder === 'default') return keys;
                                return [...keys].sort((a, b) => {
                                  const va = (ratings[a] as number) ?? 0;
                                  const vb = (ratings[b] as number) ?? 0;
                                  return symptomSortOrder === 'desc' ? vb - va : va - vb;
                                });
                              };

                              return (
                                <div className="space-y-6">
                                  {symptomCategories.map((cat) => {
                                    const catRatings = sortKeys(cat.keys.filter(k => ratings[k] !== undefined));
                                    if (catRatings.length === 0) return null;
                                    const catCustom = customSQ.filter((q: any) => q.categoryTitle === cat.title);

                                    return (
                                      <div key={cat.title}>
                                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                          {cat.icon} {cat.title}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                          {catRatings.map((key) => {
                                            const value = ratings[key] as number;
                                            const prevValue = showComparison && previousRecord?.symptomRatings?.[key];
                                            const hasPrev = showComparison && prevValue !== undefined && prevValue !== null;
                                            const delta = hasPrev ? value - (prevValue as number) : 0;
                                            return (
                                              <div key={key} className={`p-3 rounded-lg transition-all duration-200 ${
                                                showComparison && hasPrev && delta !== 0
                                                  ? delta < 0
                                                    ? 'bg-emerald-50 border border-emerald-200'
                                                    : 'bg-red-50 border border-red-200'
                                                  : 'bg-gray-50'
                                              }`}>
                                                <span className="text-gray-700 text-sm font-medium block mb-1">
                                                  {symptomLabels[key] || key}
                                                </span>
                                                {isEditing && editedData ? (
                                                  <div className="flex items-center gap-2">
                                                    <input type="range" min="0" max="10" value={value}
                                                      onChange={(e) => {
                                                        const newRatings = { ...editedData.symptomRatings, [key]: Number(e.target.value) };
                                                        setEditedData({ ...editedData, symptomRatings: newRatings });
                                                      }}
                                                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                    />
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold min-w-[40px] text-center ${
                                                      value <= 3 ? 'bg-green-100 text-green-700' : value <= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                    }`}>{value}/10</span>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                        value <= 3 ? 'bg-green-100 text-green-700' : value <= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                      }`}>{value}/10</div>
                                                      {/* Comparison indicator */}
                                                      {showComparison && hasPrev && (
                                                        <div className="flex items-center gap-1">
                                                          <span className="text-gray-400 text-xs">önceki: {prevValue as number}/10</span>
                                                          {delta !== 0 && (
                                                            <span className={`flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                                              delta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                            }`}>
                                                              {delta < 0 ? (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                                              ) : (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                                                              )}
                                                              {delta > 0 ? `+${delta}` : delta}
                                                            </span>
                                                          )}
                                                          {delta === 0 && (
                                                            <span className="text-xs text-gray-400 font-medium">=</span>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                    {/* Mini bar comparison */}
                                                    {showComparison && hasPrev && (
                                                      <div className="flex flex-col gap-0.5 w-16">
                                                        <div className="flex items-center gap-1">
                                                          <div className="text-[9px] text-gray-500 w-5">Şu</div>
                                                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${
                                                              value <= 3 ? 'bg-emerald-500' : value <= 6 ? 'bg-yellow-500' : 'bg-red-500'
                                                            }`} style={{width: `${value * 10}%`}} />
                                                          </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                          <div className="text-[9px] text-gray-400 w-5">Ön</div>
                                                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full bg-gray-400" style={{width: `${(prevValue as number) * 10}%`}} />
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                                {notes[key] && (
                                                  <div className="mt-2 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 border border-blue-100">
                                                    📝 {notes[key]}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {/* Custom questions for this category */}
                                          {catCustom.map((cq: any) => (
                                            <div key={cq.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                              <span className="text-gray-700 text-sm font-medium block mb-1">{cq.label || 'Özel soru'}</span>
                                              <div className={`px-2 py-1 rounded-full text-xs font-bold inline-block ${
                                                cq.rating <= 3 ? 'bg-green-100 text-green-700' : cq.rating <= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                              }`}>{cq.rating}/10</div>
                                              {cq.note && (
                                                <div className="mt-2 text-xs text-blue-700 bg-white rounded px-2 py-1 border border-blue-100">
                                                  📝 {cq.note}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Legacy keys that don't fit categories */}
                                  {legacyKeys.length > 0 && (
                                    <div>
                                      <h4 className="font-bold text-gray-800 mb-3">Diğer Semptomlar</h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {sortKeys(legacyKeys).map((key) => {
                                          const value = ratings[key] as number;
                                          const prevValue = showComparison && previousRecord?.symptomRatings?.[key];
                                          const hasPrev = showComparison && prevValue !== undefined && prevValue !== null;
                                          const delta = hasPrev ? value - (prevValue as number) : 0;
                                          return (
                                            <div key={key} className={`p-3 rounded-lg flex items-center justify-between ${
                                              showComparison && hasPrev && delta !== 0
                                                ? delta < 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                                                : 'bg-gray-50'
                                            }`}>
                                              <span className="text-gray-700 text-sm font-medium">{symptomLabels[key] || key}</span>
                                              <div className="flex items-center gap-2">
                                                <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                  value <= 3 ? 'bg-green-100 text-green-700' : value <= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>{value}/10</div>
                                                {showComparison && hasPrev && delta !== 0 && (
                                                  <span className={`flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                                    delta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                  }`}>
                                                    {delta < 0 ? (
                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                                    ) : (
                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                                                    )}
                                                    {delta > 0 ? `+${delta}` : delta}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Diagnosis Responses Section */}
                    {activeSection === 'diagnosis-responses' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            🩺 Sistem Soruları
                          </h3>
                          <div className="flex items-center gap-2">
                            {/* Comparison toggle */}
                            {previousRecord && !isEditing && (
                              <button
                                onClick={() => setShowComparison(prev => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                  showComparison
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M21 3l-7 7M3 21l7-7"/>
                                </svg>
                                {showComparison ? 'Karşılaştırma Açık' : 'Karşılaştır'}
                              </button>
                            )}
                            <button
                              onClick={() => setDiagnosisSortOrder(prev => prev === 'default' ? 'desc' : prev === 'desc' ? 'asc' : 'default')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                diagnosisSortOrder === 'default'
                                  ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                  : diagnosisSortOrder === 'desc'
                                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              }`}
                              title={diagnosisSortOrder === 'default' ? 'Varsayılan sıralama' : diagnosisSortOrder === 'desc' ? 'Çoktan aza' : 'Azdan çoka'}
                            >
                              {diagnosisSortOrder === 'default' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg> Varsayılan</>
                              ) : diagnosisSortOrder === 'desc' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Çoktan Aza</>
                              ) : (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Azdan Çoka</>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Comparison legend */}
                        {showComparison && previousRecord && activeSection === 'diagnosis-responses' && (
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
                            <span className="font-medium text-indigo-800">🔄 Karşılaştırma:</span>
                            <span className="text-gray-600">
                              {new Date(anamrezData!.createdAt).toLocaleDateString('tr-TR')} vs {new Date(previousRecord.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> İyileşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Kötüleşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span> Değişim yok</span>
                          </div>
                        )}
                        
                        {anamrezData.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0 ? (
                          anamrezData.selectedDiagnosisSystems.map((diagnosis) => {
                            const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
                            if (!questionSet) return null;

                            return (
                              <div key={diagnosis} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4">{questionSet.label}</h4>
                                <div className="grid grid-cols-1 gap-3">
                                  {(() => {
                                    const dataSource = isEditing && editedData ? editedData : anamrezData;
                                    const sortedQuestions = diagnosisSortOrder === 'default'
                                      ? questionSet.questions
                                      : [...questionSet.questions].sort((a, b) => {
                                          const ra = dataSource.diagnosisResponses?.[diagnosis]?.[a] || 0;
                                          const rb = dataSource.diagnosisResponses?.[diagnosis]?.[b] || 0;
                                          return diagnosisSortOrder === 'desc' ? rb - ra : ra - rb;
                                        });
                                    return sortedQuestions.map((question) => {
                                    const rating = dataSource.diagnosisResponses?.[diagnosis]?.[question] || 0;
                                    const prevRating = showComparison ? (previousRecord?.diagnosisResponses?.[diagnosis]?.[question] ?? null) : null;
                                    const hasPrevDiag = showComparison && prevRating !== null;
                                    const diagDelta = hasPrevDiag ? rating - (prevRating as number) : 0;

                                    return (
                                      <div key={question} className={`p-3 rounded-lg transition-all duration-200 ${
                                        showComparison && hasPrevDiag && diagDelta !== 0
                                          ? diagDelta < 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                                          : 'bg-gray-50'
                                      } ${isEditing ? '' : 'flex items-center justify-between'}`}>
                                        <span className="text-gray-700 text-sm block mb-1">{question}</span>
                                        {isEditing && editedData ? (
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="range"
                                              min="0"
                                              max="10"
                                              value={rating}
                                              onChange={(e) => {
                                                const newResponses = { ...(editedData.diagnosisResponses || {}) };
                                                if (!newResponses[diagnosis]) newResponses[diagnosis] = {};
                                                newResponses[diagnosis] = { ...newResponses[diagnosis], [question]: Number(e.target.value) };
                                                setEditedData({ ...editedData, diagnosisResponses: newResponses });
                                              }}
                                              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold min-w-[40px] text-center ${
                                              rating === 0 ? 'bg-gray-100 text-gray-600'
                                                : rating <= 3 ? 'bg-green-100 text-green-700'
                                                : rating <= 6 ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                              {rating}/10
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                              rating === 0 ? 'bg-gray-100 text-gray-600'
                                                : rating <= 3 ? 'bg-green-100 text-green-700'
                                                : rating <= 6 ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                              {rating}/10
                                            </div>
                                            {/* Comparison indicator */}
                                            {showComparison && hasPrevDiag && (
                                              <div className="flex items-center gap-1">
                                                <span className="text-gray-400 text-xs">önceki: {prevRating as number}/10</span>
                                                {diagDelta !== 0 && (
                                                  <span className={`flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                                    diagDelta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                  }`}>
                                                    {diagDelta < 0 ? (
                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                                    ) : (
                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                                                    )}
                                                    {diagDelta > 0 ? `+${diagDelta}` : diagDelta}
                                                  </span>
                                                )}
                                                {diagDelta === 0 && (
                                                  <span className="text-xs text-gray-400 font-medium">=</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                  })()}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200 text-center">
                            <div className="text-yellow-600 text-lg mb-2">⚠️</div>
                            <h4 className="text-lg font-semibold text-yellow-700 mb-2">Sistem Seçimi Yapılmamış</h4>
                            <p className="text-yellow-600">
                              Bu anamnez kaydında herhangi bir tanı sistemi seçilmemiş.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lifestyle Section */}
                    {activeSection === 'lifestyle' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          🏃‍♂️ Yaşam Tarzı Soruları
                        </h3>
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {(() => {
                              const questionLabels: Record<string, string> = {
                                'exerciseFrequency': 'Spor Yapma Sıklığı',
                                'dailySleepHours': 'Günlük Uyku Saati',
                                'monthlyVegetableConsumption': 'Aylık Sebze Tüketimi',
                                'monthlyRedMeatConsumption': 'Aylık Kırmızı Et Tüketimi',
                                'monthlyChickenConsumption': 'Aylık Tavuk Eti Tüketimi',
                                'dailyWaterConsumption': 'Günlük Su Tüketimi',
                                'smokingFrequency': 'Sigara İçme Sıklığı',
                                'alcoholFrequency': 'Alkol Kullanma Sıklığı'
                              };
                              const questions = isEditing && editedData ? editedData.additionalQuestions : anamrezData.additionalQuestions;
                              if (!questions) return null;
                              return Object.entries(questions).map(([key, value]) => {
                                if (!isEditing && !value) return null;
                                return (
                                  <div key={key}>
                                    <label className="block text-gray-600 text-sm font-medium mb-2">
                                      {questionLabels[key] || key}
                                    </label>
                                    {isEditing && editedData ? (
                                      <input
                                        type="text"
                                        value={value || ''}
                                        onChange={(e) => {
                                          const newQuestions = { ...editedData.additionalQuestions, [key]: e.target.value };
                                          setEditedData({ ...editedData, additionalQuestions: newQuestions });
                                        }}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                      />
                                    ) : (
                                      <div className="text-gray-900 font-semibold">{value}</div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* Custom Questions */}
                        {(() => {
                          const customQs = isEditing && editedData ? editedData.customQuestions : anamrezData.customQuestions;
                          if (!customQs || customQs.length === 0) return null;
                          return (
                            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                              <h4 className="font-bold text-gray-800 mb-4">Ek Sorular</h4>
                              <div className="space-y-4">
                                {customQs.map((customQ, index) => (
                                  <div key={customQ.id} className="border-l-4 border-orange-300 pl-4">
                                    <div className="font-medium text-gray-800 mb-2">
                                      {index + 1}. {customQ.question}
                                    </div>
                                    {isEditing && editedData ? (
                                      <input
                                        type="text"
                                        value={customQ.answer || ''}
                                        onChange={(e) => {
                                          const newCustomQs = [...editedData.customQuestions];
                                          newCustomQs[index] = { ...newCustomQs[index], answer: e.target.value };
                                          setEditedData({ ...editedData, customQuestions: newCustomQs });
                                        }}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                      />
                                    ) : (
                                      <div className="text-gray-700">{customQ.answer}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Toxicity Assessment Section */}
                    {activeSection === 'toxicity' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            ⚠️ Toksisite Değerlendirmesi
                          </h3>
                          <div className="flex items-center gap-2">
                            {/* Comparison toggle */}
                            {previousRecord && !isEditing && (
                              <button
                                onClick={() => setShowComparison(prev => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                  showComparison
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M21 3l-7 7M3 21l7-7"/>
                                </svg>
                                {showComparison ? 'Karşılaştırma Açık' : 'Karşılaştır'}
                              </button>
                            )}
                            <button
                              onClick={() => setToxicitySortOrder(prev => prev === 'default' ? 'desc' : prev === 'desc' ? 'asc' : 'default')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                toxicitySortOrder === 'default'
                                  ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                  : toxicitySortOrder === 'desc'
                                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              }`}
                              title={toxicitySortOrder === 'default' ? 'Varsayılan sıralama' : toxicitySortOrder === 'desc' ? 'Çoktan aza' : 'Azdan çoka'}
                            >
                              {toxicitySortOrder === 'default' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg> Varsayılan</>
                              ) : toxicitySortOrder === 'desc' ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Çoktan Aza</>
                              ) : (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Azdan Çoka</>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Comparison legend */}
                        {showComparison && previousRecord && activeSection === 'toxicity' && (
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
                            <span className="font-medium text-indigo-800">🔄 Karşılaştırma:</span>
                            <span className="text-gray-600">
                              {new Date(anamrezData!.createdAt).toLocaleDateString('tr-TR')} vs {new Date(previousRecord.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> İyileşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Kötüleşme</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span> Değişim yok</span>
                          </div>
                        )}
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                              <div className="text-2xl font-bold text-gray-800">
                                {anamrezData.toxicityAssessment?.totalScore || 0}
                              </div>
                              <div className="text-sm text-gray-600">Toplam Puan</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                              <div className="text-2xl font-bold text-gray-800">
                                {anamrezData.toxicityAssessment?.ratedSymptomsCount || 0}
                              </div>
                              <div className="text-sm text-gray-600">Değerlendirilen Semptom</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                              <div className={`text-2xl font-bold ${
                                anamrezData.toxicityAssessment?.hasToxicity ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {anamrezData.toxicityAssessment?.hasToxicity ? 'VAR' : 'YOK'}
                              </div>
                              <div className="text-sm text-gray-600">Yüksek Toksisite</div>
                            </div>
                          </div>

                          {anamrezData.toxicityAssessment?.hasToxicity && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <div className="text-red-600 text-xl">⚠️</div>
                                <div>
                                  <h5 className="font-semibold text-red-800 mb-1">Yüksek Toksisite Tespit Edildi</h5>
                                  <p className="text-red-700 text-sm">
                                    {anamrezData.toxicityAssessment.ratedSymptomsCount} semptom değerlendirilmiş ve 
                                    toplam {anamrezData.toxicityAssessment.totalScore} puan alınmıştır.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Individual Toxicity Scores */}
                          {anamrezData.toxicityAssessment?.toxicityScores && Object.keys(anamrezData.toxicityAssessment.toxicityScores).length > 0 && (
                            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                              <h4 className="font-bold text-gray-800 mb-4">Toksisite Semptom Puanları</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {(() => {
                                  const entries = Object.entries(anamrezData.toxicityAssessment.toxicityScores);
                                  const sortedEntries = toxicitySortOrder === 'default'
                                    ? entries
                                    : [...entries].sort((a, b) => toxicitySortOrder === 'desc' ? b[1] - a[1] : a[1] - b[1]);
                                  return sortedEntries.map(([key, value]) => {
                                  const prevToxValue = showComparison ? (previousRecord?.toxicityAssessment?.toxicityScores?.[key] ?? null) : null;
                                  const hasPrevTox = showComparison && prevToxValue !== null;
                                  const toxDelta = hasPrevTox ? value - (prevToxValue as number) : 0;
                                  // Convert symptom keys to readable labels (same as symptom ratings)
                                  const symptomLabels: Record<string, string> = {
                                    'uykuHali': 'Uyku Hali',
                                    'gozdeUcusmalar': 'Gözde Uçuşmalar',
                                    'carpinti': 'Çarpıntı',
                                    'siskinlik': 'Şişkinlik',
                                    'adetDuzensizligi': 'Adet Düzensizliği',
                                    'dengeKaybi': 'Denge Kaybı',
                                    'yayginKasAgrisi': 'Yaygın Kas Ağrısı',
                                    'nefesAlmadaGucluk': 'Nefes Almada Güçlük',
                                    'ustume': 'Üşüme',
                                    'terleme': 'Terleme',
                                    'stres': 'Stres',
                                    'agriliAdet': 'Ağrılı Adet',
                                    'uykuDuzensizligi': 'Uyku Düzensizliği',
                                    'oksuruk': 'Öksürük',
                                    'balgam': 'Balgam',
                                    'kasilmaVeKramplar': 'Kasılma Ve Kramplar',
                                    'elAyakUyusmalari': 'El Ayak Uyuşmaları',
                                    'unutkanlik': 'Unutkanlık',
                                    'kasinti': 'Kaşıntı',
                                    'idrarKacirma': 'İdrar Kaçırma',
                                    'idrardaYanma': 'İdrarda Yanma',
                                    'geceIdraraKalkma': 'Gece İdrara Kalkma',
                                    'kesikKesikIdrar': 'Kesik Kesik İdrar',
                                    'kabizlik': 'Kabızlık',
                                    'karindaGaz': 'Karında Gaz',
                                    'belAgrisi': 'Bel Ağrısı',
                                    'ishal': 'İshal',
                                    'boyunAgrisi': 'Boyun Ağrısı',
                                    'yayginOdem': 'Yaygın Ödem',
                                    'basur': 'Basur',
                                    'eklemAgrilari': 'Eklem Ağrıları',
                                    'algiBozuklugu': 'Algı Bozukluğu',
                                    'halsizlikYorgunluk': 'Halsizlik / Yorgunluk',
                                    'yorgunUyanma': 'Yorgun Uyanma',
                                    'basDonmesi': 'Baş Dönmesi',
                                    'basAgrisi': 'Baş Ağrısı',
                                    'mideAgisi': 'Mide Ağısı',
                                    'mideYanmasi': 'Mide Yanması'
                                  };
                                  
                                  return (
                                    <div key={key} className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                                      showComparison && hasPrevTox && toxDelta !== 0
                                        ? toxDelta < 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                                        : 'bg-gray-50'
                                    }`}>
                                      <span className="text-gray-700 text-sm font-medium">
                                        {symptomLabels[key] || key}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                          value === 0
                                            ? 'bg-gray-100 text-gray-600'
                                            : value <= 3
                                            ? 'bg-green-100 text-green-700'
                                            : value <= 6
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                          {value}/10
                                        </div>
                                        {/* Comparison indicator */}
                                        {showComparison && hasPrevTox && (
                                          <div className="flex items-center gap-1">
                                            <span className="text-gray-400 text-xs">önceki: {prevToxValue as number}/10</span>
                                            {toxDelta !== 0 && (
                                              <span className={`flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                                toxDelta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                              }`}>
                                                {toxDelta < 0 ? (
                                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                                ) : (
                                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                                                )}
                                                {toxDelta > 0 ? `+${toxDelta}` : toxDelta}
                                              </span>
                                            )}
                                            {toxDelta === 0 && (
                                              <span className="text-xs text-gray-400 font-medium">=</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                });
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Optional Scans Section */}
                    {activeSection === 'optional-scans' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          📋 Opsiyonel Taramalar
                        </h3>

                        {anamrezData.optionalScans && (
                          anamrezData.optionalScans.meridianScan?.enabled ||
                          anamrezData.optionalScans.thermalScan?.enabled ||
                          anamrezData.optionalScans.toxicityScan?.enabled ||
                          anamrezData.optionalScans.biyokimya?.enabled ||
                          anamrezData.optionalScans.radyoloji?.enabled ||
                          anamrezData.optionalScans.patoloji?.enabled ||
                          anamrezData.optionalScans.epikriz?.enabled
                        ) ? (
                          <div className="space-y-4">
                            {anamrezData.optionalScans.meridianScan?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Meridyen Tarama</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {/* Display uploaded files (supports multiple) */}
                                {(() => {
                                  const scan = anamrezData.optionalScans.meridianScan as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img
                                                  src={fileUrl}
                                                  alt={`Meridyen Tarama ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')}
                                                />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.thermalScan?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Termal Tarama (IRIS-XP)</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.thermalScan as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Termal Tarama ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.toxicityScan?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Toksisite Ölçümü</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.toxicityScan as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Toksisite Ölçümü ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.biyokimya?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Biyokimya</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.biyokimya as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Biyokimya ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.radyoloji?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Radyolojik Görüntüleme</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.radyoloji as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Radyolojik Görüntüleme ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.patoloji?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Patoloji</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.patoloji as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Patoloji ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {anamrezData.optionalScans.epikriz?.enabled && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                    ✓
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-bold text-purple-900">Epikriz</h4>
                                    <p className="text-sm text-purple-700">Seçilmiş</p>
                                  </div>
                                </div>
                                {(() => {
                                  const scan = anamrezData.optionalScans.epikriz as any;
                                  const urls: string[] = scan?.fileUrls?.filter((u: string) => u && u !== 'pending') ||
                                    (scan?.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
                                  if (urls.length === 0) return null;
                                  return (
                                    <div className="mt-4 border-t border-purple-200 pt-4">
                                      <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosyalar ({urls.length}):</p>
                                      <div className="space-y-3">
                                        {urls.map((fileUrl: string, idx: number) => {
                                          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                          const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                          if (isImage) {
                                            return (
                                              <div key={idx} className="space-y-2">
                                                <p className="text-xs text-purple-600 font-medium">Dosya {idx + 1}</p>
                                                <img src={fileUrl} alt={`Epikriz ${idx + 1}`}
                                                  className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => window.open(fileUrl, '_blank')} />
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  🔍 Tam Boyut Görüntüle
                                                </a>
                                              </div>
                                            );
                                          } else if (isPdf) {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-red-600 text-xl">📄</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">PDF Dosyası {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  📄 PDF Aç
                                                </a>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                  <span className="text-gray-600 text-xl">📎</span>
                                                </div>
                                                <div className="flex-1">
                                                  <p className="font-medium text-gray-800">Dosya {idx + 1}</p>
                                                  <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                                </div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                  ⬇️ İndir
                                                </a>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                            <div className="text-center text-gray-500">
                              <div className="text-4xl mb-3">📋</div>
                              <p className="font-medium">Opsiyonel tarama seçilmemiş</p>
                              <p className="text-sm mt-1">Bu hasta için hiçbir opsiyonel tarama seçilmemiştir.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conventional Treatment Section */}
                    {activeSection === 'treatment' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          💊 Konvansiyonel Tıp Tedavisi
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Kullandığı İlaçlar</h4>
                            {isEditing && editedData ? (
                              <textarea
                                value={editedData.conventionalTreatment?.currentMedications || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData,
                                  conventionalTreatment: { ...editedData.conventionalTreatment, currentMedications: e.target.value }
                                })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] resize-y"
                                placeholder="Kullandığı ilaçlar..."
                              />
                            ) : (
                              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {anamrezData.conventionalTreatment?.currentMedications || 'Belirtilmemiş'}
                              </div>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Aldığı Diğer Tedaviler</h4>
                            {isEditing && editedData ? (
                              <textarea
                                value={editedData.conventionalTreatment?.otherTreatments || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData,
                                  conventionalTreatment: { ...editedData.conventionalTreatment, otherTreatments: e.target.value }
                                })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] resize-y"
                                placeholder="Diğer tedaviler..."
                              />
                            ) : (
                              <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {anamrezData.conventionalTreatment?.otherTreatments || 'Belirtilmemiş'}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Device Scan File */}
                        {anamrezData.conventionalTreatment?.deviceScanFileUrl && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                            <h4 className="font-bold text-blue-900 mb-4">📎 Cihaz Tarama Dosyası</h4>
                            {(() => {
                              const fileUrl = anamrezData.conventionalTreatment.deviceScanFileUrl;
                              const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                              const isPdf = /\.pdf(\?|$)/i.test(fileUrl);

                              if (isImage) {
                                return (
                                  <div className="space-y-3">
                                    <img
                                      src={fileUrl}
                                      alt="Cihaz Tarama"
                                      className="max-w-full h-auto max-h-64 rounded-lg border border-blue-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => window.open(fileUrl, '_blank')}
                                    />
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                      🔍 Tam Boyut Görüntüle
                                    </a>
                                  </div>
                                );
                              } else if (isPdf) {
                                return (
                                  <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-blue-200">
                                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                                      <span className="text-red-600 text-xl">📄</span>
                                    </div>
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800">PDF Dosyası</p>
                                      <p className="text-sm text-gray-500">Görüntülemek için tıklayın</p>
                                    </div>
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                      📄 PDF Aç
                                    </a>
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-blue-200">
                                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                      <span className="text-gray-600 text-xl">📎</span>
                                    </div>
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800">Dosya</p>
                                      <p className="text-sm text-gray-500">İndirmek için tıklayın</p>
                                    </div>
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                      ⬇️ İndir
                                    </a>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Patient Images Section */}
                    {activeSection === 'patient-images' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          🖼️ Hasta Görüntüleri
                        </h3>

                        {loadingMedia ? (
                          <div className="flex items-center justify-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          </div>
                        ) : mediaFiles.length > 0 ? (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-500">
                                {mediaFiles.length} görüntü/video mevcut. Fotoğrafları seçerek yan yana karşılaştırabilirsiniz.
                              </p>
                              {selectedForComparison.length >= 2 && (
                                <button
                                  onClick={() => setShowComparisonOverlay(true)}
                                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                >
                                  🔍 {selectedForComparison.length} Fotoğrafı Karşılaştır
                                </button>
                              )}
                            </div>

                            {selectedForComparison.length > 0 && (
                              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
                                <span>{selectedForComparison.length} fotoğraf seçildi</span>
                                {selectedForComparison.length >= 2 && (
                                  <button
                                    onClick={() => setShowComparisonOverlay(true)}
                                    className="font-semibold underline hover:no-underline"
                                  >
                                    Karşılaştır
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedForComparison([])}
                                  className="ml-auto text-blue-400 hover:text-blue-600"
                                >
                                  Seçimi Temizle
                                </button>
                              </div>
                            )}

                            {/* Images grid - side by side */}
                            {mediaFiles.filter(m => m.type === 'image').length > 0 && (
                              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4">Fotoğraflar ({mediaFiles.filter(m => m.type === 'image').length})</h4>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                  {mediaFiles.filter(m => m.type === 'image').map((media) => {
                                    const isSelected = selectedForComparison.includes(media.id);
                                    return (
                                      <div
                                        key={media.id}
                                        className={`group relative border-2 rounded-lg overflow-hidden bg-gray-50 transition-all ${
                                          isSelected
                                            ? 'border-blue-500 ring-2 ring-blue-300 shadow-md'
                                            : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                      >
                                        {/* Selection checkbox */}
                                        <div
                                          className="absolute top-2 left-2 z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedForComparison(prev =>
                                              prev.includes(media.id)
                                                ? prev.filter(id => id !== media.id)
                                                : [...prev, media.id]
                                            );
                                          }}
                                        >
                                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${
                                            isSelected
                                              ? 'bg-blue-500 border-blue-500 text-white'
                                              : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'
                                          }`}>
                                            {isSelected && <span className="text-xs font-bold">{selectedForComparison.indexOf(media.id) + 1}</span>}
                                          </div>
                                        </div>

                                        <img
                                          src={media.url}
                                          alt={media.name}
                                          className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => setSelectedMediaForPreview(media)}
                                        />
                                        <div className="p-2">
                                          <p className="text-xs text-gray-600 truncate" title={media.name}>{media.name}</p>
                                          <p className="text-xs text-gray-400">
                                            {new Date(media.uploadedAt).toLocaleDateString('tr-TR')}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-gray-400 mt-3">Fotoğraf üzerindeki daireye tıklayarak seçin; seçili fotoğrafları yan yana karşılaştırabilirsiniz.</p>
                              </div>
                            )}

                            {/* Videos grid - side by side */}
                            {mediaFiles.filter(m => m.type === 'video').length > 0 && (
                              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4">Videolar ({mediaFiles.filter(m => m.type === 'video').length})</h4>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {mediaFiles.filter(m => m.type === 'video').map((media) => (
                                    <div key={media.id} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                                      <video
                                        src={media.url}
                                        controls
                                        className="w-full h-56 object-contain bg-black"
                                      />
                                      <div className="p-2">
                                        <p className="text-xs text-gray-600 truncate" title={media.name}>{media.name}</p>
                                        <p className="text-xs text-gray-400">
                                          {new Date(media.uploadedAt).toLocaleDateString('tr-TR')}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                            <div className="text-center text-gray-500">
                              <div className="text-4xl mb-3">🖼️</div>
                              <p className="font-medium">Hasta görüntüsü bulunamadı</p>
                              <p className="text-sm mt-1">Bu hasta için henüz fotoğraf veya video yüklenmemiştir.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="text-gray-400 text-4xl mb-4">📄</div>
                      <p className="text-gray-600">Anamnez verisi bulunamadı.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Overlay */}
      {showComparisonOverlay && selectedForComparison.length >= 2 && (
        <ComparisonOverlay
          images={mediaFiles.filter(m => selectedForComparison.includes(m.id))}
          onClose={() => setShowComparisonOverlay(false)}
        />
      )}

      {/* Image Preview Lightbox */}
      {selectedMediaForPreview && (() => {
        const imageFiles = mediaFiles.filter(m => m.type === 'image');
        const currentIndex = imageFiles.findIndex(m => m.id === selectedMediaForPreview.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < imageFiles.length - 1;

        return (
          <LightboxOverlay
            media={selectedMediaForPreview}
            currentIndex={currentIndex}
            total={imageFiles.length}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onClose={() => setSelectedMediaForPreview(null)}
            onPrev={() => hasPrev && setSelectedMediaForPreview(imageFiles[currentIndex - 1])}
            onNext={() => hasNext && setSelectedMediaForPreview(imageFiles[currentIndex + 1])}
          />
        );
      })()}
    </>
  );
};

export default AnamrezViewModal;