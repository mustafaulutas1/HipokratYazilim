import React, { useState, useEffect } from 'react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../../firebase/config';

interface AppointmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any | null;
  onDeleted?: () => void;
  onStatusUpdated?: () => void;
}

const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({ isOpen, onClose, appointment, onDeleted, onStatusUpdated }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(appointment?.status || 'pending');
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Sync local status with appointment prop
  useEffect(() => {
    if (appointment?.status) {
      setCurrentStatus(appointment.status);
    }
  }, [appointment?.status]);
  
  if (!isOpen || !appointment) return null;

  const formatTime = (timeStr: string) => {
    return timeStr || '--:--';
  };

  const formatDate = (dateISO: string) => {
    if (!dateISO) return 'Belirtilmemiş';
    const date = new Date(dateISO);
    return date.toLocaleDateString('tr-TR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return '✅';
      case 'pending': return '⏳';
      case 'cancelled': return '❌';
      default: return '❓';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Onaylandı';
      case 'pending': return 'Beklemede';
      case 'cancelled': return 'İptal Edildi';
      default: return 'Bilinmiyor';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'from-green-500 to-emerald-600';
      case 'pending': return 'from-yellow-500 to-orange-600';
      case 'cancelled': return 'from-red-500 to-pink-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const duration = appointment.durationMinutes || appointment.duration || 30;
  const startTime = appointment.start || appointment.time;
  const endTime = startTime ? (() => {
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + duration;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  })() : '--:--';

  const handleDelete = async () => {
    if (!appointment.id) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'appointments', appointment.id));
      toast.success('Randevu başarıyla silindi!');
      onDeleted?.();
      onClose();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Randevu silinirken bir hata oluştu!');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!appointment.id) return;
    
    const newStatus = currentStatus === 'pending' ? 'confirmed' : 'pending';
    
    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 600);
    
    // Immediately update local state for instant UI feedback
    setCurrentStatus(newStatus);
    
    setIsUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'appointments', appointment.id), {
        status: newStatus
      });
      toast.success(`Randevu durumu "${newStatus === 'confirmed' ? 'Onaylandı' : 'Beklemede'}" olarak güncellendi!`);
      onStatusUpdated?.();
    } catch (error) {
      console.error('Error updating appointment status:', error);
      toast.error('Randevu durumu güncellenirken bir hata oluştu!');
      // Revert on error
      setCurrentStatus(currentStatus === 'pending' ? 'confirmed' : 'pending');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 ${isOpen ? '' : 'hidden'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-blue-900/90 to-slate-800/90 backdrop-blur-md animate-fadeIn" />
      
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-2xl bg-gradient-to-br from-white/98 to-gray-50/98 backdrop-blur-xl border border-white/30 rounded-3xl shadow-2xl transform animate-scaleIn overflow-hidden">
          
          {/* Header with Status */}
          <div className={`px-6 py-4 bg-gradient-to-r ${getStatusColor(currentStatus)} relative overflow-hidden transition-all duration-500 ease-in-out ${isAnimating ? 'scale-[1.02]' : 'scale-100'}`}>
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
            {isAnimating && (
              <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
            )}
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg transition-transform duration-500 ${isAnimating ? 'rotate-[360deg] scale-110' : 'rotate-0 scale-100'}`}>
                  <span className="text-white text-lg">👁️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Randevu Detayları</h2>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl transition-all duration-500 ${isAnimating ? 'scale-125 rotate-12' : 'scale-100 rotate-0'}`}>{getStatusIcon(currentStatus)}</span>
                    <span className={`text-white/90 font-semibold text-sm transition-all duration-500 ${isAnimating ? 'scale-105' : 'scale-100'}`}>{getStatusText(currentStatus)}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all duration-200 hover:scale-110 backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            
            {/* Patient & Type Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">👤</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Hasta Bilgileri</h3>
                  </div>
                </div>
                <div className="text-lg font-bold text-blue-700">{appointment.patientName || 'İsimsiz Hasta'}</div>
                <div className="text-blue-600 text-xs">ID: {appointment.patientId || 'Belirtilmemiş'}</div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🏥</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Randevu Tipi</h3>
                  </div>
                </div>
                <div className="text-lg font-bold text-green-700">{appointment.typeName || appointment.type || 'Genel Randevu'}</div>
                <div className="text-green-600 text-xs">Süre: {duration} dakika</div>
              </div>
            </div>

            {/* Date & Time */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">📅</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Tarih ve Saat</h3>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-white/60 rounded-lg">
                  <div className="text-purple-600 text-xs font-semibold mb-1">Tarih</div>
                  <div className="text-sm font-bold text-gray-800">{formatDate(appointment.dateISO)}</div>
                </div>
                <div className="text-center p-3 bg-white/60 rounded-lg">
                  <div className="text-purple-600 text-xs font-semibold mb-1">Başlangıç</div>
                  <div className="text-lg font-bold text-gray-800">{formatTime(startTime)}</div>
                </div>
                <div className="text-center p-3 bg-white/60 rounded-lg">
                  <div className="text-purple-600 text-xs font-semibold mb-1">Bitiş</div>
                  <div className="text-lg font-bold text-gray-800">{endTime}</div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4 border border-yellow-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-yellow-500 to-amber-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">📝</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Notlar</h3>
                  </div>
                </div>
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-gray-700 text-sm leading-relaxed">{appointment.notes}</p>
                </div>
              </div>
            )}

            {/* Doctor Info */}
            {appointment.doctorId && (
              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-4 border border-cyan-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">👨‍⚕️</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Doktor</h3>
                  </div>
                </div>
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-cyan-700 font-semibold text-sm">Doktor ID: {appointment.doctorId}</p>
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                <div className="text-lg mb-1">🆔</div>
                <div className="text-xs text-gray-500 font-semibold">ID</div>
                <div className="text-xs font-bold text-gray-700 truncate">{appointment.id}</div>
              </div>
              <div className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                <div className="text-lg mb-1">⏱️</div>
                <div className="text-xs text-gray-500 font-semibold">Süre</div>
                <div className="text-xs font-bold text-gray-700">{duration} dk</div>
              </div>
              <div className={`text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 transition-all duration-500 ${isAnimating ? 'scale-105 shadow-lg' : 'scale-100'}`}>
                <div className={`text-lg mb-1 transition-transform duration-500 ${isAnimating ? 'scale-125' : 'scale-100'}`}>📊</div>
                <div className="text-xs text-gray-500 font-semibold">Durum</div>
                <div className={`text-xs font-bold text-gray-700 transition-all duration-500 ${isAnimating ? 'scale-110' : 'scale-100'}`}>{getStatusText(currentStatus)}</div>
              </div>
              <div className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                <div className="text-lg mb-1">📋</div>
                <div className="text-xs text-gray-500 font-semibold">Tip</div>
                <div className="text-xs font-bold text-gray-700 truncate">{appointment.typeName || 'Genel'}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
            <div className="flex justify-between items-center gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <span>🗑️</span>
                Randevuyu Sil
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={handleStatusToggle}
                  disabled={isUpdatingStatus || currentStatus === 'cancelled'}
                  className={`px-6 py-3 ${
                    currentStatus === 'pending' 
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' 
                      : 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700'
                  } text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${isAnimating ? 'scale-110 shadow-2xl' : ''}`}
                >
                  {isUpdatingStatus ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Güncelleniyor...</span>
                    </>
                  ) : (
                    <>
                      <span className={`transition-transform duration-300 ${isAnimating ? 'rotate-[360deg]' : 'rotate-0'}`}>{currentStatus === 'pending' ? '✅' : '⏳'}</span>
                      <span>{currentStatus === 'pending' ? 'Onayla' : 'Beklet'}</span>
                    </>
                  )}
                </button>
                <button 
                  onClick={onClose}
                  className="px-8 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full transform animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-500 to-red-600 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <span className="text-white text-2xl">⚠️</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Randevuyu Sil</h3>
                  <p className="text-white/90 text-sm">Onay gerektiriyor</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="text-center">
                <h4 className="text-lg font-bold text-gray-800 mb-2">Emin misiniz?</h4>
                <p className="text-gray-600 text-sm mb-4">Bu işlem geri alınamaz. Randevu kalıcı olarak silinecektir.</p>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-red-800 font-semibold text-sm mb-2">Silinecek Randevu:</div>
                <div className="bg-red-100 rounded-lg p-3">
                  <div className="text-red-700 font-medium">{appointment.patientName}</div>
                  <div className="text-red-600 text-sm">{formatDate(appointment.dateISO)}</div>
                  <div className="text-red-600 text-sm">{formatTime(startTime)} - {endTime}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-3xl">
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  İptal
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Siliniyor...</span>
                    </>
                  ) : (
                    <>
                      <span>🗑️</span>
                      <span>Evet, Sil</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentDetailsModal;