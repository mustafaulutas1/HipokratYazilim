import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { rtmLogo } from '../../../assets';
import { getRoleDisplayName } from '../../../constants/permissions';
import { useUserPermissions } from '../../../hooks/useUserPermissions';

type PanelSection = 'dashboard' | 'patients' | 'appointments' | 'anamnez' | 'settings' | 'treatment-protocols' | 'users' | 'accounting' | 'pharmacy' | 'prescriptions' | 'reports' | 'assistant-panel' | 'doctor-panel' | 'treatment-panel';

interface SidebarProps {
  currentSection: PanelSection | null;
  onSectionChange: (section: PanelSection) => void;
  doctorProfile: {
    clinicId?: string;
    fullName?: string;
    role?: string;
    userType?: string;
    specialization?: string;
    department?: string;
    hospital?: string;
    email?: string;
    permissions?: string[];
  } | null;
}

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange, doctorProfile }) => {
  const { logout } = useAuth();

  // Get user permissions dynamically from role system
  const userRole = doctorProfile?.role || doctorProfile?.userType || 'doctor';
  const { permissions: userPermissions, loading: permissionsLoading } = useUserPermissions(
    userRole,
    doctorProfile?.clinicId,
    doctorProfile?.permissions
  );

  // Debug logging
  React.useEffect(() => {
    if (doctorProfile && !permissionsLoading) {
      console.log('👤 Sidebar - User Profile:', {
        userType: doctorProfile?.userType,
        role: doctorProfile?.role,
        clinicId: doctorProfile?.clinicId,
        customPermissions: doctorProfile?.permissions,
        resolvedRole: userRole,
        finalPermissions: userPermissions,
        hasAssistantPanel: userPermissions.includes('assistant-panel'),
        hasDoctorPanel: userPermissions.includes('doctor-panel')
      });
      
      console.log('📋 Available menu items that will show:', 
        menuItems.filter(item => userPermissions.includes(item.id)).map(item => item.label)
      );
      
      // Check if doctor-panel is missing for admin
      if (userRole === 'admin' && !userPermissions.includes('doctor-panel')) {
        console.error('❌ CRITICAL: Admin user missing doctor-panel permission!');
        console.log('Expected permissions:', ['dashboard', 'patients', 'appointments', 'anamnez', 'treatment-protocols', 'users', 'settings', 'accounting', 'pharmacy', 'prescriptions', 'reports', 'assistant-panel', 'doctor-panel', 'treatment-panel']);
        console.log('Actual permissions:', userPermissions);
      }
    }
  }, [doctorProfile, userRole, userPermissions, permissionsLoading]);

  // Get user icon based on role (including new dynamic roles)
  const getUserIcon = (userType: string) => {
    const icons: Record<string, string> = {
      admin: '👑',
      doctor: '👨‍⚕️',
      nurse: '👩‍⚕️',
      assistant: '👨‍💼',
      desk: '🏢',
      anamnez: '📋',
      accounting: '💰',
      pharmacy: '💊',
      treatment: '🩺',
      'call-center': '📞',
      patient: '👤'
    };
    return icons[userType] || '👨‍⚕️';
  };

  const handleLogout = async () => {
    try {
      console.log("🚪 Sidebar logout başladı");
      console.log("👤 Mevcut doktor kullanıcı:", doctorProfile?.email);
      
      await logout();
      console.log("✅ Doktor logout başarılı, ana sayfaya yönlendiriliyor");
      
      // Sayfa yenileme ile temiz bir başlangıç
      window.location.href = '/';
    } catch (error) {
      console.error("❌ Doktor logout hatası:", error);
      // Even if logout fails, try to navigate to home
      window.location.href = '/';
    }
  };

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Anasayfa',
      icon: '📊',
      description: 'Genel bakış ve istatistikler'
    },
    {
      id: 'patients',
      label: 'Hastalar',
      icon: '👥',
      description: 'Hasta listesi ve yönetimi'
    },
    {
      id: 'appointments',
      label: 'Randevular',
      icon: '📅',
      description: 'Randevu takvimi ve yönetimi'
    },
    {
      id: 'anamnez',
      label: 'Anamnez Ekranı',
      icon: '📝',
      description: 'Hasta anamnez kayıtları'
    },
    {
      id: 'assistant-panel',
      label: 'Asistan Ekranı',
      icon: '👨‍⚕️',
      description: 'Asistan özel işlemleri ve yönetimi'
    },
    {
      id: 'doctor-panel',
      label: 'Doktor Ekranı',
      icon: '🩺',
      description: 'Doktor özel işlemleri ve hasta yönetimi'
    },
    {
      id: 'treatment-protocols',
      label: 'Tedavi Protokolleri',
      icon: '📋',
      description: 'Tedavi protokolleri ve standartları'
    },
    {
      id: 'users',
      label: 'Kullanıcılar',
      icon: '👤',
      description: 'Klinik personeli yönetimi'
    },
    {
      id: 'accounting',
      label: 'Muhasebe',
      icon: '💰',
      description: 'Mali işlemler ve faturalama'
    },
    {
      id: 'pharmacy',
      label: 'Eczane',
      icon: '💊',
      description: 'İlaç yönetimi ve eczane işlemleri'
    },
    {
      id: 'prescriptions',
      label: 'Reçeteler',
      icon: '📋',
      description: 'Reçete yazma ve takibi'
    },
    {
      id: 'reports',
      label: 'Raporlar',
      icon: '📈',
      description: 'Sistem raporları ve analizler'
    },
    {
      id: 'treatment-panel',
      label: 'Tedavi Ekranı',
      icon: '🏥',
      description: 'Tedavi uygulamaları ve takibi'
    },
    {
      id: 'settings',
      label: 'Ayarlar',
      icon: '⚙️',
      description: 'Profil ve sistem ayarları'
    }
  ];

  return (
    <div className="w-80 bg-white/10 backdrop-blur-xl border-r border-white/20 flex flex-col h-screen">
      <div className="px-6 border-b border-white/20">
        <div className="flex items-center gap-4">
          <img 
            src={rtmLogo} 
            alt="RTM Logo" 
            className="w-20 h-20 object-contain"
          />
          <div>
            <h2 className="text-lg font-bold text-white">RTM Panel</h2>
            <p className="text-white/70 text-xs">Doktor Yönetim Sistemi</p>
          </div>
        </div>
      </div>

      {/* Doctor Profile */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
            <span className="text-white text-lg">{getUserIcon(doctorProfile?.role || doctorProfile?.userType || 'doctor')}</span>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">{doctorProfile?.fullName || 'Kullanıcı'}</h3>
            <p className="text-white/70 text-sm">{getRoleDisplayName(doctorProfile?.role || doctorProfile?.userType || 'doctor')}</p>
            <p className="text-white/60 text-xs">
              {doctorProfile?.specialization || doctorProfile?.department || doctorProfile?.hospital || 'Klinik Personeli'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 overflow-y-auto admin-panel-scrollbar">
        <ul className="space-y-2">
          {permissionsLoading ? (
            <li className="text-center text-white/60 p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/60 mx-auto mb-2"></div>
              <p className="text-sm">Yetkiler yükleniyor...</p>
            </li>
          ) : (
            menuItems
              .filter(item => {
                // Call Center için dashboard'u filtrele
                const userRole = doctorProfile?.role || doctorProfile?.userType || 'doctor';
                if (userRole === 'call-center' && item.id === 'dashboard') {
                  return false;
                }
                return userPermissions.includes(item.id);
              })
              .map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSectionChange(item.id as PanelSection)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${
                  currentSection === item.id
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold">{item.label}</div>
                  <div className={`text-xs ${
                    currentSection === item.id ? 'text-white/80' : 'text-white/60'
                  }`}>
                    {item.description}
                  </div>
                </div>
              </button>
            </li>
          ))
          )}
        </ul>
        
        {/* Show message if no permissions */}
        {userPermissions.length === 0 && (
          <div className="text-center text-white/60 p-4">
            <p className="text-sm">Erişim yetkisi bulunmuyor.</p>
          </div>
        )}
      </nav>

      {/* Quick Stats */}
      <div className="p-3 border-t border-white/20">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3">
          <h4 className="text-white/80 text-xs font-semibold mb-2">Hızlı İstatistikler</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Bugünkü Randevular</span>
              <span className="text-green-400 font-semibold">8</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Bekleyen Hastalar</span>
              <span className="text-yellow-400 font-semibold">3</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/70">Toplam Hasta</span>
              <span className="text-blue-400 font-semibold">156</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logout Button */}
      <div className="p-3 border-t border-white/20">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("🔴 Sidebar çıkış butonu tıklandı!");
            handleLogout();
          }}
          className="w-full flex items-center gap-2 px-4 py-2 bg-red-900 hover:bg-red-950 border border-red-800 rounded-xl text-white hover:text-red-100 transition-all duration-200 active:scale-95 shadow-lg hover:shadow-xl"
          style={{ pointerEvents: 'auto' }}
        >
          <span className="text-lg">🚪</span>
          <span className="font-semibold">Çıkış Yap</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;