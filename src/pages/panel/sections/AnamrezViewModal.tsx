import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { DIAGNOSIS_SPECIFIC_QUESTIONS } from '../../../constants';

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
  patient,
  anamrezRecord
}) => {
  const [anamrezData, setAnamrezData] = useState<AnamrezData | null>(null);
  const [allAnamrezRecords, setAllAnamrezRecords] = useState<AnamrezData[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState<any>(null);
  const [activeSection, setActiveSection] = useState('patient-info');

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
      ? `<div style="text-align: center; margin-bottom: 30px;"><img src="${doctorProfile.logoUrl}" style="max-height: 100px; max-width: 100%; object-fit: contain;" /></div>` 
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
          <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Semptom</th>
          ${sortedRecords.map(record => `
            <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; min-width: 80px;">
              ${formatDate(record.createdAt)}
            </th>
          `).join('')}
        </tr>
      `;

      const dataRows = Array.from(allSymptomKeys).map(key => {
        const label = symptomLabels[key] || key;
        return `
          <tr>
            <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 500;">${label}</td>
            ${sortedRecords.map(record => {
              const value = record.symptomRatings?.[key] || 0;
              const bgColor = value <= 3 ? '#f0fff4' : value <= 6 ? '#fffaf0' : '#fff5f5';
              const textColor = value <= 3 ? '#276749' : value <= 6 ? '#9c4221' : '#c53030';
              return `
                <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor}; font-weight: bold;">
                  ${value}/10
                </td>
              `;
            }).join('')}
          </tr>
        `;
      }).join('');

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px;">
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
          <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Toksisite Parametresi</th>
          ${sortedRecords.map(record => `
            <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; min-width: 80px;">
              ${formatDate(record.createdAt)}
            </th>
          `).join('')}
        </tr>
      `;

      const dataRows = toxicityKeys.map(key => {
        const label = symptomLabels[key] || key;
        return `
          <tr>
            <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 500;">${label}</td>
            ${sortedRecords.map(record => {
              const value = record.toxicityAssessment?.toxicityScores?.[key] || 0;
              const bgColor = value <= 3 ? '#f0fff4' : value <= 6 ? '#fffaf0' : '#fff5f5';
              const textColor = value <= 3 ? '#276749' : value <= 6 ? '#9c4221' : '#c53030';
              return `
                <td style="padding: 6px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor}; font-weight: bold;">
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
          <td style="padding: 8px; border: 1px solid #e2e8f0;">TOPLAM PUAN</td>
          ${sortedRecords.map(record => {
            const total = record.toxicityAssessment?.totalScore || 0;
            const hasToxicity = record.toxicityAssessment?.hasToxicity;
            const bgColor = hasToxicity ? '#fff5f5' : '#f0fff4';
            const textColor = hasToxicity ? '#c53030' : '#276749';
            return `
              <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; background: ${bgColor}; color: ${textColor};">
                ${total}
              </td>
            `;
          }).join('')}
        </tr>
      `;

      return `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px;">
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
              @page { size: A4 landscape; margin: 10mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-break { break-inside: avoid; }
            }
            body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #333; margin: 0 auto; padding: 20px; background: white; }
            h1 { text-align: center; font-size: 22px; margin-bottom: 30px; color: #1a365d; text-transform: uppercase; letter-spacing: 1px; }
            .section { margin-bottom: 25px; break-inside: avoid; }
            .section-title { font-size: 14px; font-weight: 700; color: #2c5282; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .field { margin-bottom: 4px; }
            .label { font-weight: 600; color: #718096; font-size: 10px; display: block; margin-bottom: 2px; text-transform: uppercase; }
            .value { color: #2d3748; font-weight: 500; font-size: 12px; }
            .full-width { grid-column: span 2; }
            .text-content { white-space: pre-wrap; background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #edf2f7; font-size: 12px; }
            .tag { display: inline-block; padding: 2px 8px; background: #ebf8ff; color: #2b6cb0; border-radius: 4px; font-size: 11px; margin-right: 5px; margin-bottom: 5px; border: 1px solid #bee3f8; }
            .score-item { display: flex; justify-content: space-between; align-items: center; padding: 6px; border-bottom: 1px solid #f7fafc; }
            .score-item:last-child { border-bottom: none; }
            .score-val { font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
            .score-low { background: #f0fff4; color: #276749; }
            .score-med { background: #fffaf0; color: #9c4221; }
            .score-high { background: #fff5f5; color: #c53030; }
            .check-item { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
            .check-icon { color: #38a169; font-weight: bold; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #edf2f7; text-align: center; color: #a0aec0; font-size: 10px; }
            .date-badge { display: inline-block; padding: 4px 10px; background: #ebf8ff; color: #2b6cb0; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 10px; }
            .records-summary { background: #f7fafc; padding: 10px; border-radius: 4px; margin-bottom: 20px; text-align: center; }
          </style>
        </head>
        <body>
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

          ${allAnamrezRecords.length > 0 ? `
          <div class="section no-break">
            <div class="section-title">📊 Semptom Değerlendirmesi - Tarihsel Karşılaştırma</div>
            <p style="font-size: 10px; color: #718096; margin-bottom: 10px;">Her sütun bir anamnez kaydının tarihini gösterir. Değerler 1-10 arasındadır.</p>
            ${generateSymptomComparisonTable()}
          </div>` : ''}

          ${allAnamrezRecords.some(r => r.toxicityAssessment) ? `
          <div class="section no-break">
            <div class="section-title">🔬 Toksisite Değerlendirmesi - Tarihsel Karşılaştırma</div>
            <p style="font-size: 10px; color: #718096; margin-bottom: 10px;">Her sütun bir anamnez kaydının tarihini gösterir. 5+ semptomda yüksek puan = Toksisite riski.</p>
            ${generateToxicityComparisonTable()}
          </div>` : ''}

          ${anamrezData.selectedDiagnosisSystems && anamrezData.selectedDiagnosisSystems.length > 0 ? `
          <div class="section no-break">
            <div class="section-title">Sistem Sorgulaması <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            ${anamrezData.selectedDiagnosisSystems.map(diagnosis => {
              const questionSet = DIAGNOSIS_SPECIFIC_QUESTIONS[diagnosis];
              if (!questionSet) return '';
              return `
                <div style="margin-bottom: 15px;">
                  <div style="font-weight:bold; font-size:11px; color:#4a5568; margin-bottom:5px;">${questionSet.label}</div>
                  <div class="grid-3" style="background:#f7fafc; padding:8px; border-radius:4px;">
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

          ${(anamrezData.optionalScans?.meridianScan?.enabled || anamrezData.optionalScans?.thermalScan?.enabled || anamrezData.optionalScans?.toxicityScan?.enabled) ? `
          <div class="section no-break">
            <div class="section-title">Opsiyonel Taramalar <span class="date-badge">📅 ${formatDate(anamrezData.createdAt)}</span></div>
            <div style="display:flex; flex-direction:column; gap:5px;">
              ${anamrezData.optionalScans.meridianScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Meridyen Tarama</div>' : ''}
              ${anamrezData.optionalScans.thermalScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Termal Tarama (IRIS-XP)</div>' : ''}
              ${anamrezData.optionalScans.toxicityScan?.enabled ? '<div class="check-item"><span class="check-icon">✓</span> Toksisite Ölçümü</div>' : ''}
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
            </div>
          </div>

          <div class="footer">
            Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')} | 
            ${anamrezData.completedBy?.name} tarafından oluşturulmuştur.
          </div>

          <script>
            window.onload = function() { window.print(); }
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
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('patientId', '==', patientId)
        );
        const querySnapshot = await getDocs(anamrezQuery);

        if (!querySnapshot.empty) {
          // Get ALL anamnez records for this patient
          const allRecords = querySnapshot.docs
            .map(doc => {
              const data = doc.data() as AnamrezData;
              data.id = doc.id;
              return data;
            })
            // Filter only completed records
            .filter(record => (record as any).status === 'completed')
            // Sort by creation date (newest first)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            // Limit to last 3 records
            .slice(0, 3);

          setAllAnamrezRecords(allRecords);
          
          // If no anamrezRecord was passed, set the first one as current
          if (!anamrezRecord && allRecords.length > 0) {
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

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSection('patient-info');
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl sm:rounded-2xl max-w-7xl w-full h-[95vh] sm:h-[90vh] md:h-[85vh] overflow-hidden shadow-2xl anamnez-view-modal-content">
          {/* Header */}
          <div className="p-3 sm:p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
            <div className="flex items-start sm:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 truncate">📄 Anamnez Görüntüleme</h2>
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
                          {new Date(record.createdAt).toLocaleDateString('tr-TR')} - #{index + 1}
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
                {/* PDF Download Button */}
                {anamrezData && (
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-md hover:shadow-lg text-xs sm:text-sm"
                    title="PDF Olarak İndir"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-4 sm:h-4">
                      <path d="M12 16L7 11L8.4 9.6L11 12.2V4H13V12.2L15.6 9.6L17 11L12 16Z" fill="currentColor"/>
                      <path d="M5 20V18H19V20H5Z" fill="currentColor"/>
                    </svg>
                    <span className="hidden sm:inline">Yazdır / PDF</span>
                  </button>
                )}
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
            <div className="flex flex-col md:flex-row" style={{height: 'calc(95vh - 80px)'}}>
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
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6" style={{maxHeight: 'calc(95vh - 160px)'}}>
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
                      <div className="space-y-4 sm:space-y-6">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                          📋 Tıbbi Geçmiş
                        </h3>
                        
                        <div className="grid grid-cols-1 gap-4 sm:gap-6">
                          <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm">
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

                    {/* Optional Scans Section */}
                    {activeSection === 'optional-scans' && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                          📋 Opsiyonel Taramalar
                        </h3>

                        {anamrezData.optionalScans && (
                          anamrezData.optionalScans.meridianScan?.enabled ||
                          anamrezData.optionalScans.thermalScan?.enabled ||
                          anamrezData.optionalScans.toxicityScan?.enabled
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
                                {/* Display uploaded file */}
                                {anamrezData.optionalScans.meridianScan?.fileUrl && 
                                 anamrezData.optionalScans.meridianScan.fileUrl !== 'pending' && (
                                  <div className="mt-4 border-t border-purple-200 pt-4">
                                    <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosya:</p>
                                    {(() => {
                                      const fileUrl = anamrezData.optionalScans.meridianScan.fileUrl;
                                      const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                      const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                      
                                      if (isImage) {
                                        return (
                                          <div className="space-y-3">
                                            <img 
                                              src={fileUrl} 
                                              alt="Meridyen Tarama" 
                                              className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                              onClick={() => window.open(fileUrl, '_blank')}
                                            />
                                            <a 
                                              href={fileUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                              🔍 Tam Boyut Görüntüle
                                            </a>
                                          </div>
                                        );
                                      } else if (isPdf) {
                                        return (
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
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
                                {/* Display uploaded file */}
                                {anamrezData.optionalScans.thermalScan?.fileUrl && 
                                 anamrezData.optionalScans.thermalScan.fileUrl !== 'pending' && (
                                  <div className="mt-4 border-t border-purple-200 pt-4">
                                    <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosya:</p>
                                    {(() => {
                                      const fileUrl = anamrezData.optionalScans.thermalScan.fileUrl;
                                      const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                      const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                      
                                      if (isImage) {
                                        return (
                                          <div className="space-y-3">
                                            <img 
                                              src={fileUrl} 
                                              alt="Termal Tarama" 
                                              className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                              onClick={() => window.open(fileUrl, '_blank')}
                                            />
                                            <a 
                                              href={fileUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                              🔍 Tam Boyut Görüntüle
                                            </a>
                                          </div>
                                        );
                                      } else if (isPdf) {
                                        return (
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
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
                                {/* Display uploaded file */}
                                {anamrezData.optionalScans.toxicityScan?.fileUrl && 
                                 anamrezData.optionalScans.toxicityScan.fileUrl !== 'pending' && (
                                  <div className="mt-4 border-t border-purple-200 pt-4">
                                    <p className="text-sm font-medium text-purple-800 mb-3">📎 Yüklenen Dosya:</p>
                                    {(() => {
                                      const fileUrl = anamrezData.optionalScans.toxicityScan.fileUrl;
                                      const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
                                      const isPdf = /\.pdf(\?|$)/i.test(fileUrl);
                                      
                                      if (isImage) {
                                        return (
                                          <div className="space-y-3">
                                            <img 
                                              src={fileUrl} 
                                              alt="Toksisite Ölçümü" 
                                              className="max-w-full h-auto max-h-64 rounded-lg border border-purple-300 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                                              onClick={() => window.open(fileUrl, '_blank')}
                                            />
                                            <a 
                                              href={fileUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                              🔍 Tam Boyut Görüntüle
                                            </a>
                                          </div>
                                        );
                                      } else if (isPdf) {
                                        return (
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-purple-200">
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
                                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
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