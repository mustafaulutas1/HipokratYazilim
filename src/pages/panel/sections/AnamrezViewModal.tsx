import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import jsPDF from 'jspdf';
import { DIAGNOSIS_SPECIFIC_QUESTIONS } from '../../../constants';

// Use shared diagnosis structure from constants

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
}

interface AnamrezViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
}

interface AnamrezData {
  id: string;
  patientId: string;
  patientName: string;
  selectedDiagnosisSystems: string[];
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

const AnamrezViewModal: React.FC<AnamrezViewModalProps> = ({
  isOpen,
  onClose,
  patient
}) => {
  const [anamrezData, setAnamrezData] = useState<AnamrezData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('patient-info');

  // PDF Generation Function
  const generatePDF = () => {
    if (!patient || !anamrezData) return;

    // Create PDF with UTF-8 support
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true,
      compress: true
    });
    
    let yPosition = 20;
    const pageHeight = pdf.internal.pageSize.height;
    const lineHeight = 8;
    const margin = 20;
    const maxWidth = pdf.internal.pageSize.width - 2 * margin;

    // Helper function to properly convert Turkish text for PDF compatibility
    const convertTurkishForPDF = (text: string): string => {
      if (!text) return '';
      
      // Convert to string first
      let convertedText = String(text);
      
      // Use multiple replace operations for all Turkish character variants
      convertedText = convertedText
        // Handle ç/Ç
        .replace(/[çĉčć]/gi, 'c')
        .replace(/[ÇĈČĆ]/gi, 'C')
        // Handle ğ/Ğ  
        .replace(/[ğĝģ]/gi, 'g')
        .replace(/[ĞĜĢ]/gi, 'G')
        // Handle ı/İ/I
        .replace(/[ıĩīįì]/gi, 'i')
        .replace(/[İĨĪĮÌÍÎÏ]/gi, 'I')
        // Handle ö/Ö
        .replace(/[öõōőòóôø]/gi, 'o')
        .replace(/[ÖÕŌŐÒÓÔØ]/gi, 'O')
        // Handle ş/Ş
        .replace(/[şśšŝș]/gi, 's')
        .replace(/[ŞŚŠŜȘ]/gi, 'S')
        // Handle ü/Ü
        .replace(/[üũūűùúû]/gi, 'u')
        .replace(/[ÜŨŪŰÙÚÛ]/gi, 'U')
        // Handle Unicode escape sequences that might appear
        .replace(/\\u011f/gi, 'g')  // ğ
        .replace(/\\u011e/gi, 'G')  // Ğ
        .replace(/\\u0131/gi, 'i')  // ı
        .replace(/\\u0130/gi, 'I')  // İ
        .replace(/\\u015f/gi, 's')  // ş
        .replace(/\\u015e/gi, 'S')  // Ş
        .replace(/\\u00fc/gi, 'u')  // ü
        .replace(/\\u00dc/gi, 'U')  // Ü
        .replace(/\\u00f6/gi, 'o')  // ö
        .replace(/\\u00d6/gi, 'O')  // Ö
        .replace(/\\u00e7/gi, 'c')  // ç
        .replace(/\\u00c7/gi, 'C'); // Ç
      
      return convertedText.trim();
    };

    // Helper function to add text and handle page breaks
    const addText = (text: string, fontSize: number = 10, isBold: boolean = false) => {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = 20;
      }
      
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      
      // Convert Turkish characters to PDF-safe equivalents
      const safeText = convertTurkishForPDF(text);
      
      // Split text into lines that fit within the page width
      const lines = pdf.splitTextToSize(safeText, maxWidth);
      
      // Check if we need a new page for all lines
      if (yPosition + (lines.length * lineHeight) > pageHeight - 30) {
        pdf.addPage();
        yPosition = 20;
      }
      
      // Add text
      pdf.text(lines, margin, yPosition);
      yPosition += lines.length * lineHeight;
    };

    // Helper function to add section header
    const addSectionHeader = (title: string) => {
      yPosition += 10;
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 20;
      }
      addText(title, 14, true);
      yPosition += 5;
    };

    // Title
    addText('ANAMNEZ RAPORU', 16, true);
    yPosition += 10;

    // Patient Information
    addSectionHeader('HASTA BİLGİLERİ');
    addText(`Ad Soyad: ${patient.fullName}`);
    addText(`TC Kimlik No: ${patient.tcNo}`);
    addText(`Telefon: ${patient.phone}`);
    addText(`Doğum Tarihi: ${patient.birthDate}`);
    addText(`Cinsiyet: ${patient.gender}`);
    addText(`Adres: ${patient.address}`);
    addText(`Acil Durum Telefonu: ${patient.emergencyPhone}`);
    addText(`Başvuru Nedeni: ${patient.visitReason}`);
    if (anamrezData.selectedDoctor) {
      addText(`Tercih Edilen Doktor: Dr. ${anamrezData.selectedDoctor.name}`);
      addText(`Uzmanlık: ${anamrezData.selectedDoctor.specialization}`);
      addText(`Bölüm: ${anamrezData.selectedDoctor.department}`);
      addText(`E-posta: ${anamrezData.selectedDoctor.email}`);
    }
    if (patient.anamrezCompletedAt) {
      addText(`Anamnez Tamamlanma Tarihi: ${new Date(patient.anamrezCompletedAt).toLocaleDateString('tr-TR')}`);
      addText(`Anamnez Tamamlayan: ${patient.anamrezCompletedBy}`);
    }

    // Medical History
    addSectionHeader('TIBBİ GEÇMİŞ');
    addText(`Şikayet Detayları: ${anamrezData.complaintDetails || 'Belirtilmemiş'}`);
    addText(`Geçmiş Hastalık Öyküsü: ${anamrezData.pastMedicalHistory || 'Belirtilmemiş'}`);
    addText(`Aile Öyküsü: ${anamrezData.familyHistory || 'Belirtilmemiş'}`);
    addText(`Ameliyat Öyküsü: ${anamrezData.hasSurgery === 'var' ? anamrezData.surgicalHistory : 'Ameliyat geçmişi yok'}`);
    addText(`Alerjiler: ${anamrezData.allergies || 'Belirtilmemiş'}`);

    // Symptom Ratings
    addSectionHeader('SEMPTOM DEĞERLENDİRMESİ');
    if (anamrezData.symptomRatings && Object.keys(anamrezData.symptomRatings).length > 0) {
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

      Object.entries(anamrezData.symptomRatings).forEach(([key, value]) => {
        const label = symptomLabels[key] || key;
        addText(`${label}: ${value}/10`);
      });
    }

    // System Questions
    addSectionHeader('SİSTEM SORULARI');
    if (anamrezData.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0) {
      anamrezData.selectedDiagnosisSystems.forEach((diagnosis) => {
        const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
        if (questionSet) {
          addText(`${questionSet.label}:`, 12, true);
          questionSet.questions.forEach((question) => {
            const rating = anamrezData.diagnosisResponses?.[diagnosis]?.[question] || 0;
            addText(`  • ${question}: ${rating}/10`);
          });
          yPosition += 5;
        }
      });
    }

    // Lifestyle Questions
    addSectionHeader('YAŞAM TARZI SORULARI');
    if (anamrezData.additionalQuestions) {
      const questionLabels: Record<string, string> = {
        'education': 'Eğitim Durumu', 'profession': 'Mesleği', 'exerciseFrequency': 'Spor Yapma Sıklığı',
        'dailySleepHours': 'Günlük Uyku Saati', 'monthlyVegetableConsumption': 'Aylık Sebze Tüketimi',
        'monthlyRedMeatConsumption': 'Aylık Kırmızı Et Tüketimi', 'monthlyChickenConsumption': 'Aylık Tavuk Eti Tüketimi',
        'dailyWaterConsumption': 'Günlük Su Tüketimi', 'smokingFrequency': 'Sigara İçme Sıklığı',
        'alcoholFrequency': 'Alkol Kullanma Sıklığı'
      };

      Object.entries(anamrezData.additionalQuestions).forEach(([key, value]) => {
        if (value) {
          const label = questionLabels[key] || key;
          addText(`${label}: ${value}`);
        }
      });
    }

    // Custom Questions
    if (anamrezData.customQuestions && anamrezData.customQuestions.length > 0) {
      addSectionHeader('EK SORULAR');
      anamrezData.customQuestions.forEach((customQ, index) => {
        addText(`${index + 1}. ${customQ.question}`);
        addText(`Cevap: ${customQ.answer}`);
        yPosition += 3;
      });
    }

    // Toxicity Assessment
    addSectionHeader('TOKSİSİTE DEĞERLENDİRMESİ');
    if (anamrezData.toxicityAssessment) {
      addText(`Toplam Puan: ${anamrezData.toxicityAssessment.totalScore || 0}`);
      addText(`Değerlendirilen Semptom Sayısı: ${anamrezData.toxicityAssessment.ratedSymptomsCount || 0}`);
      addText(`Yüksek Toksisite: ${anamrezData.toxicityAssessment.hasToxicity ? 'VAR' : 'YOK'}`);
      
      if (anamrezData.toxicityAssessment.toxicityScores && Object.keys(anamrezData.toxicityAssessment.toxicityScores).length > 0) {
        addText('Toksisite Semptom Puanları:', 12, true);
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
          'halsizlikYorgunluk': 'Halsizlik / Yorgunluk', 'yorgunUyanma': 'Yorgun Uyanma', 'basDOnmesi': 'Baş Dönmesi',
          'basAgrisi': 'Baş Ağrısı', 'mideAgisi': 'Mide Ağısı', 'mideYanmasi': 'Mide Yanması'
        };

        Object.entries(anamrezData.toxicityAssessment.toxicityScores).forEach(([key, value]) => {
          const label = symptomLabels[key] || key;
          addText(`  • ${label}: ${value}/10`);
        });
      }
    }

    // Conventional Treatment
    addSectionHeader('KONVANSİYONEL TIP TEDAVİSİ');
    addText(`Kullandığı İlaçlar: ${anamrezData.conventionalTreatment?.currentMedications || 'Belirtilmemiş'}`);
    addText(`Aldığı Diğer Tedaviler: ${anamrezData.conventionalTreatment?.otherTreatments || 'Belirtilmemiş'}`);

    // Completion Info
    addSectionHeader('TAMAMLANMA BİLGİLERİ');
    addText(`Tamamlayan: ${anamrezData.completedBy?.name} (${anamrezData.completedBy?.role})`);
    addText(`E-posta: ${anamrezData.completedBy?.email}`);
    addText(`Tarih: ${new Date(anamrezData.createdAt).toLocaleDateString('tr-TR')} ${new Date(anamrezData.createdAt).toLocaleTimeString('tr-TR')}`);

    // Save PDF with Turkish character-safe filename
    const safeName = convertTurkishForPDF(patient.fullName)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, ''); // Remove any other special characters
    
    const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    const fileName = `Anamnez_${safeName}_${dateStr}.pdf`;
    pdf.save(fileName);
  };

  useEffect(() => {
    const fetchAnamrezData = async () => {
      if (!patient || !isOpen) return;
      
      setLoading(true);
      try {
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patient.id)
        );
        const querySnapshot = await getDocs(anamrezQuery);
        
        if (!querySnapshot.empty) {
          const data = querySnapshot.docs[0].data() as AnamrezData;
          data.id = querySnapshot.docs[0].id;
          setAnamrezData(data);
        }
      } catch (error) {
        console.error('Anamnez verisi yüklenirken hata:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnamrezData();
  }, [patient, isOpen]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSection('patient-info');
      setAnamrezData(null);
    }
  }, [isOpen]);

  if (!isOpen || !patient) return null;

  const sections = [
    { id: 'patient-info', label: 'Hasta Bilgileri', icon: '👤' },
    { id: 'diagnosis', label: 'Tanı & Şikayet', icon: '🔍' },
    { id: 'medical-history', label: 'Tıbbi Geçmiş', icon: '📋' },
    { id: 'symptoms', label: 'Semptom Değerlendirmesi', icon: '📊' },
    { id: 'diagnosis-responses', label: 'Sistem Soruları', icon: '🩺' },
    { id: 'lifestyle', label: 'Yaşam Tarzı', icon: '🏃‍♂️' },
    { id: 'toxicity', label: 'Toksisite Değerlendirmesi', icon: '⚠️' },
    { id: 'treatment', label: 'Konvansiyonel Tedavi', icon: '💊' }
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-7xl w-full h-[85vh] overflow-hidden shadow-2xl anamnez-view-modal-content">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">📄 Anamnez Görüntüleme</h2>
                <p className="text-gray-600 mt-1">
                  Hasta: {patient.fullName} - TC: {patient.tcNo}
                </p>
                {patient.anamrezCompletedAt && (
                  <p className="text-green-600 text-sm mt-1">
                    ✅ Tamamlandı: {new Date(patient.anamrezCompletedAt).toLocaleDateString('tr-TR')} - {patient.anamrezCompletedBy}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* PDF Download Button */}
                {anamrezData && (
                  <button
                    onClick={generatePDF}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-md hover:shadow-lg"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 16L7 11L8.4 9.6L11 12.2V4H13V12.2L15.6 9.6L17 11L12 16Z" fill="currentColor"/>
                      <path d="M5 20V18H19V20H5Z" fill="currentColor"/>
                    </svg>
                    PDF Olarak İndir
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 transition-colors text-xl font-bold"
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
            <div className="flex" style={{height: 'calc(85vh - 120px)'}}>
              {/* Navigation Sidebar */}
              <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto flex-shrink-0">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Bölümler</h3>
                  <nav className="space-y-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => handleSectionChange(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-3 ${
                          activeSection === section.id
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                      >
                        <span className="text-base">{section.icon}</span>
                        {section.label}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-6" style={{maxHeight: 'calc(85vh - 120px)'}}>
                {anamrezData ? (
                  <>
                    {/* Patient Info Section */}
                    {activeSection === 'patient-info' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          👤 Hasta Bilgileri
                        </h3>
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <div className="md:col-span-2">
                              <label className="block text-gray-600 text-sm font-medium mb-2">Adres</label>
                              <div className="text-gray-900 font-semibold">{patient.address}</div>
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-gray-600 text-sm font-medium mb-2">Başvuru Nedeni</label>
                              <div className="text-gray-900 font-semibold">{patient.visitReason}</div>
                            </div>
                            {anamrezData.selectedDoctor && (
                              <div className="md:col-span-2">
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
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          🔍 Tanı & Şikayet
                        </h3>
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <h4 className="font-bold text-gray-800 mb-4">Seçilen Tanı Sistemleri</h4>
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
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <h4 className="font-bold text-gray-800 mb-4">Ana Şikayet</h4>
                          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {anamrezData.complaintDetails || 'Belirtilmemiş'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Medical History Section */}
                    {activeSection === 'medical-history' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          📋 Tıbbi Geçmiş
                        </h3>
                        
                        <div className="grid grid-cols-1 gap-6">
                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Hastalık Geçmişi</h4>
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.pastMedicalHistory || 'Belirtilmemiş'}
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Soy Geçmişi</h4>
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.familyHistory || 'Belirtilmemiş'}
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Ameliyat Geçmişi</h4>
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
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Alerjiler</h4>
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.allergies || 'Belirtilmemiş'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Symptoms Section */}
                    {activeSection === 'symptoms' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          📊 Semptom Değerlendirmesi
                        </h3>
                        
                        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {anamrezData.symptomRatings && Object.entries(anamrezData.symptomRatings).map(([key, value]) => {
                              // Convert symptom keys to readable labels
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
                                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                  <span className="text-gray-700 text-sm font-medium">
                                    {symptomLabels[key] || key}
                                  </span>
                                  <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    value <= 3
                                      ? 'bg-green-100 text-green-700'
                                      : value <= 6
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {value}/10
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Diagnosis Responses Section */}
                    {activeSection === 'diagnosis-responses' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          🩺 Sistem Soruları
                        </h3>
                        
                        {anamrezData.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0 ? (
                          anamrezData.selectedDiagnosisSystems.map((diagnosis) => {
                            const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
                            if (!questionSet) return null;

                            return (
                              <div key={diagnosis} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4">{questionSet.label}</h4>
                                <div className="grid grid-cols-1 gap-3">
                                  {questionSet.questions.map((question) => {
                                    // Get the rating from saved responses, default to 0 if not found
                                    const rating = anamrezData.diagnosisResponses?.[diagnosis]?.[question] || 0;
                                    
                                    return (
                                      <div key={question} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-gray-700 text-sm">{question}</span>
                                        <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                          rating === 0
                                            ? 'bg-gray-100 text-gray-600'
                                            : rating <= 3
                                            ? 'bg-green-100 text-green-700'
                                            : rating <= 6
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                          {rating}/10
                                        </div>
                                      </div>
                                    );
                                  })}
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
                            {anamrezData.additionalQuestions && Object.entries(anamrezData.additionalQuestions).map(([key, value]) => {
                              if (!value) return null;
                              
                              const questionLabels: Record<string, string> = {
                                'education': 'Eğitim Durumu',
                                'profession': 'Mesleği',
                                'exerciseFrequency': 'Spor Yapma Sıklığı',
                                'dailySleepHours': 'Günlük Uyku Saati',
                                'monthlyVegetableConsumption': 'Aylık Sebze Tüketimi',
                                'monthlyRedMeatConsumption': 'Aylık Kırmızı Et Tüketimi',
                                'monthlyChickenConsumption': 'Aylık Tavuk Eti Tüketimi',
                                'dailyWaterConsumption': 'Günlük Su Tüketimi',
                                'smokingFrequency': 'Sigara İçme Sıklığı',
                                'alcoholFrequency': 'Alkol Kullanma Sıklığı'
                              };
                              
                              return (
                                <div key={key}>
                                  <label className="block text-gray-600 text-sm font-medium mb-2">
                                    {questionLabels[key] || key}
                                  </label>
                                  <div className="text-gray-900 font-semibold">{value}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Custom Questions */}
                        {anamrezData.customQuestions && anamrezData.customQuestions.length > 0 && (
                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Ek Sorular</h4>
                            <div className="space-y-4">
                              {anamrezData.customQuestions.map((customQ, index) => (
                                <div key={customQ.id} className="border-l-4 border-orange-300 pl-4">
                                  <div className="font-medium text-gray-800 mb-2">
                                    {index + 1}. {customQ.question}
                                  </div>
                                  <div className="text-gray-700">{customQ.answer}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Toxicity Assessment Section */}
                    {activeSection === 'toxicity' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          ⚠️ Toksisite Değerlendirmesi
                        </h3>
                        
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
                                {Object.entries(anamrezData.toxicityAssessment.toxicityScores).map(([key, value]) => {
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
                                    <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                      <span className="text-gray-700 text-sm font-medium">
                                        {symptomLabels[key] || key}
                                      </span>
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
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
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
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.conventionalTreatment?.currentMedications || 'Belirtilmemiş'}
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Aldığı Diğer Tedaviler</h4>
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {anamrezData.conventionalTreatment?.otherTreatments || 'Belirtilmemiş'}
                            </div>
                          </div>
                        </div>
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
    </>
  );
};

export default AnamrezViewModal;