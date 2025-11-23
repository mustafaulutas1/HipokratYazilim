export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  clinicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const DEFAULT_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'desk',
    displayName: 'Resepsiyon Görevlisi',
    description: 'Hasta karşılama, randevu yönetimi ve ön büro işlemleri',
    permissions: ['patients', 'appointments'],
    isDefault: true
  },
  {
    name: 'anamnez',
    displayName: 'Anamnez Uzmanı',
    description: 'Hasta anamnez kayıtları ve değerlendirme işlemleri',
    permissions: ['anamnez', 'patients', 'settings'],
    isDefault: true
  },
  {
    name: 'assistant',
    displayName: 'Asistan',
    description: 'Genel destek ve yardımcı işlemler',
    permissions: ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'settings', 'accounting', 'pharmacy', 'prescriptions', 'reports', 'assistant-panel', 'doctor-panel', 'treatment-panel'],
    isDefault: true
  },
  {
    name: 'doctor',
    displayName: 'Doktor',
    description: 'Tıbbi muayene, teşhis ve tedavi protokolleri',
    permissions: ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'settings', 'assistant-panel', 'doctor-panel'],
    isDefault: true
  },
  {
    name: 'accounting',
    displayName: 'Muhasebe Uzmanı',
    description: 'Mali işlemler, faturalama ve finansal raporlama',
    permissions: ['dashboard', 'patients', 'accounting', 'reports'],
    isDefault: true
  },
  {
    name: 'pharmacy',
    displayName: 'Eczane Sorumlusu',
    description: 'İlaç yönetimi, reçete kontrolü ve eczane işlemleri',
    permissions: ['dashboard', 'patients', 'pharmacy', 'prescriptions'],
    isDefault: true
  },
  {
    name: 'treatment',
    displayName: 'Tedavi Uzmanı',
    description: 'Tedavi uygulamaları ve takibi',
    permissions: ['dashboard', 'patients', 'appointments', 'treatment-protocols', 'anamnez'],
    isDefault: true
  },
  {
    name: 'admin',
    displayName: 'Sistem Yöneticisi',
    description: 'Tam yetki - tüm sistem yönetimi',
    permissions: ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'settings', 'accounting', 'pharmacy', 'prescriptions', 'reports', 'assistant-panel'],
    isDefault: true
  },
  {
    name: 'call-center',
    displayName: 'Call Center',
    description: 'Hasta görüntüleme ve hızlı randevu verme işlemleri',
    permissions: ['dashboard', 'patients', 'appointments'],
    isDefault: true
  }
];
