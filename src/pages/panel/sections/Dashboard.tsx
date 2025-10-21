import React, { useState, useEffect } from 'react';
import { getRoleDisplayName } from '../../../constants/permissions';
import { useAuth } from '../../../context/AuthContext';
import { loggingService, type UserLog, type SessionLog } from '../../../services/loggingService';

interface DashboardProps {
  doctorProfile: any;
}

const Dashboard: React.FC<DashboardProps> = ({ doctorProfile }) => {
  const { user } = useAuth();
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [pageStats, setPageStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchLogData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const [userLogsData, , sessionData, pageStatsData] = await Promise.all([
        loggingService.getUserLogs(user.uid, 20),
        loggingService.getPageVisitLogs(user.uid, 20),
        loggingService.getSessionLogs(user.uid, 10),
        loggingService.getPageVisitStats(user.uid, 7),
        loggingService.getDailyActivityStats(user.uid, 7)
      ]);


      setUserLogs(userLogsData);
      setSessionLogs(sessionData);
      setPageStats(pageStatsData);
    } catch (error) {
      // Log verilerini yükleme hatası
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogData();
  }, [user]);
  const stats = [
    {
      title: 'Bugünkü Randevular',
      value: '8',
      change: '+2',
      changeType: 'positive',
      icon: '📅',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'Toplam Hasta',
      value: '156',
      change: '+12',
      changeType: 'positive',
      icon: '👥',
      color: 'from-green-500 to-emerald-500'
    },
    {
      title: 'Bekleyen Raporlar',
      value: '3',
      change: '-1',
      changeType: 'negative',
      icon: '📋',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      title: 'Aylık Gelir',
      value: '₺24,500',
      change: '+8%',
      changeType: 'positive',
      icon: '💰',
      color: 'from-purple-500 to-pink-500'
    }
  ];

  const logStats = [
    {
      title: 'Son 7 Gün Sayfa Ziyareti',
      value: Object.values(pageStats).reduce((sum, count) => sum + count, 0).toString(),
      change: '',
      changeType: 'neutral',
      icon: '📊',
      color: 'from-indigo-500 to-purple-500'
    },
    {
      title: 'Aktif Oturumlar',
      value: sessionLogs.filter(session => !session.logoutTime).length.toString(),
      change: '',
      changeType: 'neutral',
      icon: '🔄',
      color: 'from-green-500 to-teal-500'
    },
    {
      title: 'En Çok Ziyaret Edilen Sayfa',
      value: Object.keys(pageStats).length > 0 ? 
        Object.entries(pageStats).sort(([,a], [,b]) => b - a)[0][0].split('/').pop() || 'Ana Sayfa' : 
        'Veri Yok',
      change: '',
      changeType: 'neutral',
      icon: '🏆',
      color: 'from-orange-500 to-red-500'
    },
    {
      title: 'Toplam Aktivite',
      value: userLogs.length.toString(),
      change: '',
      changeType: 'neutral',
      icon: '📈',
      color: 'from-pink-500 to-rose-500'
    }
  ];

  // Giriş ve çıkış saatlerini hesapla
  const getLoginLogoutStats = () => {
    const loginLogs = userLogs.filter(log => log.action === 'login');
    const logoutLogs = userLogs.filter(log => log.action === 'logout');
    
    const today = new Date().toDateString();
    const todayLoginLogs = loginLogs.filter(log => log.timestamp.toDateString() === today);
    const todayLogoutLogs = logoutLogs.filter(log => log.timestamp.toDateString() === today);
    
    return {
      todayLogins: todayLoginLogs,
      todayLogouts: todayLogoutLogs,
      lastLogin: loginLogs.length > 0 ? loginLogs[0].timestamp : null,
      lastLogout: logoutLogs.length > 0 ? logoutLogs[0].timestamp : null
    };
  };

  const loginLogoutStats = getLoginLogoutStats();

  const recentActivities = [
    {
      id: 1,
      type: 'appointment',
      title: 'Yeni randevu oluşturuldu',
      description: 'Ahmet Yılmaz - 14:30',
      time: '2 saat önce',
      icon: '📅'
    },
    {
      id: 2,
      type: 'patient',
      title: 'Yeni hasta kaydı',
      description: 'Fatma Demir eklendi',
      time: '4 saat önce',
      icon: '👤'
    },
    {
      id: 3,
      type: 'report',
      title: 'Rapor tamamlandı',
      description: 'Mehmet Kaya - Laboratuvar sonuçları',
      time: '6 saat önce',
      icon: '📋'
    },
    {
      id: 4,
      type: 'payment',
      title: 'Ödeme alındı',
      description: '₺500 - Ayşe Özkan',
      time: '1 gün önce',
      icon: '💰'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Hoş Geldiniz, {doctorProfile?.fullName || 'Doktor'}! 👨‍⚕️
            </h1>
            <p className="text-white/70 text-lg">
              {getRoleDisplayName(doctorProfile?.userType)}
              {doctorProfile?.specialization && ` • ${doctorProfile.specialization}`}
              {doctorProfile?.hospital && ` • ${doctorProfile.hospital}`}
              {doctorProfile?.department && ` • ${doctorProfile.department}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-white/60 text-sm">Bugün</div>
            <div className="text-2xl font-bold text-white">
              {new Date().toLocaleDateString('tr-TR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <span className="text-white text-xl">{stat.icon}</span>
              </div>
              <div className={`text-sm font-semibold ${
                stat.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
              }`}>
                {stat.change}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-white/70 text-sm">{stat.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Log Statistics Grid */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">📊 Kullanıcı Aktivite İstatistikleri</h2>
          <button 
            onClick={fetchLogData}
            disabled={loading}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 hover:text-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Yükleniyor...' : '🔄 Yenile'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {logStats.map((stat, index) => (
            <div key={index} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center shadow-lg`}>
                  <span className="text-white text-lg">{stat.icon}</span>
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-white/70 text-xs">{stat.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Appointments */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Bugünkü Randevular</h2>
            <button className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-xl text-green-300 hover:text-green-200 transition-all duration-200">
              Tümünü Gör
            </button>
          </div>
          
          <div className="space-y-4">
            {[
              { time: '09:00', patient: 'Ahmet Yılmaz', type: 'Kontrol', status: 'confirmed' },
              { time: '10:30', patient: 'Fatma Demir', type: 'İlk Muayene', status: 'confirmed' },
              { time: '12:00', patient: 'Mehmet Kaya', type: 'Kontrol', status: 'pending' },
              { time: '14:30', patient: 'Ayşe Özkan', type: 'Laboratuvar', status: 'confirmed' },
              { time: '16:00', patient: 'Ali Veli', type: 'Kontrol', status: 'cancelled' }
            ].map((appointment, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                <div className="text-center">
                  <div className="text-white font-semibold">{appointment.time}</div>
                  <div className="text-white/60 text-xs">Saat</div>
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold">{appointment.patient}</div>
                  <div className="text-white/70 text-sm">{appointment.type}</div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  appointment.status === 'confirmed' ? 'bg-green-500/20 text-green-300' :
                  appointment.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-red-500/20 text-red-300'
                }`}>
                  {appointment.status === 'confirmed' ? 'Onaylandı' :
                   appointment.status === 'pending' ? 'Beklemede' : 'İptal'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Activity Logs */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">📝 Son Aktiviteler</h2>
            <button className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all duration-200 text-sm">
              Detay
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-white/70 text-center py-4">Yükleniyor...</div>
            ) : userLogs.length > 0 ? (
              userLogs.slice(0, 10).map((log) => {
                const details = log.details || {};
                const sectionName = details.sectionName || log.page?.split('/').pop() || 'Ana Sayfa';
                const userName = details.userName || 'Kullanıcı';
                const userRole = details.userRole || 'user';
                
                return (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
                    <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                      <span className="text-sm">
                        {log.action === 'login' ? '🔐' : 
                         log.action === 'logout' ? '🚪' : 
                         log.action === 'page_visit' ? '👁️' : '🔄'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold text-sm">
                        {log.action === 'login' ? 'Giriş Yapıldı' : 
                         log.action === 'logout' ? 'Çıkış Yapıldı' : 
                         log.action === 'page_visit' ? 'Sayfa Ziyaret Edildi' : 
                         details.action || 'Panel Bölümü Değiştirildi'}
                      </div>
                      <div className="text-white/70 text-xs truncate">
                        {log.action === 'navigation' && details.sectionName ? 
                          `${sectionName}` : 
                          log.page || 'Ana Sayfa'}
                      </div>
                      <div className="text-white/50 text-xs">
                        {new Date(log.timestamp).toLocaleString('tr-TR')}
                      </div>
                      {log.action === 'navigation' && details.userRole && (
                        <div className="text-white/40 text-xs mt-1">
                          👤 {userName} ({userRole})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-white/70 text-center py-4">Henüz aktivite kaydı yok</div>
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Son Aktiviteler</h2>
          
          <div className="space-y-4">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
                <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                  <span className="text-sm">{activity.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-sm">{activity.title}</div>
                  <div className="text-white/70 text-xs">{activity.description}</div>
                  <div className="text-white/50 text-xs mt-1">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Login/Logout Times */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">🕒 Giriş/Çıkış Saatleri</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bugünkü Girişler */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <span className="text-green-300 text-lg">🔐</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">Bugünkü Girişler</h3>
                <p className="text-white/70 text-sm">{loginLogoutStats.todayLogins.length} giriş</p>
              </div>
            </div>
            
            <div className="space-y-2">
              {loginLogoutStats.todayLogins.length > 0 ? (
                loginLogoutStats.todayLogins.map((log, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                    <span className="text-white/80 text-sm">Giriş #{index + 1}</span>
                    <span className="text-green-300 text-sm font-mono">
                      {log.timestamp.toLocaleTimeString('tr-TR', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-white/50 text-sm text-center py-4">Bugün henüz giriş yapılmamış</div>
              )}
            </div>
          </div>

          {/* Bugünkü Çıkışlar */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <span className="text-red-300 text-lg">🚪</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">Bugünkü Çıkışlar</h3>
                <p className="text-white/70 text-sm">{loginLogoutStats.todayLogouts.length} çıkış</p>
              </div>
            </div>
            
            <div className="space-y-2">
              {loginLogoutStats.todayLogouts.length > 0 ? (
                loginLogoutStats.todayLogouts.map((log, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                    <span className="text-white/80 text-sm">Çıkış #{index + 1}</span>
                    <span className="text-red-300 text-sm font-mono">
                      {log.timestamp.toLocaleTimeString('tr-TR', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-white/50 text-sm text-center py-4">Bugün henüz çıkış yapılmamış</div>
              )}
            </div>
          </div>
        </div>

        {/* Son Giriş/Çıkış Özeti */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-green-400 text-lg">🔑</span>
              <h4 className="text-white font-semibold text-sm">Son Giriş</h4>
            </div>
            {loginLogoutStats.lastLogin ? (
              <div className="text-white/70 text-sm">
                <div className="font-mono">
                  {loginLogoutStats.lastLogin.toLocaleDateString('tr-TR')} - {loginLogoutStats.lastLogin.toLocaleTimeString('tr-TR')}
                </div>
              </div>
            ) : (
              <div className="text-white/50 text-sm">Henüz giriş yapılmamış</div>
            )}
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-red-400 text-lg">🔒</span>
              <h4 className="text-white font-semibold text-sm">Son Çıkış</h4>
            </div>
            {loginLogoutStats.lastLogout ? (
              <div className="text-white/70 text-sm">
                <div className="font-mono">
                  {loginLogoutStats.lastLogout.toLocaleDateString('tr-TR')} - {loginLogoutStats.lastLogout.toLocaleTimeString('tr-TR')}
                </div>
              </div>
            ) : (
              <div className="text-white/50 text-sm">Henüz çıkış yapılmamış</div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Log Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Page Visit Statistics */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">📈 Sayfa Ziyaret İstatistikleri</h2>
          
          <div className="space-y-4">
            {loading ? (
              <div className="text-white/70 text-center py-4">Yükleniyor...</div>
            ) : Object.keys(pageStats).length > 0 ? (
              Object.entries(pageStats)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 8)
                .map(([page, count]) => (
                  <div key={page} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <span className="text-blue-300 text-sm">📄</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold text-sm">
                          {page.split('/').pop() || 'Ana Sayfa'}
                        </div>
                        <div className="text-white/70 text-xs">{page}</div>
                      </div>
                    </div>
                    <div className="text-white font-bold text-lg">{count}</div>
                  </div>
                ))
            ) : (
              <div className="text-white/70 text-center py-4">Henüz sayfa ziyaret verisi yok</div>
            )}
          </div>
        </div>

        {/* Session Information */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">🕒 Oturum Bilgileri</h2>
          
          <div className="space-y-4">
            {loading ? (
              <div className="text-white/70 text-center py-4">Yükleniyor...</div>
            ) : sessionLogs.length > 0 ? (
              sessionLogs.slice(0, 5).map((session) => (
                <div key={session.id} className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white font-semibold text-sm">
                      Oturum #{session.sessionId.slice(-8)}
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      session.logoutTime ? 'bg-gray-500/20 text-gray-300' : 'bg-green-500/20 text-green-300'
                    }`}>
                      {session.logoutTime ? 'Sonlandı' : 'Aktif'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-white/70 text-xs">
                      <span className="font-semibold">Giriş:</span> {new Date(session.loginTime).toLocaleString('tr-TR')}
                    </div>
                    {session.logoutTime && (
                      <div className="text-white/70 text-xs">
                        <span className="font-semibold">Çıkış:</span> {new Date(session.logoutTime).toLocaleString('tr-TR')}
                      </div>
                    )}
                    <div className="text-white/70 text-xs">
                      <span className="font-semibold">Sayfa Ziyareti:</span> {session.totalPagesVisited}
                    </div>
                    <div className="text-white/70 text-xs">
                      <span className="font-semibold">Son Aktivite:</span> {new Date(session.lastActivity).toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-white/70 text-center py-4">Henüz oturum kaydı yok</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">Hızlı İşlemler</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '👤', label: 'Yeni Hasta', color: 'from-blue-500 to-cyan-500' },
            { icon: '📅', label: 'Randevu Oluştur', color: 'from-green-500 to-emerald-500' },
            { icon: '📋', label: 'Rapor Yaz', color: 'from-yellow-500 to-orange-500' },
            { icon: '💰', label: 'Fatura Oluştur', color: 'from-purple-500 to-pink-500' }
          ].map((action, index) => (
            <button
              key={index}
              className="flex flex-col items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-200 group"
            >
              <div className={`w-12 h-12 bg-gradient-to-br ${action.color} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                <span className="text-white text-xl">{action.icon}</span>
              </div>
              <span className="text-white font-semibold text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 