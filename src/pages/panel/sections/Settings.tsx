import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';
import { forceLogoutService } from '../../../services/forceLogoutService';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import FileUpload from '../../../components/UI/FileUpload';

interface SessionData {
  id: string;
  deviceName: string;
  browser: string;
  ipAddress: string;
  location: string;
  isActive: boolean;
  lastLogin: Date;
  userAgent: string;
}

interface SettingsProps {
  doctorProfile: any;
}

const Settings: React.FC<SettingsProps> = ({ doctorProfile }) => {
  const { user, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: doctorProfile?.fullName || '',
    specialization: doctorProfile?.specialization || '',
    hospital: doctorProfile?.hospital || '',
    department: doctorProfile?.department || '',
    phone: doctorProfile?.phone || '',
    logoUrl: doctorProfile?.logoUrl || ''
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);

  // doctorProfile değiştiğinde profileData'yı güncelle
  useEffect(() => {
    if (doctorProfile) {
      setProfileData({
        fullName: doctorProfile.fullName || '',
        specialization: doctorProfile.specialization || '',
        hospital: doctorProfile.hospital || '',
        department: doctorProfile.department || '',
        phone: doctorProfile.phone || '',
        logoUrl: doctorProfile.logoUrl || ''
      });
    }
  }, [doctorProfile]);

  const handleLogoUpload = (file: File) => {
    setLogoFile(file);
  };

  const handleLogoRemove = () => {
    setLogoFile(null);
    setProfileData(prev => ({ ...prev, logoUrl: '' }));
  };

  const tabs = [
    { id: 'profile', label: 'Profil', icon: '👤' },
    { id: 'security', label: 'Güvenlik', icon: '🔒' }
  ];

  const handleSaveProfile = async () => {
    if (!user) {
      alert('Kullanıcı bilgisi bulunamadı');
      return;
    }

    if (!profileData.fullName.trim()) {
      alert('Lütfen ad soyad giriniz');
      return;
    }

    try {
      setLoading(true);

      const doctorRef = doc(db, 'doctors', user.uid);
      const clinicUserRef = doc(db, 'clinicUsers', user.uid);

      let uploadedLogoUrl = profileData.logoUrl;

      // Upload logo if changed
      if (logoFile) {
        const storage = getStorage();
        const logoRef = ref(storage, `clinic_logos/${user.uid}_${Date.now()}_${logoFile.name}`);
        await uploadBytes(logoRef, logoFile);
        uploadedLogoUrl = await getDownloadURL(logoRef);
      }

      const updateData = {
        fullName: profileData.fullName.trim(),
        specialization: profileData.specialization.trim(),
        hospital: profileData.hospital.trim(),
        department: profileData.department.trim(),
        phone: profileData.phone.trim(),
        logoUrl: uploadedLogoUrl,
        updatedAt: new Date().toISOString()
      };

      try {
        await updateDoc(doctorRef, updateData);
      } catch (error) {
        await updateDoc(clinicUserRef, updateData);
      }

      alert('Profil bilgileriniz başarıyla güncellendi!');
      setIsEditing(false);
      window.location.reload();
    } catch (error) {
      console.error('Profil güncellenirken hata:', error);
      alert('Profil güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordLoading(true);

    try {
      // Validasyonlar
      if (!passwordData.currentPassword) {
        throw new Error('Mevcut şifre gereklidir');
      }
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error('Yeni şifreler eşleşmiyor');
      }
      if (passwordData.newPassword.length < 6) {
        throw new Error('Yeni şifre en az 6 karakter olmalıdır');
      }
      if (passwordData.currentPassword === passwordData.newPassword) {
        throw new Error('Yeni şifre mevcut şifre ile aynı olamaz');
      }

      // Şifre değiştir
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      
      setPasswordSuccess('Şifreniz başarıyla değiştirildi!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      // 3 saniye sonra modal'ı kapat
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 3000);
      
    } catch (error: any) {
      console.error('Şifre değiştirme hatası:', error);
      
      // Firebase hata kodlarına göre özel mesajlar
      let errorMessage = 'Şifre değiştirilirken bir hata oluştu';
      
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Mevcut şifre yanlış';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Yeni şifre çok zayıf. En az 6 karakter olmalıdır';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Güvenlik için lütfen tekrar giriş yapın';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'İnternet bağlantınızı kontrol edin';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setPasswordError(errorMessage);
    } finally {
      setPasswordLoading(false);
    }
  };

  const resetPasswordForm = () => {
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordError('');
    setPasswordSuccess('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSignOutAllUsers = async () => {
    if (!confirm('⚠️ UYARI: Tüm kullanıcıları tüm cihazlardan çıkış yapmaya zorlamak istediğinizden emin misiniz? Bu işlem geri alınamaz!')) {
      return;
    }

    setIsSigningOutAll(true);
    try {
      await forceLogoutService.triggerForceLogout(user?.email || 'admin', 'Tüm kullanıcılar manuel olarak çıkış yaptırıldı');
      alert('✅ Tüm kullanıcılar başarıyla çıkış yaptırıldı!');
    } catch (error) {
      console.error('Kullanıcıları çıkış yaptırırken hata:', error);
      alert('❌ Kullanıcıları çıkış yaptırırken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSigningOutAll(false);
    }
  };

  // Check if current user is authorized admin
  const isAuthorizedForceLogoutAdmin = () => {
    return user?.email === 'e.turanemre@gmail.com';
  };

  // Gerçek oturum verilerini yükle
  useEffect(() => {
    loadSessionHistory();
  }, []);

  // Tekrarlanan oturumları temizle
  const cleanDuplicateSessions = (sessions: SessionData[]): SessionData[] => {
    const uniqueSessions = new Map<string, SessionData>();

    sessions.forEach(session => {
      const key = session.ipAddress;
      if (!uniqueSessions.has(key) ||
        new Date(session.lastLogin) > new Date(uniqueSessions.get(key)!.lastLogin)) {
        uniqueSessions.set(key, session);
      }
    });

    return Array.from(uniqueSessions.values());
  };

  const getDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    const language = navigator.language;

    // Cihaz adını belirle
    let deviceName = 'Bilinmeyen Cihaz';
    if (userAgent.includes('iPhone')) {
      deviceName = 'iPhone';
    } else if (userAgent.includes('iPad')) {
      deviceName = 'iPad';
    } else if (userAgent.includes('Android')) {
      deviceName = 'Android Cihaz';
    } else if (userAgent.includes('Mac')) {
      deviceName = 'Mac';
    } else if (userAgent.includes('Windows')) {
      deviceName = 'Windows PC';
    } else if (userAgent.includes('Linux')) {
      deviceName = 'Linux PC';
    }

    // Tarayıcı bilgisini al
    let browser = 'Bilinmeyen Tarayıcı';
    if (userAgent.includes('Chrome')) {
      const chromeVersion = userAgent.match(/Chrome\/(\d+)/);
      browser = `Chrome ${chromeVersion ? chromeVersion[1] : 'Unknown'}`;
    } else if (userAgent.includes('Firefox')) {
      const firefoxVersion = userAgent.match(/Firefox\/(\d+)/);
      browser = `Firefox ${firefoxVersion ? firefoxVersion[1] : 'Unknown'}`;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const safariVersion = userAgent.match(/Version\/(\d+)/);
      browser = `Safari ${safariVersion ? safariVersion[1] : 'Unknown'}`;
    } else if (userAgent.includes('Edge')) {
      const edgeVersion = userAgent.match(/Edge\/(\d+)/);
      browser = `Edge ${edgeVersion ? edgeVersion[1] : 'Unknown'}`;
    }

    return {
      deviceName,
      browser,
      userAgent,
      platform,
      language
    };
  };

  const getIPAndLocation = async () => {
    try {
      // IP adresini al
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();

      // Konum bilgisini al
      const locationResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
      const locationData = await locationResponse.json();

      return {
        ipAddress: ipData.ip,
        location: `${locationData.city || 'Bilinmeyen'}, ${locationData.country_name || 'Bilinmeyen'}`
      };
    } catch (error) {
      console.error('IP ve konum bilgisi alınamadı:', error);
      return {
        ipAddress: 'Bilinmeyen',
        location: 'Bilinmeyen Konum'
      };
    }
  };

  const loadSessionHistory = async () => {
    try {
      // Mevcut cihaz bilgilerini al
      const deviceInfo = getDeviceInfo();
      const locationInfo = await getIPAndLocation();

      // Mevcut oturum bilgilerini localStorage'dan al
      const existingSessionsData = JSON.parse(localStorage.getItem('userSessions') || '[]');

      // Tarih verilerini doğru şekilde parse et
      const existingSessions = existingSessionsData.map((session: any) => ({
        ...session,
        lastLogin: new Date(session.lastLogin)
      }));

      // Önce mevcut tekrarlanan oturumları temizle
      const cleanedSessions = cleanDuplicateSessions(existingSessions);

      // Aynı IP'den gelen oturum var mı kontrol et
      const existingSessionWithSameIP = cleanedSessions.find(
        (session: SessionData) => session.ipAddress === locationInfo.ipAddress
      );

      if (existingSessionWithSameIP) {
        // Aynı IP'den gelen oturum varsa, onu güncelle
        const updatedSessions = cleanedSessions.map((session: SessionData) => {
          if (session.ipAddress === locationInfo.ipAddress) {
            return {
              ...session,
              deviceName: deviceInfo.deviceName,
              browser: deviceInfo.browser,
              location: locationInfo.location,
              isActive: true,
              lastLogin: new Date(),
              userAgent: deviceInfo.userAgent
            };
          }
          return {
            ...session,
            isActive: false
          };
        });

        localStorage.setItem('userSessions', JSON.stringify(updatedSessions));
        setSessions(updatedSessions);
      } else {
        // Yeni IP'den gelen oturum, yeni oturum oluştur
        const currentSessionId = `${deviceInfo.platform}-${Date.now()}`;
        const currentSession: SessionData = {
          id: currentSessionId,
          deviceName: deviceInfo.deviceName,
          browser: deviceInfo.browser,
          ipAddress: locationInfo.ipAddress,
          location: locationInfo.location,
          isActive: true,
          lastLogin: new Date(),
          userAgent: deviceInfo.userAgent
        };

        // Mevcut oturumları pasif yap
        const updatedSessions = cleanedSessions.map((session: SessionData) => ({
          ...session,
          isActive: false
        }));

        // Yeni oturum ekle
        const allSessions = [currentSession, ...updatedSessions];

        localStorage.setItem('userSessions', JSON.stringify(allSessions));
        setSessions(allSessions);
      }
    } catch (error) {
      console.error('Oturum geçmişi yüklenirken hata:', error);
      // Hata durumunda boş array set et
      setSessions([]);
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      // localStorage'dan oturumu kaldır
      const updatedSessions = sessions.filter(session => session.id !== sessionId);
      localStorage.setItem('userSessions', JSON.stringify(updatedSessions));

      // State'i güncelle
      setSessions(updatedSessions);

      console.log('Oturum sonlandırıldı:', sessionId);
    } catch (error) {
      console.error('Oturum sonlandırılırken hata:', error);
    }
  };

  const formatTimeAgo = (date: Date | string): string => {
    try {
      // Eğer string ise Date objesine çevir
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      // Geçerli tarih kontrolü
      if (isNaN(dateObj.getTime())) {
        return 'Bilinmeyen tarih';
      }

      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

      if (diffInSeconds < 60) return 'Az önce';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} dakika önce`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} saat önce`;
      return `${Math.floor(diffInSeconds / 86400)} gün önce`;
    } catch (error) {
      console.error('Tarih formatlanırken hata:', error);
      return 'Bilinmeyen tarih';
    }
  };

  const getDeviceIcon = (userAgent: string): string => {
    if (userAgent.includes('iPhone') || userAgent.includes('Android')) return '📱';
    if (userAgent.includes('Mac')) return '💻';
    if (userAgent.includes('Windows')) return '💻';
    return '🖥️';
  };

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Profil Bilgileri</h3>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
          >
            ✏️ Düzenle
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-white/80 font-semibold mb-2">Ad Soyad *</label>
          <input
            type="text"
            value={profileData.fullName}
            onChange={(e) => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">E-posta</label>
          <input
            type="email"
            value={doctorProfile?.email || ''}
            disabled={true}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 cursor-not-allowed"
            title="E-posta adresi değiştirilemez"
          />
          <p className="text-white/50 text-xs mt-1">E-posta adresi güvenlik nedeniyle değiştirilemez</p>
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Uzmanlık</label>
          <input
            type="text"
            value={profileData.specialization}
            onChange={(e) => setProfileData(prev => ({ ...prev, specialization: e.target.value }))}
            disabled={!isEditing}
            placeholder="Örn: Dahiliye, Kardiyoloji"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Hastane</label>
          <input
            type="text"
            value={profileData.hospital}
            onChange={(e) => setProfileData(prev => ({ ...prev, hospital: e.target.value }))}
            disabled={!isEditing}
            placeholder="Hastane adı"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Bölüm</label>
          <input
            type="text"
            value={profileData.department}
            onChange={(e) => setProfileData(prev => ({ ...prev, department: e.target.value }))}
            disabled={!isEditing}
            placeholder="Bölüm adı"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Telefon</label>
          <input
            type="tel"
            value={profileData.phone}
            onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
            disabled={!isEditing}
            placeholder="0555 123 45 67"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div className="col-span-1 md:col-span-2">
          <label className="block text-white/80 font-semibold mb-2">Klinik Logosu</label>
          {isEditing ? (
            <div className="bg-white/10 rounded-xl p-4">
              <FileUpload
                onFileUpload={handleLogoUpload}
                onFileRemove={handleLogoRemove}
                uploadedFileUrl={profileData.logoUrl}
                fileName={logoFile ? logoFile.name : (profileData.logoUrl ? 'Mevcut Logo' : '')}
              />
              <p className="text-white/50 text-xs mt-2">
                PDF çıktılarında kullanılacak logo. PNG, JPG veya JPEG formatında yükleyebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 bg-white/10 rounded-xl p-4 border border-white/20">
              {profileData.logoUrl ? (
                <>
                  <div className="w-24 h-24 bg-white rounded-lg p-2 flex items-center justify-center overflow-hidden">
                    <img 
                      src={profileData.logoUrl} 
                      alt="Klinik Logosu" 
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-white font-medium">Klinik Logosu Yüklü</p>
                    <p className="text-white/60 text-sm">Bu logo tüm PDF çıktılarında kullanılacaktır.</p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 text-white/60">
                  <span className="text-2xl">🖼️</span>
                  <span>Logo yüklenmemiş</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="flex gap-4">
          <button
            onClick={handleSaveProfile}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={loading}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all duration-200 disabled:opacity-50"
          >
            İptal
          </button>
        </div>
      )}
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-white">Güvenlik Ayarları</h3>

      <div className="space-y-4">
        <div className="bg-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-white font-semibold">Şifre Değiştir</h4>
              <p className="text-white/70 text-sm">Hesap güvenliğiniz için şifrenizi güncelleyin</p>
            </div>
            <button 
              onClick={() => {
                setShowPasswordModal(true);
                resetPasswordForm();
              }}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 hover:text-blue-200 transition-all duration-200"
            >
              Değiştir
            </button>
          </div>
        </div>

        {/* Force Logout All Users - Only for authorized admin */}
        {isAuthorizedForceLogoutAdmin() && (
          <div className="bg-gradient-to-br from-red-900/20 to-orange-900/20 border border-red-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-white font-semibold flex items-center gap-2">
                  <span>🚨</span>
                  Tüm Kullanıcıları Çıkış Yaptır
                </h4>
                <p className="text-white/70 text-sm mt-1">
                  Tüm kullanıcıları tüm cihazlardan anında çıkış yaptırır (çevrimiçi ve çevrimdışı)
                </p>
                <p className="text-red-300/80 text-xs mt-2 font-medium">
                  ⚠️ Bu işlem geri alınamaz ve tüm aktif oturumları sonlandırır!
                </p>
              </div>
              <button
                onClick={handleSignOutAllUsers}
                disabled={isSigningOutAll}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-xl text-white font-semibold transition-all duration-200 hover:scale-105 shadow-lg flex items-center gap-2 whitespace-nowrap"
              >
                {isSigningOutAll ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Çıkış Yaptırılıyor...
                  </>
                ) : (
                  <>
                    🚪 Tümünü Çıkış Yaptır
                  </>
                )}
              </button>
            </div>
          </div>
        )}


        <div className="bg-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-white font-semibold">Oturum Geçmişi</h4>
              <p className="text-white/70 text-sm">Son giriş yapılan cihazları görüntüleyin</p>
            </div>
            <button
              onClick={() => setShowSessionHistory(!showSessionHistory)}
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 hover:text-purple-200 transition-all duration-200"
            >
              {showSessionHistory ? 'Gizle' : 'Görüntüle'}
            </button>
          </div>

          {showSessionHistory && (
            <div className="space-y-3 mt-4">
              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-white/60">Henüz oturum geçmişi bulunmuyor</div>
                </div>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${session.isActive ? 'bg-green-500/20' : 'bg-blue-500/20'
                        }`}>
                        <span className={`text-sm ${session.isActive ? 'text-green-400' : 'text-blue-400'
                          }`}>
                          {getDeviceIcon(session.userAgent)}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">{session.deviceName}</div>
                        <div className="text-white/60 text-sm">
                          {session.browser} - {session.ipAddress}
                        </div>
                        <div className="text-white/50 text-xs">{session.location}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white/80 text-sm">
                        {session.isActive ? 'Şu anda aktif' : formatTimeAgo(session.lastLogin)}
                      </div>
                      <div className="text-white/60 text-xs">
                        {session.lastLogin.toLocaleDateString('tr-TR')} {session.lastLogin.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {!session.isActive && (
                        <button
                          onClick={() => terminateSession(session.id)}
                          className="mt-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 hover:text-red-200 text-xs transition-all duration-200"
                        >
                          Sonlandır
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );



  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'security':
        return renderSecurityTab();
      default:
        return renderProfileTab();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Ayarlar</h1>
        <p className="text-white/70">Hesap ve sistem ayarlarınızı yönetin</p>
      </div>

      {/* Tabs */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all duration-200 ${activeTab === tab.id
                  ? 'bg-green-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="border-t border-white/20 pt-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Şifre Değiştir Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800/95 via-blue-900/95 to-slate-800/95 backdrop-blur-xl border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Şifre Değiştir</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  resetPasswordForm();
                }}
                className="text-white/60 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Mevcut Şifre
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Mevcut şifrenizi girin"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  >
                    {showCurrentPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Yeni Şifre
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Yeni şifrenizi girin"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  >
                    {showNewPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Yeni Şifre Tekrar
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Yeni şifrenizi tekrar girin"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm backdrop-blur-sm">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-3 text-green-300 text-sm backdrop-blur-sm">
                  {passwordSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    resetPasswordForm();
                  }}
                  className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all duration-200 hover:scale-105"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-blue-500/50 disabled:to-cyan-500/50 rounded-xl text-white font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
                >
                  {passwordLoading ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings; 