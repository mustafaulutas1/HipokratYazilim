export interface Permission {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
  {
    id: 'patients',
    name: 'Hastalar',
    description: 'Hasta listesi ve yönetimi',
    icon: '👥'
  },
  {
    id: 'appointments',
    name: 'Randevular',
    description: 'Randevu takvimi ve yönetimi',
    icon: '📅'
  },
  {
    id: 'anamnez',
    name: 'Anamnez Ekranı',
    description: 'Hasta anamnez kayıtları ve değerlendirme',
    icon: '📝'
  },
  {
    id: 'treatment-protocols',
    name: 'Tedavi Protokolleri',
    description: 'Tedavi protokolleri ve standartları',
    icon: '📋'
  },
  {
    id: 'users',
    name: 'Kullanıcılar',
    description: 'Klinik personeli yönetimi',
    icon: '👤'
  },
  {
    id: 'settings',
    name: 'Ayarlar',
    description: 'Profil ve sistem ayarları',
    icon: '⚙️'
  },
  {
    id: 'accounting',
    name: 'Muhasebe',
    description: 'Mali işlemler ve faturalama',
    icon: '💰'
  },
  {
    id: 'pharmacy',
    name: 'Eczane',
    description: 'İlaç yönetimi ve eczane işlemleri',
    icon: '💊'
  },
  {
    id: 'prescriptions',
    name: 'Reçeteler',
    description: 'Reçete yazma ve takibi',
    icon: '📋'
  },
  {
    id: 'assistant-panel',
    name: 'Asistan Ekranı',
    description: 'Asistan özel işlemleri ve yönetimi',
    icon: '👨‍⚕️'
  },
  {
    id: 'doctor-panel',
    name: 'Doktor Ekranı',
    description: 'Doktor özel işlemleri ve hasta yönetimi',
    icon: '🩺'
  },
  {
    id: 'treatment-panel',
    name: 'Tedavi Ekranı',
    description: 'Tedavi uygulamaları ve takibi',
    icon: '🏥'
  }
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'settings', 'accounting', 'pharmacy', 'prescriptions', 'assistant-panel', 'doctor-panel', 'treatment-panel'],
  doctor: ['patients', 'appointments', 'anamnez', 'treatment-protocols', 'assistant-panel', 'doctor-panel'],
  nurse: ['patients', 'appointments', 'anamnez'],
  assistant: ['patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'accounting', 'pharmacy', 'prescriptions', 'assistant-panel', 'doctor-panel', 'treatment-panel'],
  desk: ['patients', 'appointments'],
  anamnez: ['anamnez', 'patients'],
  accounting: ['patients', 'accounting'],
  pharmacy: ['patients', 'pharmacy', 'prescriptions'],
  treatment: ['patients', 'appointments', 'treatment-protocols', 'anamnez', 'treatment-panel'],
  'call-center': ['patients', 'appointments']
};

export const ROLE_TRANSLATIONS: Record<string, string> = {
  admin: 'Sistem Yöneticisi',
  doctor: 'Doktor',
  nurse: 'Hemşire',
  assistant: 'Asistan',
  desk: 'Resepsiyon Görevlisi',
  anamnez: 'Anamnez Uzmanı',
  accounting: 'Muhasebe Uzmanı',
  pharmacy: 'Eczane Sorumlusu',
  treatment: 'Tedavi Uzmanı',
  'call-center': 'Call Center',
  patient: 'Hasta'
};

export const getRoleDisplayName = (userType: string): string => {
  return ROLE_TRANSLATIONS[userType] || userType;
};

export const getUserPermissions = (userRole: string, customPermissions?: string[]): string[] => {
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions;
  }
  // For desk role, default to ['patients', 'appointments'] instead of ['dashboard']
  if (userRole === 'desk' && !DEFAULT_ROLE_PERMISSIONS[userRole]) {
    return ['patients', 'appointments'];
  }
  return DEFAULT_ROLE_PERMISSIONS[userRole] || ['patients'];
};

// This function will be updated to work with dynamic roles from Firestore
export const getUserPermissionsFromRole = async (userRole: string, customPermissions?: string[]): Promise<string[]> => {
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions;
  }
  
  // For now, fallback to static permissions
  // This will be enhanced to fetch from Firestore roles
  // For desk role, default to ['patients', 'appointments'] instead of ['dashboard']
  if (userRole === 'desk' && !DEFAULT_ROLE_PERMISSIONS[userRole]) {
    return ['patients', 'appointments'];
  }
  return DEFAULT_ROLE_PERMISSIONS[userRole] || ['patients'];
};