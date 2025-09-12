import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

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
  createdAt: string;
}

interface AnamrezFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  doctorProfile: any;
  onAnamrezCompleted: () => void;
}

const DIAGNOSIS_SYSTEMS = [
  'Dermatolojik Sistem',
  'Solunum Sistemi', 
  'Kas – İskelet Sistemi',
  'Santral Sinir Sistemi',
  'Gastrointestinal Sistem',
  'Kardiyovasküler Sistem',
  'Pisikolojik Değerlendirme',
  'Ürogental Sistem Hastalıkları',
  'Endokrin Sistem'
];

type SymptomKey = 
  | 'uykuHali' | 'gozdeUcusmalar' | 'carpinti' | 'siskinlik' | 'adetDuzensizligi' 
  | 'dengeKaybi' | 'yayginKasAgrisi' | 'nefesAlmadaGucluk' | 'ustume' | 'terleme' 
  | 'stres' | 'agriliAdet' | 'uykuDuzensizligi' | 'oksuruk' | 'balgam' 
  | 'kasilmaVeKramplar' | 'elAyakUyusmalari' | 'unutkanlik' | 'kasinti' | 'idrarKacirma' 
  | 'idrardaYanma' | 'geceIdraraKalkma' | 'kesikKesikIdrar' | 'kabizlik' | 'karindaGaz' 
  | 'belAgrisi' | 'ishal' | 'boyunAgrisi' | 'yayginOdem' | 'basur' | 'eklemAgrilari' 
  | 'algiBozuklugu' | 'halsizlikYorgunluk' | 'yorgunUyanma' | 'basDonmesi' | 'basAgrisi' 
  | 'mideAgisi' | 'mideYanmasi';

const SYMPTOM_QUESTIONS: { key: SymptomKey; label: string; note?: string }[] = [
  { key: 'uykuHali', label: 'Uyku Hali' },
  { key: 'gozdeUcusmalar', label: 'Gözde Uçuşmalar' },
  { key: 'carpinti', label: 'Çarpıntı' },
  { key: 'siskinlik', label: 'Şişkinlik' },
  { key: 'adetDuzensizligi', label: 'Adet Düzensizliği', note: '' },
  { key: 'dengeKaybi', label: 'Denge Kaybı' },
  { key: 'yayginKasAgrisi', label: 'Yaygın Kas Ağrısı' },
  { key: 'nefesAlmadaGucluk', label: 'Nefes Almada Güçlük' },
  { key: 'ustume', label: 'Üşüme' },
  { key: 'terleme', label: 'Terleme' },
  { key: 'stres', label: 'Stres', note: '' },
  { key: 'agriliAdet', label: 'Ağrılı Adet', note: '' },
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

const DIAGNOSIS_SPECIFIC_QUESTIONS: Record<string, { label: string; questions: string[] }> = {
  'Dermatolojik Sistem': {
    label: 'Dermatolojik Sistem',
    questions: [
      'Göz / Ciltte Kızarıklıklar ve Döküntü',
      'Alerji',
      'Saçlı Deride Kabuklanma',
      'Tırnaklarda Deformasyon'
    ]
  },
  'Solunum Sistemi': {
    label: 'Solunum Sistemi',
    questions: [
      'Tekrarlayan Akciğer Enfeksiyonu',
      'Ateş ve Huzursuzluk',
      'Dispne',
      'Kanlı Balgam',
      'Hırıltılı Solunum',
      'Alerjik Rinit',
      'Kronik Rinit',
      'Geniz Akıntısı',
      'Burun Akıntısı',
      'Burun Tıkanıklığı',
      'Gözlerde Sulanma / Kaşıntı',
      'Horlama',
      'Uykuda Nefes Düzensizliği (Uyku Aknesi)'
    ]
  },
  'Kas – İskelet Sistemi': {
    label: 'Kas – İskelet Sistemi',
    questions: [
      'Güçsüzlük',
      'Kas Ağrıları',
      'Eklem Ağrısı',
      'Eklem Hareket Kısıtlılığı',
      'Eklem Ödemi',
      'Eklem Şekil Bozukluğu',
      'Sabah Tutukluğu',
      'Uyuşma / Karıncalanma',
      'Kramplar'
    ]
  },
  'Santral Sinir Sistemi': {
    label: 'Santral Sinir Sistemi',
    questions: [
      'Güç Kaybı',
      'Yürüme Bozukluğu',
      'Konuşma Bozukluğu',
      'Uyuşma / Karıncalanma',
      'Kaba Motor Hareketlerinde Kısıtlılık',
      'İnce Motor Hareketlerinde Kısıtlılık',
      'Çiğneme Zorluğu',
      'Yutkunma Zorluğu',
      'Görme Kaybı',
      'İstemsiz Kasılma'
    ]
  },
  'Gastrointestinal Sistem': {
    label: 'Gastrointestinal Sistem',
    questions: [
      'Fissür',
      'Fistül',
      'Karın Ağrısı',
      'Bulantı / Kusma',
      'Mukuslu Dışkılama',
      'Kanamalı Dışkılama',
      'Ağız Kokusu',
      'Barsak Seslerinde Artma'
    ]
  },
  'Kardiyovasküler Sistem': {
    label: 'Kardiyovasküler Sistem',
    questions: [
      'Ritim Bozukluğu',
      'İyileşmeyen Yara ve Dokular',
      'Göğüs Ağrısı',
      'Yaygın Ödem'
    ]
  },
  'Pisikolojik Değerlendirme': {
    label: 'Pisikolojik Değerlendirme',
    questions: [
      'Evham',
      'Halüsinasyon',
      'İsteksizlik',
      'Yaygın Vücut Ağrıları',
      'Nefeste Zorlanma',
      'Tedirginlik Hali',
      'Uyku Bozukluğu',
      'Korku',
      'İç Sıkıntısı',
      'Takıntı',
      'Şüphe',
      'Hiperaktivite'
    ]
  },
  'Ürogental Sistem Hastalıkları': {
    label: 'Ürogental Sistem Hastalıkları',
    questions: [
      'Tekrarlayan Böbrek Taşı',
      'Tekrarlayan İdrar Yolu Enfeksiyonu',
      'Sık İdrara Çıkma',
      'İdrarda Azalma',
      'Gece Alt Islatma',
      'İdrarda Kanama',
      'İdrarda Çatallanma',
      'Renel Ağrı',
      'Genital Bölgede Ağrı ve Hassasiyet',
      'Genital Akıntı',
      'Adet Kanama Süresi',
      'Adet Kanama Yoğunluğu',
      'Genital Konu ve Kaşıntı',
      'Cinsel Aktivite Bozukluğu'
    ]
  },
  'Endokrin Sistem': {
    label: 'Endokrin Sistem',
    questions: [
      'Tüylenme Artışı',
      'Adet Kanama Süresi',
      'Adet Kanama Yoğunluğu',
      'Genital Konu ve Kaşıntı',
      'Tüylenme Bozukluğu (Sakal-Bıyık Gelişim Eksikliği, Tüylenme Eksikliği)',
      'Cinsel Aktivite Bozukluğu',
      'Saç Dökülmesi',
      'Meme Gelişim Geriliği'
    ]
  }
};

type SymptomRatings = Record<SymptomKey, number>;

const AnamrezFormModal: React.FC<AnamrezFormModalProps> = ({
  isOpen,
  onClose,
  patient,
  doctorProfile,
  onAnamrezCompleted
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    // Ana Şikayetler - Now array for multiple selections
    selectedDiagnosisSystems: [] as string[],
    
    // Şikayet Detayları
    complaintDetails: '',
    
    // Hastalık Geçmişi
    pastMedicalHistory: '',
    
    // Soy Geçmişi
    familyHistory: '',
    
    // Ameliyat Geçmişi
    hasSurgery: '', // 'var' or 'yok'
    surgicalHistory: '',
    
    // Alerji Durumu
    allergies: '',
    
    // Vital Signs
    vitalSigns: {
      bloodPressure: '',
      pulse: '',
      temperature: '',
      respiratoryRate: '',
      oxygenSaturation: '',
      weight: '',
      height: ''
    },
    
    // Sistem İncelemeleri
    systemsReview: {
      cardiovascular: '',
      respiratory: '',
      gastrointestinal: '',
      genitourinary: '',
      neurological: '',
      musculoskeletal: '',
      skin: ''
    },
    
    // Fizik Muayene
    physicalExamination: '',
    
    // Kullanılan İlaçlar
    medications: '',
    
    // Sosyal Geçmiş
    socialHistory: '',
    
    // Ek Notlar
    additionalNotes: '',
    
    // Symptom ratings (1-10 scale)
    symptomRatings: {
      uykuHali: 0,
      gozdeUcusmalar: 0,
      carpinti: 0,
      siskinlik: 0,
      adetDuzensizligi: 0,
      dengeKaybi: 0,
      yayginKasAgrisi: 0,
      nefesAlmadaGucluk: 0,
      ustume: 0,
      terleme: 0,
      stres: 0,
      agriliAdet: 0,
      uykuDuzensizligi: 0,
      oksuruk: 0,
      balgam: 0,
      kasilmaVeKramplar: 0,
      elAyakUyusmalari: 0,
      unutkanlik: 0,
      kasinti: 0,
      idrarKacirma: 0,
      idrardaYanma: 0,
      geceIdraraKalkma: 0,
      kesikKesikIdrar: 0,
      kabizlik: 0,
      karindaGaz: 0,
      belAgrisi: 0,
      ishal: 0,
      boyunAgrisi: 0,
      yayginOdem: 0,
      basur: 0,
      eklemAgrilari: 0,
      algiBozuklugu: 0,
      halsizlikYorgunluk: 0,
      yorgunUyanma: 0,
      basDonmesi: 0,
      basAgrisi: 0,
      mideAgisi: 0,
      mideYanmasi: 0
    } as SymptomRatings,
    
    // Diagnosis-specific questions responses (1-10 ratings)
    diagnosisResponses: {} as Record<string, Record<string, number>>,
    
    // Additional lifestyle and demographic questions
    additionalQuestions: {
      education: '',
      profession: '',
      exerciseFrequency: '',
      dailySleepHours: '',
      monthlyVegetableConsumption: '',
      monthlyRedMeatConsumption: '',
      monthlyChickenConsumption: '',
      dailyWaterConsumption: '',
      smokingFrequency: '',
      alcoholFrequency: ''
    },
    
    // Custom questions added by user
    customQuestions: [] as Array<{
      id: string;
      question: string;
      answer: string;
    }>,
    
    // Conventional medical treatment
    conventionalTreatment: {
      currentMedications: '',
      otherTreatments: ''
    }
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    if (name.startsWith('vitalSigns.')) {
      const vitalSign = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        vitalSigns: {
          ...prev.vitalSigns,
          [vitalSign]: value
        }
      }));
    } else if (name.startsWith('systemsReview.')) {
      const system = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        systemsReview: {
          ...prev.systemsReview,
          [system]: value
        }
      }));
    } else if (name.startsWith('additionalQuestions.')) {
      const question = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        additionalQuestions: {
          ...prev.additionalQuestions,
          [question]: value
        }
      }));
    } else if (name.startsWith('conventionalTreatment.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        conventionalTreatment: {
          ...prev.conventionalTreatment,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleDiagnosisSystemChange = (system: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      selectedDiagnosisSystems: checked
        ? [...prev.selectedDiagnosisSystems, system]
        : prev.selectedDiagnosisSystems.filter(s => s !== system)
    }));
    
    // Clear error when user makes selection
    if (errors.selectedDiagnosisSystems) {
      setErrors(prev => ({
        ...prev,
        selectedDiagnosisSystems: ''
      }));
    }
  };

  const handleSymptomRatingChange = (symptomKey: SymptomKey, rating: number) => {
    setFormData(prev => ({
      ...prev,
      symptomRatings: {
        ...prev.symptomRatings,
        [symptomKey]: rating
      }
    }));
  };

  const handleDiagnosisResponseChange = (diagnosis: string, question: string, rating: number) => {
    setFormData(prev => ({
      ...prev,
      diagnosisResponses: {
        ...prev.diagnosisResponses,
        [diagnosis]: {
          ...prev.diagnosisResponses[diagnosis],
          [question]: rating
        }
      }
    }));
  };

  const handleAddCustomQuestion = () => {
    const newQuestion = {
      id: Date.now().toString(),
      question: '',
      answer: ''
    };
    
    setFormData(prev => ({
      ...prev,
      customQuestions: [...prev.customQuestions, newQuestion]
    }));
  };

  const handleCustomQuestionChange = (id: string, field: 'question' | 'answer', value: string) => {
    setFormData(prev => ({
      ...prev,
      customQuestions: prev.customQuestions.map(q => 
        q.id === id ? { ...q, [field]: value } : q
      )
    }));
  };

  const handleRemoveCustomQuestion = (id: string) => {
    setFormData(prev => ({
      ...prev,
      customQuestions: prev.customQuestions.filter(q => q.id !== id)
    }));
  };

  const validateCurrentPage = () => {
    const newErrors: Record<string, string> = {};

    if (currentPage === 1) {
      // Page 1 validations
      if (formData.selectedDiagnosisSystems.length === 0) {
        newErrors.selectedDiagnosisSystems = 'En az bir tanı sistemi seçmelisiniz';
      }

      if (!formData.complaintDetails.trim()) {
        newErrors.complaintDetails = 'Şikayet detayları gereklidir';
      }

      // Surgery validation
      if (formData.hasSurgery === 'var' && !formData.surgicalHistory.trim()) {
        newErrors.surgicalHistory = 'Ameliyat detayları gereklidir';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Only validate fields that actually exist in the form
    if (formData.selectedDiagnosisSystems.length === 0) {
      newErrors.selectedDiagnosisSystems = 'En az bir tanı sistemi seçmelisiniz';
    }

    if (!formData.complaintDetails.trim()) {
      newErrors.complaintDetails = 'Şikayet detayları gereklidir';
    }

    // Surgery validation - only if surgery field is selected as 'var'
    if (formData.hasSurgery === 'var' && !formData.surgicalHistory.trim()) {
      newErrors.surgicalHistory = 'Ameliyat detayları gereklidir';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextPage = () => {
    if (validateCurrentPage()) {
      setCurrentPage(prev => prev + 1);
      // Scroll to top of modal
      const modal = document.querySelector('.anamnez-modal-content');
      if (modal) {
        modal.scrollTop = 0;
      }
    }
  };

  const handlePrevPage = (targetPage: number) => {
    setCurrentPage(targetPage);
    // Scroll to top of modal
    const modal = document.querySelector('.anamnez-modal-content');
    if (modal) {
      modal.scrollTop = 0;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submission started...');
    console.log('Patient:', patient);
    console.log('Form data:', formData);
    
    const validationResult = validateForm();
    console.log('Validation result:', validationResult);
    console.log('Errors:', errors);
    
    if (!validationResult || !patient) {
      console.log('Validation failed or no patient');
      return;
    }

    setLoading(true);
    try {
      // Create comprehensive anamnez record
      const anamrezData = {
        patientId: patient.id,
        patientName: patient.fullName,
        patientTcNo: patient.tcNo,
        patientPhone: patient.phone,
        patientBirthDate: patient.birthDate,
        patientGender: patient.gender,
        patientAddress: patient.address,
        clinicId: patient.clinicId,
        
        // Form data
        selectedDiagnosisSystems: formData.selectedDiagnosisSystems,
        complaintDetails: formData.complaintDetails,
        pastMedicalHistory: formData.pastMedicalHistory,
        familyHistory: formData.familyHistory,
        hasSurgery: formData.hasSurgery,
        surgicalHistory: formData.surgicalHistory,
        allergies: formData.allergies,
        vitalSigns: formData.vitalSigns,
        systemsReview: formData.systemsReview,
        physicalExamination: formData.physicalExamination,
        medications: formData.medications,
        socialHistory: formData.socialHistory,
        additionalNotes: formData.additionalNotes,
        symptomRatings: formData.symptomRatings,
        diagnosisResponses: formData.diagnosisResponses,
        additionalQuestions: formData.additionalQuestions,
        customQuestions: formData.customQuestions,
        conventionalTreatment: formData.conventionalTreatment,
        
        // Toxicity assessment calculation
        toxicityAssessment: (() => {
          const toxicityMapping = {
            'halsizlikYorgunluk': 'Halsizlik / Yorgunluk',
            'dengeKaybi': 'Denge Kaybı', 
            'unutkanlik': 'Unutkanlık',
            'kasinti': 'Kaşıntı',
            'carpinti': 'Çarpıntı',
            'uykuDuzensizligi': 'Uyku Nefes Düzensizliği (Aknesi)',
            'gozdeUcusmalar': 'Gözde Uçuşmalar',
            'oksuruk': 'Horlama',
            'yorgunUyanma': 'Yorgun Uyanma',
            'kabizlik': 'Kabızlık'
          };
          
          let totalScore = 0;
          let ratedSymptomsCount = 0;
          const toxicityScores: Record<string, number> = {};
          
          Object.keys(toxicityMapping).forEach(key => {
            const rating = formData.symptomRatings[key as keyof SymptomRatings] || 0;
            totalScore += rating;
            toxicityScores[key] = rating;
            if (rating > 0) {
              ratedSymptomsCount++;
            }
          });
          
          return {
            totalScore,
            ratedSymptomsCount,
            hasToxicity: ratedSymptomsCount >= 5,
            toxicityScores,
            toxicityMapping
          };
        })(),
        
        // Metadata
        completedBy: {
          id: doctorProfile?.uid || '',
          name: doctorProfile?.fullName || '',
          role: doctorProfile?.userType || '',
          email: doctorProfile?.email || ''
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save anamnez record to separate collection
      await addDoc(collection(db, 'anamrezRecords'), anamrezData);
      
      // Update patient's anamnez completion status
      const patientRef = doc(db, 'patients', patient.id);
      await updateDoc(patientRef, {
        isAnamnezCompleted: true,
        anamrezCompletedAt: new Date().toISOString(),
        anamrezCompletedBy: doctorProfile?.fullName || '',
        updatedAt: new Date().toISOString()
      });

      // Show success toast
      setShowSuccessToast(true);
      
      // Hide toast after 3 seconds and close modal
      setTimeout(() => {
        setShowSuccessToast(false);
        onAnamrezCompleted();
        onClose();
      }, 3000);
      
      // Reset form
      setFormData({
        selectedDiagnosisSystems: [],
        complaintDetails: '',
        pastMedicalHistory: '',
        familyHistory: '',
        hasSurgery: '',
        surgicalHistory: '',
        allergies: '',
        vitalSigns: {
          bloodPressure: '',
          pulse: '',
          temperature: '',
          respiratoryRate: '',
          oxygenSaturation: '',
          weight: '',
          height: ''
        },
        systemsReview: {
          cardiovascular: '',
          respiratory: '',
          gastrointestinal: '',
          genitourinary: '',
          neurological: '',
          musculoskeletal: '',
          skin: ''
        },
        physicalExamination: '',
        medications: '',
        socialHistory: '',
        additionalNotes: '',
        symptomRatings: {
          uykuHali: 0,
          gozdeUcusmalar: 0,
          carpinti: 0,
          siskinlik: 0,
          adetDuzensizligi: 0,
          dengeKaybi: 0,
          yayginKasAgrisi: 0,
          nefesAlmadaGucluk: 0,
          ustume: 0,
          terleme: 0,
          stres: 0,
          agriliAdet: 0,
          uykuDuzensizligi: 0,
          oksuruk: 0,
          balgam: 0,
          kasilmaVeKramplar: 0,
          elAyakUyusmalari: 0,
          unutkanlik: 0,
          kasinti: 0,
          idrarKacirma: 0,
          idrardaYanma: 0,
          geceIdraraKalkma: 0,
          kesikKesikIdrar: 0,
          kabizlik: 0,
          karindaGaz: 0,
          belAgrisi: 0,
          ishal: 0,
          boyunAgrisi: 0,
          yayginOdem: 0,
          basur: 0,
          eklemAgrilari: 0,
          algiBozuklugu: 0,
          halsizlikYorgunluk: 0,
          yorgunUyanma: 0,
          basDonmesi: 0,
          basAgrisi: 0,
          mideAgisi: 0,
          mideYanmasi: 0
        } as SymptomRatings,
        diagnosisResponses: {} as Record<string, Record<string, number>>,
        additionalQuestions: {
          education: '',
          profession: '',
          exerciseFrequency: '',
          dailySleepHours: '',
          monthlyVegetableConsumption: '',
          monthlyRedMeatConsumption: '',
          monthlyChickenConsumption: '',
          dailyWaterConsumption: '',
          smokingFrequency: '',
          alcoholFrequency: ''
        },
        customQuestions: [],
        conventionalTreatment: {
          currentMedications: '',
          otherTreatments: ''
        }
      });
    } catch (error) {
      console.error('Anamnez kaydedilirken hata oluştu:', error);
      alert('Anamnez kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  };

  // Reset to first page when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
    }
  }, [isOpen]);

  if (!isOpen || !patient) return null;

  return (
    <>
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-[60] animate-in slide-in-from-top-2 duration-300">
          <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <div className="text-2xl">✅</div>
            <div>
              <h4 className="font-bold">Başarılı!</h4>
              <p className="text-sm opacity-90">Anamnez başarıyla kaydedildi.</p>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto shadow-2xl anamnez-modal-content">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">📝 Anamnez Formu</h2>
              <p className="text-gray-600 mt-1">
                Hasta: {patient.fullName} - TC: {patient.tcNo}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8 bg-white">
          
          {/* Page Navigation */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                1
              </div>
              <div className="w-8 h-1 bg-gray-300 rounded"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                2
              </div>
              <div className="w-8 h-1 bg-gray-300 rounded"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                3
              </div>
              <div className="w-8 h-1 bg-gray-300 rounded"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                4
              </div>
              <div className="w-8 h-1 bg-gray-300 rounded"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 5 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                5
              </div>
              <div className="w-8 h-1 bg-gray-300 rounded"></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                currentPage === 6 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                6
              </div>
            </div>
          </div>

          {currentPage === 1 && (
            <>
              {/* Tanı Sistemleri */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              🔍 Tanı
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-4">
                Hastalık seçiniz *
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {DIAGNOSIS_SYSTEMS.map((system) => (
                  <div key={system} className="flex items-center">
                    <input
                      type="checkbox"
                      id={system}
                      checked={formData.selectedDiagnosisSystems.includes(system)}
                      onChange={(e) => handleDiagnosisSystemChange(system, e.target.checked)}
                      className="w-4 h-4 text-red-600 bg-white border-gray-300 rounded focus:ring-red-500 focus:ring-2"
                    />
                    <label
                      htmlFor={system}
                      className="ml-2 text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      {system}
                    </label>
                  </div>
                ))}
              </div>
              
              {formData.selectedDiagnosisSystems.length > 0 && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg">
                  <p className="text-sm font-medium text-red-800">Seçilen Sistem(ler):</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.selectedDiagnosisSystems.map((system) => (
                      <span
                        key={system}
                        className="px-2 py-1 bg-red-200 text-red-800 rounded-full text-xs"
                      >
                        {system}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {errors.selectedDiagnosisSystems && (
                <p className="text-red-500 text-sm mt-2">{errors.selectedDiagnosisSystems}</p>
              )}
            </div>
          </div>

          {/* Şikayet */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              💭 Şikayet
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Ana şikayet *
              </label>
              <textarea
                name="complaintDetails"
                value={formData.complaintDetails}
                onChange={handleInputChange}
                rows={4}
                className={`w-full px-4 py-3 bg-white border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                  errors.complaintDetails ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Hastanın şikayetlerini detaylı olarak yazınız..."
              />
              {errors.complaintDetails && (
                <p className="text-red-500 text-sm mt-1">{errors.complaintDetails}</p>
              )}
            </div>
          </div>

          {/* Hastalık Geçmişi */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              📋 Hastalık geçmişi
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Hastalık geçmişini yazınız.
              </label>
              <textarea
                name="pastMedicalHistory"
                value={formData.pastMedicalHistory}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Hastanın geçmiş hastalıklarını yazınız..."
              />
            </div>
          </div>

          {/* Soy Geçmişi */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              👨‍👩‍👧‍👦 Soy geçmişi
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Aile hastalık geçmini yazınız.
              </label>
              <textarea
                name="familyHistory"
                value={formData.familyHistory}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Aile hastalık geçmişini yazınız..."
              />
            </div>
          </div>

          {/* Ameliyat */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              🏥 Ameliyat
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-4">
                Ameliyat geçmişi
              </label>
              
              {/* Radio Buttons */}
              <div className="flex gap-6 mb-4">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="surgery-var"
                    name="hasSurgery"
                    value="var"
                    checked={formData.hasSurgery === 'var'}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-red-600 bg-white border-gray-300 focus:ring-red-500 focus:ring-2"
                  />
                  <label
                    htmlFor="surgery-var"
                    className="ml-2 text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Var
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="surgery-yok"
                    name="hasSurgery"
                    value="yok"
                    checked={formData.hasSurgery === 'yok'}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-red-600 bg-white border-gray-300 focus:ring-red-500 focus:ring-2"
                  />
                  <label
                    htmlFor="surgery-yok"
                    className="ml-2 text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Yok
                  </label>
                </div>
              </div>

              {/* Conditional Surgery Details */}
              {formData.hasSurgery === 'var' && (
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Ameliyat detaylarını yazınız *
                  </label>
                  <textarea
                    name="surgicalHistory"
                    value={formData.surgicalHistory}
                    onChange={handleInputChange}
                    rows={3}
                    className={`w-full px-4 py-3 bg-white border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                      errors.surgicalHistory ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Hangi ameliyatlar geçirildi, ne zaman yapıldı, komplikasyonlar var mı..."
                  />
                  {errors.surgicalHistory && (
                    <p className="text-red-500 text-sm mt-1">{errors.surgicalHistory}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Alerji Durumu */}
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
              ⚠️ Alerji Durumu
            </h3>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Alerjiler
              </label>
              <textarea
                name="allergies"
                value={formData.allergies}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Bilinen alerjileri yazınız..."
              />
            </div>
          </div>
            </>
          )}

          {currentPage === 2 && (
            <>
          {/* Symptom Rating Questions */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
            <h3 className="text-xl font-bold text-purple-700 mb-6 flex items-center gap-2">
              📊 Semptom Değerlendirmesi
            </h3>
            <p className="text-gray-600 mb-6 text-sm">
              Aşağıdaki semptomları 1-10 arasında değerlendirin (1 = Hiç yok, 10 = Çok şiddetli)
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {SYMPTOM_QUESTIONS.map((symptom, index) => {
                // Skip female-only questions for male patients
                if (patient?.gender === 'Erkek' && 
                    (symptom.key === 'adetDuzensizligi' || symptom.key === 'agriliAdet')) {
                  return null;
                }
                
                return (
                  <div key={symptom.key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-800 text-sm">
                          {index + 1}. {symptom.label}
                        </h4>
                        {symptom.note && (
                          <p className="text-xs text-green-600 mt-1">{symptom.note}</p>
                        )}
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                        formData.symptomRatings[symptom.key] === 0 
                          ? 'bg-gray-100 text-gray-500' 
                          : formData.symptomRatings[symptom.key] <= 3
                          ? 'bg-green-100 text-green-700'
                          : formData.symptomRatings[symptom.key] <= 6
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {formData.symptomRatings[symptom.key] || '0'}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Hiç yok</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => handleSymptomRatingChange(symptom.key, rating)}
                            className={`w-8 h-8 rounded-full text-xs font-semibold transition-all duration-200 ${
                              formData.symptomRatings[symptom.key] === rating
                                ? rating <= 3
                                  ? 'bg-green-500 text-white shadow-lg scale-110'
                                  : rating <= 6
                                  ? 'bg-yellow-500 text-white shadow-lg scale-110'
                                  : 'bg-red-500 text-white shadow-lg scale-110'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:scale-105'
                            }`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">Çok şiddetli</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            </>
          )}

          {currentPage === 3 && (
            <>
          {/* Diagnosis-Specific Questions */}
          <div className="space-y-6">
            {formData.selectedDiagnosisSystems.length === 0 ? (
              <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200 text-center">
                <div className="text-yellow-600 text-lg mb-2">⚠️</div>
                <h3 className="text-lg font-semibold text-yellow-700 mb-2">Tanı Seçimi Gerekli</h3>
                <p className="text-yellow-600">
                  Belirli sorular için önce 1. sayfadan en az bir tanı sistemi seçmelisiniz.
                </p>
              </div>
            ) : (
              formData.selectedDiagnosisSystems.map((diagnosis) => {
                const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
                if (!questionSet) return null;

                return (
                  <div key={diagnosis} className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-6 border border-teal-200">
                    <h3 className="text-xl font-bold text-teal-700 mb-4 flex items-center gap-2">
                      🩺 {questionSet.label}
                    </h3>
                    <p className="text-gray-600 mb-4 text-sm">
                      Bu sistem ile ilgili semptomları 1-10 arasında değerlendirin
                    </p>
                    
                    <div className="space-y-4">
                      {questionSet.questions.map((question, index) => {
                        // Skip gender-specific questions
                        if (patient?.gender === 'Erkek' && question.includes('Kadınlarda')) {
                          return null;
                        }
                        if (patient?.gender === 'Kadın' && question.includes('Erkeklerde')) {
                          return null;
                        }

                        const currentRating = formData.diagnosisResponses[diagnosis]?.[question] || 0;

                        return (
                          <div key={question} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-semibold text-gray-800 text-sm">
                                  {index + 1}. {question}
                                </h4>
                              </div>
                              <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                currentRating === 0 
                                  ? 'bg-gray-100 text-gray-500' 
                                  : currentRating <= 3
                                  ? 'bg-green-100 text-green-700'
                                  : currentRating <= 6
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {currentRating || '0'}
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Hiç yok</span>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                                  <button
                                    key={rating}
                                    type="button"
                                    onClick={() => handleDiagnosisResponseChange(diagnosis, question, rating)}
                                    className={`w-8 h-8 rounded-full text-xs font-semibold transition-all duration-200 ${
                                      currentRating === rating
                                        ? rating <= 3
                                          ? 'bg-green-500 text-white shadow-lg scale-110'
                                          : rating <= 6
                                          ? 'bg-yellow-500 text-white shadow-lg scale-110'
                                          : 'bg-red-500 text-white shadow-lg scale-110'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:scale-105'
                                    }`}
                                  >
                                    {rating}
                                  </button>
                                ))}
                              </div>
                              <span className="text-xs text-gray-500">Çok şiddetli</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
            </>
          )}

          {currentPage === 4 && (
            <>
              {/* Additional Questions */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200">
                <h3 className="text-xl font-bold text-orange-700 mb-6 flex items-center gap-2">
                  📋 Ek Sorular
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      1. Eğitim Durumu
                    </label>
                    <select
                      name="additionalQuestions.education"
                      value={formData.additionalQuestions.education}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="İlkokul">İlkokul</option>
                      <option value="Ortaokul">Ortaokul</option>
                      <option value="Lise">Lise</option>
                      <option value="Ön Lisans">Ön Lisans</option>
                      <option value="Lisans">Lisans</option>
                      <option value="Yüksek Lisans">Yüksek Lisans</option>
                      <option value="Doktora">Doktora</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      2. Mesleği
                    </label>
                    <input
                      type="text"
                      name="additionalQuestions.profession"
                      value={formData.additionalQuestions.profession}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="Mesleğinizi yazınız"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      3. Spor Yapma Sıklığı
                    </label>
                    <select
                      name="additionalQuestions.exerciseFrequency"
                      value={formData.additionalQuestions.exerciseFrequency}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Hiç">Hiç</option>
                      <option value="Haftada 1-2 kez">Haftada 1-2 kez</option>
                      <option value="Haftada 3-4 kez">Haftada 3-4 kez</option>
                      <option value="Haftada 5-6 kez">Haftada 5-6 kez</option>
                      <option value="Her gün">Her gün</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      4. Günlük Uyku Saati
                    </label>
                    <select
                      name="additionalQuestions.dailySleepHours"
                      value={formData.additionalQuestions.dailySleepHours}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="4 saatten az">4 saatten az</option>
                      <option value="4-5 saat">4-5 saat</option>
                      <option value="6-7 saat">6-7 saat</option>
                      <option value="8-9 saat">8-9 saat</option>
                      <option value="10 saatten fazla">10 saatten fazla</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      5. Aylık Sebze Tüketimi
                    </label>
                    <select
                      name="additionalQuestions.monthlyVegetableConsumption"
                      value={formData.additionalQuestions.monthlyVegetableConsumption}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Çok az (0-5 kez)">Çok az (0-5 kez)</option>
                      <option value="Az (6-15 kez)">Az (6-15 kez)</option>
                      <option value="Orta (16-25 kez)">Orta (16-25 kez)</option>
                      <option value="Çok (26+ kez)">Çok (26+ kez)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      6. Aylık Kırmızı Et Tüketimi
                    </label>
                    <select
                      name="additionalQuestions.monthlyRedMeatConsumption"
                      value={formData.additionalQuestions.monthlyRedMeatConsumption}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Hiç">Hiç</option>
                      <option value="Çok az (1-3 kez)">Çok az (1-3 kez)</option>
                      <option value="Az (4-8 kez)">Az (4-8 kez)</option>
                      <option value="Orta (9-15 kez)">Orta (9-15 kez)</option>
                      <option value="Çok (16+ kez)">Çok (16+ kez)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      7. Aylık Tavuk Eti Tüketimi
                    </label>
                    <select
                      name="additionalQuestions.monthlyChickenConsumption"
                      value={formData.additionalQuestions.monthlyChickenConsumption}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Hiç">Hiç</option>
                      <option value="Çok az (1-3 kez)">Çok az (1-3 kez)</option>
                      <option value="Az (4-8 kez)">Az (4-8 kez)</option>
                      <option value="Orta (9-15 kez)">Orta (9-15 kez)</option>
                      <option value="Çok (16+ kez)">Çok (16+ kez)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      8. Günlük Su Tüketimi
                    </label>
                    <select
                      name="additionalQuestions.dailyWaterConsumption"
                      value={formData.additionalQuestions.dailyWaterConsumption}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="1 litreden az">1 litreden az</option>
                      <option value="1-2 litre">1-2 litre</option>
                      <option value="2-3 litre">2-3 litre</option>
                      <option value="3 litreden fazla">3 litreden fazla</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      9. Sigara İçme Sıklığı
                    </label>
                    <select
                      name="additionalQuestions.smokingFrequency"
                      value={formData.additionalQuestions.smokingFrequency}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Hiç">Hiç</option>
                      <option value="Bıraktım">Bıraktım</option>
                      <option value="Günde 1-5 adet">Günde 1-5 adet</option>
                      <option value="Günde 6-15 adet">Günde 6-15 adet</option>
                      <option value="Günde 16-25 adet">Günde 16-25 adet</option>
                      <option value="Günde 25+ adet">Günde 25+ adet</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      10. Alkol Kullanma Sıklığı
                    </label>
                    <select
                      name="additionalQuestions.alcoholFrequency"
                      value={formData.additionalQuestions.alcoholFrequency}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seçiniz</option>
                      <option value="Hiç">Hiç</option>
                      <option value="Ayda 1-2 kez">Ayda 1-2 kez</option>
                      <option value="Haftada 1-2 kez">Haftada 1-2 kez</option>
                      <option value="Haftada 3-5 kez">Haftada 3-5 kez</option>
                      <option value="Her gün">Her gün</option>
                    </select>
                  </div>
                  
                  {/* Custom Questions */}
                  {formData.customQuestions.map((customQ, index) => (
                    <div key={customQ.id} className="md:col-span-2">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-3">
                            <div>
                              <label className="block text-gray-700 text-sm font-medium mb-2">
                                {11 + index}. Soru
                              </label>
                              <input
                                type="text"
                                value={customQ.question}
                                onChange={(e) => handleCustomQuestionChange(customQ.id, 'question', e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                placeholder="Sorunuzu yazınız"
                              />
                            </div>
                            <div>
                              <label className="block text-gray-700 text-sm font-medium mb-2">
                                Cevap
                              </label>
                              <input
                                type="text"
                                value={customQ.answer}
                                onChange={(e) => handleCustomQuestionChange(customQ.id, 'answer', e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                placeholder="Cevabı yazınız"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomQuestion(customQ.id)}
                            className="text-red-500 hover:text-red-700 transition-colors mt-8"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add Custom Question Button */}
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddCustomQuestion}
                      className="w-full px-4 py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 hover:border-orange-400 hover:text-orange-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Yeni Soru Ekle
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentPage === 5 && (
            <>
              {/* Toxicity Assessment */}
              <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-xl p-6 border border-red-200">
                <h3 className="text-xl font-bold text-red-700 mb-6 flex items-center gap-2">
                  ⚠️ Yüksek Toksisite Değerlendirmesi
                </h3>
                
                {(() => {
                  // Toxicity calculation mapping
                  const toxicityMapping = {
                    'halsizlikYorgunluk': 'Halsizlik / Yorgunluk',
                    'dengeKaybi': 'Denge Kaybı', 
                    'unutkanlik': 'Unutkanlık',
                    'kasinti': 'Kaşıntı',
                    'carpinti': 'Çarpıntı',
                    'uykuDuzensizligi': 'Uyku Nefes Düzensizliği (Aknesi)',
                    'gozdeUcusmalar': 'Gözde Uçuşmalar',
                    'oksuruk': 'Horlama',
                    'yorgunUyanma': 'Yorgun Uyanma',
                    'kabizlik': 'Kabızlık'
                  };
                  
                  // Calculate total toxicity score and count rated symptoms
                  let totalScore = 0;
                  let ratedSymptomsCount = 0;
                  Object.keys(toxicityMapping).forEach(key => {
                    const rating = formData.symptomRatings[key as keyof SymptomRatings] || 0;
                    totalScore += rating;
                    if (rating > 0) {
                      ratedSymptomsCount++;
                    }
                  });
                  
                  const hasToxicity = ratedSymptomsCount >= 5; // At least 5 symptoms rated
                  
                  return (
                    <div className="space-y-6">
                      {/* Toxicity Criteria Table */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="bg-red-100 px-6 py-4 border-b border-gray-200">
                          <h4 className="font-bold text-red-800">Toksisite Hesaplama Kriteri</h4>
                        </div>
                        
                        <div className="space-y-4 p-6">
                          {Object.entries(toxicityMapping).map(([key, label], index) => {
                            const rating = formData.symptomRatings[key as keyof SymptomRatings] || 0;
                            return (
                              <div key={key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center">
                                      {index + 1}
                                    </span>
                                    <span className="text-gray-800 font-medium">{label}</span>
                                  </div>
                                  <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    rating === 0 
                                      ? 'bg-gray-100 text-gray-500' 
                                      : rating <= 3
                                      ? 'bg-green-100 text-green-700'
                                      : rating <= 6
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {rating || '0'}
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Hiç yok</span>
                                  <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ratingValue) => (
                                      <button
                                        key={ratingValue}
                                        type="button"
                                        onClick={() => {
                                          // Toggle: if same rating clicked, unselect (set to 0), otherwise set new rating
                                          const newRating = rating === ratingValue ? 0 : ratingValue;
                                          handleSymptomRatingChange(key as keyof SymptomRatings, newRating);
                                        }}
                                        className={`w-8 h-8 rounded-full text-xs font-semibold transition-all duration-200 ${
                                          rating === ratingValue
                                            ? ratingValue <= 3
                                              ? 'bg-green-500 text-white shadow-lg scale-110'
                                              : ratingValue <= 6
                                              ? 'bg-yellow-500 text-white shadow-lg scale-110'
                                              : 'bg-red-500 text-white shadow-lg scale-110'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:scale-105'
                                        }`}
                                      >
                                        {ratingValue}
                                      </button>
                                    ))}
                                  </div>
                                  <span className="text-xs text-gray-500">Çok şiddetli</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      {/* Toxicity Result */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                          {/* Left Column - Status */}
                          <div className="p-6 text-center">
                            <h4 className="text-lg font-bold text-gray-800 mb-4">Yüksek Toksisite</h4>
                            <div className={`text-4xl font-bold mb-2 ${
                              hasToxicity ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {hasToxicity ? 'Var' : 'Yok'}
                            </div>
                            {hasToxicity && (
                              <div className="text-sm text-gray-600">
                                *{ratedSymptomsCount} semptomu değerlendirdiniz. 5 veya daha fazla semptom varsa "Var" olarak gösterilir.
                              </div>
                            )}
                          </div>
                          
                          {/* Right Column - Score (only if toxic) */}
                          <div className={`p-6 text-center ${
                            hasToxicity ? 'bg-blue-50' : 'bg-gray-50'
                          }`}>
                            <h4 className="text-lg font-bold text-blue-800 mb-2">Toksisite Değeri</h4>
                            {hasToxicity ? (
                              <>
                                <div className="text-sm text-blue-600 mb-2">
                                  * Seçilenlerin Toplam değeri
                                </div>
                                <div className="text-6xl font-bold text-blue-600 mb-2">
                                  {totalScore}
                                </div>
                              </>
                            ) : (
                              <div className="text-2xl text-gray-400 font-semibold">
                                -
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* {hasToxicity && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <div className="text-yellow-600 text-xl">⚡</div>
                            <div>
                              <h5 className="font-semibold text-yellow-800 mb-1">Detoks Protokolü Önerisi</h5>
                              <p className="text-yellow-700 text-sm">
                                Yüksek toksisite tespit edilmiştir. Doktor ekranında bir basamak olacak şekilde yer almalıdır. 
                                Burada verilen rakamların toplamı orada yer almalıdır.
                              </p>
                            </div>
                          </div>
                        </div>
                      )} */}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {currentPage === 6 && (
            <>
              {/* Conventional Medical Treatment */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-200">
                <h3 className="text-xl font-bold text-indigo-700 mb-6 flex items-center gap-2">
                  🏥 Hastanın Rahatsızlığına İlişkin Konvansiyonel Tıp Tedavisi
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column - Current Medications */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-800 mb-4">Kullandığı İlaçlar</h4>
                    <p className="text-sm text-red-600 mb-4">
                      (Hastanın konvansiyonel tıpça önerdiği ilaçlar ve kullanım oranları yazılacak.)
                    </p>
                    <textarea
                      name="conventionalTreatment.currentMedications"
                      value={formData.conventionalTreatment.currentMedications}
                      onChange={handleInputChange}
                      rows={8}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      placeholder="Hastanın kullandığı ilaçları ve dozlarını detaylı olarak yazınız..."
                    />
                  </div>
                  
                  {/* Right Column - Other Treatments */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-800 mb-4">Almış Olduğu Diğer Tedaviler</h4>
                    <p className="text-sm text-red-600 mb-4">
                      (Hastanın konvansiyonel tıpça önerdiği tedaviler ve periyodları yazılacak.)
                    </p>
                    <textarea
                      name="conventionalTreatment.otherTreatments"
                      value={formData.conventionalTreatment.otherTreatments}
                      onChange={handleInputChange}
                      rows={8}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      placeholder="Hastanın aldığı diğer tedavileri detaylı olarak yazınız..."
                    />
                  </div>
                </div>
                
                {/* PDF Upload Section */}
                <div className="mt-6 bg-white rounded-xl p-6 border border-gray-200">
                  <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    📄 Cihaz Taraması
                  </h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Cihaz taraması her hasta için yapılacak ve tarama sonucu PDF olarak doğrudan veri tabanına yüklenecektir.
                  </p>
                  
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50">
                    <div className="text-gray-400 text-4xl mb-4">📋</div>
                    <h5 className="text-lg font-semibold text-gray-700 mb-2">PDF Yükleme</h5>
                    <p className="text-gray-500 mb-4">Dosya yükleme özelliği yakında...</p>
                    <button
                      type="button"
                      disabled
                      className="px-6 py-3 bg-gray-200 text-gray-500 rounded-xl cursor-not-allowed"
                    >
                      Dosya Seç (Yakında)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-4 pt-6 border-t border-gray-200 sticky bottom-0 bg-white z-10">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 font-semibold transition-all duration-200"
              >
                İptal
              </button>
              
              {currentPage === 2 && (
                <button
                  type="button"
                  onClick={() => handlePrevPage(1)}
                  className="px-6 py-3 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 font-semibold transition-all duration-200"
                >
                  ← Geri
                </button>
              )}
              
              {currentPage === 3 && (
                <button
                  type="button"
                  onClick={() => handlePrevPage(2)}
                  className="px-6 py-3 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 font-semibold transition-all duration-200"
                >
                  ← Geri
                </button>
              )}
              
              {currentPage === 4 && (
                <button
                  type="button"
                  onClick={() => handlePrevPage(3)}
                  className="px-6 py-3 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 font-semibold transition-all duration-200"
                >
                  ← Geri
                </button>
              )}
              
              {currentPage === 5 && (
                <button
                  type="button"
                  onClick={() => handlePrevPage(4)}
                  className="px-6 py-3 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 font-semibold transition-all duration-200"
                >
                  ← Geri
                </button>
              )}
              
              {currentPage === 6 && (
                <button
                  type="button"
                  onClick={() => handlePrevPage(5)}
                  className="px-6 py-3 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl text-blue-700 font-semibold transition-all duration-200"
                >
                  ← Geri
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              {currentPage === 1 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  İleri →
                </button>
              )}
              
              {currentPage === 2 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  İleri →
                </button>
              )}
              
              {currentPage === 3 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  İleri →
                </button>
              )}
              
              {currentPage === 4 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  İleri →
                </button>
              )}
              
              {currentPage === 5 && (
                <button
                  type="button"
                  onClick={handleNextPage}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  İleri →
                </button>
              )}
              
              {currentPage === 6 && (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
                >
                  {loading ? 'Kaydediliyor...' : 'Anamnez Kaydet'}
                </button>
              )}
            </div>
          </div>
        </form>
        </div>
      </div>
    </>
  );
};

export default AnamrezFormModal;