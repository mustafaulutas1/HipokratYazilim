export interface Permission {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Ana sayfa ve genel istatistikler',
    icon: '📊'
  },
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
    id: 'reports',
    name: 'Raporlar',
    description: 'Sistem raporları ve analizler',
    icon: '📈'
  },
  {
    id: 'doctor-panel',
    name: 'Doktor Ekranı',
    description: 'Doktor özel işlemleri ve yönetimi',
    icon: '👨‍⚕️'
  }
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'settings', 'accounting', 'pharmacy', 'prescriptions', 'reports', 'doctor-panel'],
  doctor: ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'settings', 'doctor-panel'],
  nurse: ['dashboard', 'patients', 'appointments', 'anamnez'],
  assistant: ['dashboard', 'patients', 'appointments'],
  desk: ['dashboard', 'patients', 'appointments'],
  anamnez: ['dashboard', 'patients', 'anamnez'],
  accounting: ['dashboard', 'patients', 'accounting', 'reports'],
  pharmacy: ['dashboard', 'patients', 'pharmacy', 'prescriptions'],
  treatment: ['dashboard', 'patients', 'appointments', 'treatment-protocols', 'anamnez']
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
  patient: 'Hasta'
};

export const getRoleDisplayName = (userType: string): string => {
  return ROLE_TRANSLATIONS[userType] || userType;
};

export const getUserPermissions = (userRole: string, customPermissions?: string[]): string[] => {
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions;
  }
  return DEFAULT_ROLE_PERMISSIONS[userRole] || ['dashboard'];
};

// This function will be updated to work with dynamic roles from Firestore
export const getUserPermissionsFromRole = async (userRole: string, customPermissions?: string[], clinicId?: string): Promise<string[]> => {
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions;
  }
  
  // For now, fallback to static permissions
  // This will be enhanced to fetch from Firestore roles
  return DEFAULT_ROLE_PERMISSIONS[userRole] || ['dashboard'];
};