import React, { useState } from 'react';

interface SettingsProps {
  doctorProfile: any;
}

const Settings: React.FC<SettingsProps> = ({ doctorProfile }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [isEditing, setIsEditing] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profil', icon: '👤' },
    { id: 'security', label: 'Güvenlik', icon: '🔒' }
  ];

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
              <h4 className="text-white font-semibold">İki Faktörlü Doğrulama</h4>
              <p className="text-white/70 text-sm">Ek güvenlik için SMS doğrulaması ekleyin</p>
            </div>
            <button className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200">
              Aktifleştir
            </button>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-white font-semibold">Oturum Geçmişi</h4>
              <p className="text-white/70 text-sm">Son giriş yapılan cihazları görüntüleyin</p>
            </div>
            <button className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 hover:text-purple-200 transition-all duration-200">
              Görüntüle
            </button>
          </div>
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