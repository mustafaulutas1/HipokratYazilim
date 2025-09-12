export interface Disease {
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

export interface TreatmentCourse {
  id: string;
  name: string;
  duration: number; // Number of courses (2, 3, 4)
  description: string;
  totalWeeks: number;
  sessionsPerWeek: number;
  breakBetweenCourses: number; // Weeks between courses
}

export interface ApplicationMethod {
  id: string;
  name: string;
  nameEn: string;
  category: 'traditional' | 'modern' | 'combined';
  description: string;
  duration: string;
  frequency: string;
  contraindications: string[];
  sideEffects: string[];
  successRate: string;
}

export interface AgeGroup {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  description: string;
}

export interface DiseaseProtocol {
  id: string;
  diseaseId: string;
  diseaseName: string;
  ageGroupId: string;
  ageGroupName: string;
  treatmentCourseId: string;
  treatmentCourseName: string;
  applicationMethods: ApplicationMethod[];
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

export interface CombinedProtocol {
  id: string;
  name: string;
  description: string;
  primaryDiseaseId: string;
  primaryDiseaseName: string;
  secondaryConditions: string[]; // e.g., ["Stress", "Anxiety"]
  ageGroupId: string;
  ageGroupName: string;
  treatmentCourseId: string;
  treatmentCourseName: string;
  applicationMethods: ApplicationMethod[];
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

// Sample data for the new structure
export const DISEASES: Disease[] = [
  {
    id: 'dermatology-eczema',
    name: 'Egzama',
    nameEn: 'Eczema',
    category: 'Dermatoloji',
    icd10Code: 'L30',
    description: 'Ciltte kızarıklık, kaşıntı ve pullanma ile karakterize inflamatuar cilt hastalığı',
    symptoms: [
      'Ciltte kızarıklık',
      'Şiddetli kaşıntı',
      'Ciltte pullanma',
      'Kuruluk',
      'Çatlaklar'
    ],
    riskFactors: [
      'Aile öyküsü',
      'Alerjik reaksiyonlar',
      'Stres',
      'Kuru hava',
      'Kimyasal maddeler'
    ],
    isActive: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'dermatology-psoriasis',
    name: 'Sedef Hastalığı',
    nameEn: 'Psoriasis',
    category: 'Dermatoloji',
    icd10Code: 'L40',
    description: 'Cilt hücrelerinin hızlı çoğalması ile karakterize kronik inflamatuar hastalık',
    symptoms: [
      'Kalın, kırmızı plaklar',
      'Gümüşi pullanma',
      'Kaşıntı',
      'Yanma hissi',
      'Eklem ağrısı'
    ],
    riskFactors: [
      'Aile öyküsü',
      'Stres',
      'Enfeksiyonlar',
      'İlaç kullanımı',
      'Sigara'
    ],
    isActive: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'dermatology-acne',
    name: 'Akne',
    nameEn: 'Acne',
    category: 'Dermatoloji',
    icd10Code: 'L70',
    description: 'Yağ bezlerinin ve kıl foliküllerinin inflamatuar hastalığı',
    symptoms: [
      'Sivilce',
      'Siyah nokta',
      'Beyaz nokta',
      'İltihaplı lezyonlar',
      'Yara izleri'
    ],
    riskFactors: [
      'Hormonal değişiklikler',
      'Stres',
      'Yağlı beslenme',
      'Kozmetik ürünler',
      'Genetik'
    ],
    isActive: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
];

export const AGE_GROUPS: AgeGroup[] = [
  {
    id: 'age-18-30',
    name: '18-30 Yaş',
    minAge: 18,
    maxAge: 30,
    description: 'Genç yetişkin grubu'
  },
  {
    id: 'age-31-50',
    name: '31-50 Yaş',
    minAge: 31,
    maxAge: 50,
    description: 'Orta yaş grubu'
  },
  {
    id: 'age-51-plus',
    name: '51+ Yaş',
    minAge: 51,
    maxAge: 120,
    description: 'İleri yaş grubu'
  }
];

export const TREATMENT_COURSES: TreatmentCourse[] = [
  {
    id: 'course-2',
    name: '2 Kür',
    duration: 2,
    description: '2 kürlük tedavi programı',
    totalWeeks: 6,
    sessionsPerWeek: 2,
    breakBetweenCourses: 2
  },
  {
    id: 'course-3',
    name: '3 Kür',
    duration: 3,
    description: '3 kürlük tedavi programı',
    totalWeeks: 9,
    sessionsPerWeek: 2,
    breakBetweenCourses: 2
  },
  {
    id: 'course-4',
    name: '4 Kür',
    duration: 4,
    description: '4 kürlük tedavi programı',
    totalWeeks: 12,
    sessionsPerWeek: 2,
    breakBetweenCourses: 2
  }
];

export const APPLICATION_METHODS: ApplicationMethod[] = [
  {
    id: 'hijama',
    name: 'Hacamat',
    nameEn: 'Hijama',
    category: 'traditional',
    description: 'Geleneksel kan alma yöntemi ile toksinlerin vücuttan atılması',
    duration: '30-45 dakika',
    frequency: 'Haftada 1-2 kez',
    contraindications: ['Anemi', 'Kanama bozuklukları', 'Gebelik'],
    sideEffects: ['Hafif baş dönmesi', 'Yorgunluk'],
    successRate: 'Yüksek'
  },
  {
    id: 'ozone',
    name: 'Ozon Tedavisi',
    nameEn: 'Ozone Therapy',
    category: 'modern',
    description: 'Ozon gazı ile vücudun oksijenlenmesi ve bağışıklık sisteminin güçlendirilmesi',
    duration: '20-30 dakika',
    frequency: 'Haftada 2-3 kez',
    contraindications: ['Ağır kalp hastalığı', 'Aktif enfeksiyon'],
    sideEffects: ['Hafif baş ağrısı', 'Mide bulantısı'],
    successRate: 'Orta-Yüksek'
  },
  {
    id: 'cupping',
    name: 'Kupa Tedavisi',
    nameEn: 'Cupping Therapy',
    category: 'traditional',
    description: 'Vakum ile cilt altındaki kan dolaşımının artırılması',
    duration: '15-20 dakika',
    frequency: 'Haftada 1-2 kez',
    contraindications: ['Cilt hastalıkları', 'Açık yaralar'],
    sideEffects: ['Ciltte kızarıklık', 'Hafif ağrı'],
    successRate: 'Orta'
  },
  {
    id: 'acupuncture',
    name: 'Akupunktur',
    nameEn: 'Acupuncture',
    category: 'traditional',
    description: 'İnce iğneler ile enerji kanallarının uyarılması',
    duration: '20-30 dakika',
    frequency: 'Haftada 1-2 kez',
    contraindications: ['Kanama bozuklukları', 'Gebelik'],
    sideEffects: ['Hafif ağrı', 'Küçük kanama'],
    successRate: 'Yüksek'
  }
];

export const DISEASE_PROTOCOLS: DiseaseProtocol[] = [
  {
    id: 'eczema-18-30-2course',
    diseaseId: 'dermatology-eczema',
    diseaseName: 'Egzama',
    ageGroupId: 'age-18-30',
    ageGroupName: '18-30 Yaş',
    treatmentCourseId: 'course-2',
    treatmentCourseName: '2 Kür',
    applicationMethods: [APPLICATION_METHODS[0], APPLICATION_METHODS[1]], // Hijama + Ozone
    dosage: 'Hacamat: 200ml, Ozon: 30mg',
    frequency: 'Hacamat: Haftada 1, Ozon: Haftada 2',
    duration: '6 hafta',
    instructions: 'Tedavi öncesi 8 saat aç kalınmalı, bol su içilmeli',
    precautions: 'Tedavi sonrası 24 saat spor yapılmamalı',
    expectedResults: '2 hafta içinde kaşıntı azalması, 4 hafta içinde cilt iyileşmesi',
    followUpSchedule: ['2. hafta', '4. hafta', '6. hafta'],
    isActive: true,
    createdBy: 'dr-orhan-er',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'eczema-18-30-3course',
    diseaseId: 'dermatology-eczema',
    diseaseName: 'Egzama',
    ageGroupId: 'age-18-30',
    ageGroupName: '18-30 Yaş',
    treatmentCourseId: 'course-3',
    treatmentCourseName: '3 Kür',
    applicationMethods: [APPLICATION_METHODS[0], APPLICATION_METHODS[1], APPLICATION_METHODS[2]], // Hijama + Ozone + Cupping
    dosage: 'Hacamat: 250ml, Ozon: 35mg, Kupa: 8 adet',
    frequency: 'Hacamat: Haftada 1, Ozon: Haftada 2, Kupa: Haftada 1',
    duration: '9 hafta',
    instructions: 'Tedavi öncesi 8 saat aç kalınmalı, bol su içilmeli',
    precautions: 'Tedavi sonrası 24 saat spor yapılmamalı',
    expectedResults: '3 hafta içinde kaşıntı azalması, 6 hafta içinde cilt iyileşmesi',
    followUpSchedule: ['3. hafta', '6. hafta', '9. hafta'],
    isActive: true,
    createdBy: 'dr-orhan-er',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'eczema-31-50-2course',
    diseaseId: 'dermatology-eczema',
    diseaseName: 'Egzama',
    ageGroupId: 'age-31-50',
    ageGroupName: '31-50 Yaş',
    treatmentCourseId: 'course-2',
    treatmentCourseName: '2 Kür',
    applicationMethods: [APPLICATION_METHODS[0], APPLICATION_METHODS[3]], // Hijama + Acupuncture
    dosage: 'Hacamat: 180ml, Akupunktur: 12 nokta',
    frequency: 'Hacamat: Haftada 1, Akupunktur: Haftada 2',
    duration: '6 hafta',
    instructions: 'Tedavi öncesi 6 saat aç kalınmalı, bol su içilmeli',
    precautions: 'Tedavi sonrası 12 saat spor yapılmamalı',
    expectedResults: '3 hafta içinde kaşıntı azalması, 5 hafta içinde cilt iyileşmesi',
    followUpSchedule: ['2. hafta', '4. hafta', '6. hafta'],
    isActive: true,
    createdBy: 'dr-orhan-er',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
];

export const COMBINED_PROTOCOLS: CombinedProtocol[] = [
  {
    id: 'eczema-stress-18-30-3course',
    name: 'Egzama + Stres Protokolü',
    description: 'Egzama ve stres birlikte bulunduğunda uygulanan özel protokol',
    primaryDiseaseId: 'dermatology-eczema',
    primaryDiseaseName: 'Egzama',
    secondaryConditions: ['Stres', 'Anksiyete'],
    ageGroupId: 'age-18-30',
    ageGroupName: '18-30 Yaş',
    treatmentCourseId: 'course-3',
    treatmentCourseName: '3 Kür',
    applicationMethods: [APPLICATION_METHODS[0], APPLICATION_METHODS[1], APPLICATION_METHODS[3]], // Hijama + Ozone + Acupuncture
    dosage: 'Hacamat: 250ml, Ozon: 35mg, Akupunktur: 15 nokta',
    frequency: 'Hacamat: Haftada 1, Ozon: Haftada 2, Akupunktur: Haftada 2',
    duration: '9 hafta',
    instructions: 'Tedavi öncesi 8 saat aç kalınmalı, stres yönetimi teknikleri uygulanmalı',
    precautions: 'Tedavi sonrası 24 saat spor yapılmamalı, meditasyon önerilir',
    expectedResults: '2 hafta içinde stres azalması, 4 hafta içinde cilt iyileşmesi',
    followUpSchedule: ['2. hafta', '4. hafta', '6. hafta', '9. hafta'],
    isActive: true,
    createdBy: 'dr-orhan-er',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'psoriasis-stress-31-50-4course',
    name: 'Sedef + Stres Protokolü',
    description: 'Sedef hastalığı ve stres birlikte bulunduğunda uygulanan kapsamlı protokol',
    primaryDiseaseId: 'dermatology-psoriasis',
    primaryDiseaseName: 'Sedef Hastalığı',
    secondaryConditions: ['Stres', 'Depresyon'],
    ageGroupId: 'age-31-50',
    ageGroupName: '31-50 Yaş',
    treatmentCourseId: 'course-4',
    treatmentCourseName: '4 Kür',
    applicationMethods: [APPLICATION_METHODS[0], APPLICATION_METHODS[1], APPLICATION_METHODS[2], APPLICATION_METHODS[3]], // All methods
    dosage: 'Hacamat: 300ml, Ozon: 40mg, Kupa: 10 adet, Akupunktur: 18 nokta',
    frequency: 'Hacamat: Haftada 1, Ozon: Haftada 2, Kupa: Haftada 1, Akupunktur: Haftada 2',
    duration: '12 hafta',
    instructions: 'Tedavi öncesi 8 saat aç kalınmalı, psikolojik destek alınmalı',
    precautions: 'Tedavi sonrası 24 saat spor yapılmamalı, düzenli uyku önemli',
    expectedResults: '4 hafta içinde stres azalması, 8 hafta içinde cilt iyileşmesi',
    followUpSchedule: ['2. hafta', '4. hafta', '6. hafta', '8. hafta', '10. hafta', '12. hafta'],
    isActive: true,
    createdBy: 'dr-orhan-er',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
];

// Helper functions
export const getDiseaseProtocols = (diseaseId: string, ageGroupId?: string) => {
  let protocols = DISEASE_PROTOCOLS.filter(p => p.diseaseId === diseaseId);
  if (ageGroupId) {
    protocols = protocols.filter(p => p.ageGroupId === ageGroupId);
  }
  return protocols;
};

export const getCombinedProtocols = (diseaseId: string, secondaryConditions: string[]) => {
  return COMBINED_PROTOCOLS.filter(p => 
    p.primaryDiseaseId === diseaseId && 
    secondaryConditions.some(condition => 
      p.secondaryConditions.includes(condition)
    )
  );
};

export const getApplicationMethodsByCategory = (category: string) => {
  return APPLICATION_METHODS.filter(method => method.category === category);
};

export const DISEASE_CATEGORIES = [
  'Dermatoloji',
  'Kardiyoloji',
  'Göğüs Hastalıkları',
  'Psikiyatri',
  'Nöroloji',
  'Gastroenteroloji',
  'Romatoloji',
  'Onkoloji',
  'Endokrinoloji',
  'Ortopedi'
];

export const SEVERITY_LEVELS = [
  { value: 'low', label: 'Düşük', color: 'text-green-500' },
  { value: 'medium', label: 'Orta', color: 'text-yellow-500' },
  { value: 'high', label: 'Yüksek', color: 'text-orange-500' },
  { value: 'critical', label: 'Kritik', color: 'text-red-500' }
];
