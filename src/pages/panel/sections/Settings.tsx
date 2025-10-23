import React, { useState, useEffect } from 'react';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profil', icon: '👤' },
    { id: 'security', label: 'Güvenlik', icon: '🔒' }
  ];

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
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200"
        >
          {isEditing ? 'İptal' : 'Düzenle'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-white/80 font-semibold mb-2">Ad Soyad</label>
          <input
            type="text"
            defaultValue={doctorProfile?.fullName || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">E-posta</label>
          <input
            type="email"
            defaultValue={doctorProfile?.email || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Uzmanlık</label>
          <input
            type="text"
            defaultValue={doctorProfile?.specialization || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Hastane</label>
          <input
            type="text"
            defaultValue={doctorProfile?.hospital || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Bölüm</label>
          <input
            type="text"
            defaultValue={doctorProfile?.department || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-white/80 font-semibold mb-2">Telefon</label>
          <input
            type="tel"
            defaultValue={doctorProfile?.phone || ''}
            disabled={!isEditing}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
      </div>

      {isEditing && (
        <div className="flex gap-4">
          <button className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-200">
            Kaydet
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all duration-200"
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
            <button className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 hover:text-blue-200 transition-all duration-200">
              Değiştir
            </button>
          </div>
        </div>


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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        session.isActive ? 'bg-green-500/20' : 'bg-blue-500/20'
                      }`}>
                        <span className={`text-sm ${
                          session.isActive ? 'text-green-400' : 'text-blue-400'
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all duration-200 ${
                activeTab === tab.id
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
    </div>
  );
};

export default Settings; 