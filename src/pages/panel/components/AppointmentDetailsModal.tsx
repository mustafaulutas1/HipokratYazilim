import React, { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc, collection, addDoc, query, where, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../../firebase/config';

interface AppointmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any | null;
  onCancelled?: () => void;
  onStatusUpdated?: () => void;
  onNavigate?: (section: string) => void;
}

const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({ isOpen, onClose, appointment, onCancelled, onStatusUpdated, onNavigate }) => {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingArrival, setIsUpdatingArrival] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(appointment?.status || 'pending');
  const [patientArrived, setPatientArrived] = useState(appointment?.patientArrived || false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  // Sync local status with appointment prop
  useEffect(() => {
    if (appointment?.status) {
      setCurrentStatus(appointment.status);
    }
    if (appointment?.patientArrived !== undefined) {
      setPatientArrived(appointment.patientArrived);
    }
  }, [appointment?.status, appointment?.patientArrived]);
  
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

  const handleCancel = async () => {
    if (!appointment.id) return;
    if (!cancelReason.trim()) return; // Required validation
    
    setIsCancelling(true);
    try {
      await updateDoc(doc(db, 'appointments', appointment.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelReason: cancelReason.trim()
      });

      // Delete associated anamnez record when appointment is cancelled
      try {
        const anamrezQuery = query(
          collection(db, 'anamrezRecords'),
          where('appointmentId', '==', appointment.id)
        );
        const anamrezSnapshot = await getDocs(anamrezQuery);
        
        for (const anamrezDoc of anamrezSnapshot.docs) {
          await deleteDoc(doc(db, 'anamrezRecords', anamrezDoc.id));
        }
        
        if (!anamrezSnapshot.empty) {
          console.log('Anamnez record(s) deleted for cancelled appointment');
        }
      } catch (anamrezError) {
        console.error('Error deleting anamnez record:', anamrezError);
      }

      setCurrentStatus('cancelled');
      toast.success('Randevu başarıyla iptal edildi!');
      onCancelled?.();
      onClose();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      toast.error('Randevu iptal edilirken bir hata oluştu!');
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
      setCancelReason('');
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

      // When appointment is confirmed, route based on type
      if (newStatus === 'confirmed' && appointment.patientId) {
        const typeName = (appointment.typeName || '').toLowerCase();
        console.log('📋 Appointment typeName:', appointment.typeName, '→ lowercase:', typeName);

        if (typeName.includes('tedavi')) {
          // Tedavi appointments go to Treatment first, then to Accounting after treatment
          try {
            const patientRef = doc(db, 'patients', appointment.patientId);
            const patientDoc = await getDoc(patientRef);
            console.log('📋 Patient document exists:', patientDoc.exists(), 'ID:', appointment.patientId);
            
            if (patientDoc.exists()) {
              await updateDoc(patientRef, {
                status: 'anamnez_completed',
                isAnamnezCompleted: true,
                appointmentType: 'tedavi',
                anamrezCompletedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              console.log('✅ Patient status updated to anamnez_completed (tedavi)');
              toast.success('Hasta Asistan Ekranına yönlendirildi!');
              onNavigate?.('assistant-panel');
            } else {
              // Patient doesn't exist, create with minimal data
              await setDoc(patientRef, {
                fullName: appointment.patientName || 'Hasta',
                phone: appointment.patientPhone || '',
                clinicId: appointment.clinicId || 'default-clinic',
                status: 'anamnez_completed',
                isAnamnezCompleted: true,
                appointmentType: 'tedavi',
                anamrezCompletedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              console.log('✅ New patient document created with anamnez_completed status (tedavi)');
              toast.success('Hasta Asistan Ekranına yönlendirildi!');
              onNavigate?.('assistant-panel');
            }
          } catch (err) {
            console.error('Error updating patient for treatment:', err);
            toast.warning('Randevu onaylandı, ancak hasta tedavi ekranına yönlendirilemedi.');
          }
        } else {
          // Kontrol / other types go through normal anamnez flow AND create accounting record
          try {
            const patientRef = doc(db, 'patients', appointment.patientId);
            const patientDoc = await getDoc(patientRef);
            
            // Update patient with treatment_decided status so it appears in Accounting
            if (patientDoc.exists()) {
              const existingData = patientDoc.data();
              await updateDoc(patientRef, {
                status: 'treatment_decided',
                appointmentType: 'kontrol',
                treatmentStartedAt: new Date().toISOString(),
                paymentCompleted: false,
                // Keep existing payment amount if set, otherwise use default or 0
                paymentAmount: existingData.paymentAmount || 0,
                updatedAt: new Date().toISOString(),
              });
            } else {
              // Create patient record with treatment_decided status
              await setDoc(patientRef, {
                fullName: appointment.patientName || 'Hasta',
                tcNo: appointment.patientTcNo || '',
                phone: appointment.patientPhone || '',
                clinicId: appointment.clinicId || 'default-clinic',
                status: 'treatment_decided',
                appointmentType: 'kontrol',
                treatmentStartedAt: new Date().toISOString(),
                paymentCompleted: false,
                paymentAmount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
            console.log('✅ Patient record created/updated for accounting');
            
            // Create anamnez record
            const existingAnamrezQuery = query(
              collection(db, 'anamrezRecords'),
              where('appointmentId', '==', appointment.id)
            );
            const existingSnapshot = await getDocs(existingAnamrezQuery);

            if (existingSnapshot.empty) {
              await addDoc(collection(db, 'anamrezRecords'), {
                appointmentId: appointment.id,
                appointmentDate: appointment.dateISO,
                patientId: appointment.patientId,
                patientName: appointment.patientName || '',
                clinicId: appointment.clinicId || '',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              console.log('✅ Anamnez kaydı oluşturuldu');
              toast.success('Anamnez kaydı oluşturuldu ve hasta muhasebe kısmına eklendi!');
            }
          } catch (anamrezError) {
            console.error('Error creating anamnez:', anamrezError);
            toast.warning('Randevu onaylandı, ancak anamnez kaydı oluşturulamadı.');
          }
        }
      }

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

  const handlePatientArrival = async () => {
    if (!appointment.id) return;

    setIsUpdatingArrival(true);
    try {
      const newArrivalStatus = !patientArrived;
      await updateDoc(doc(db, 'appointments', appointment.id), {
        patientArrived: newArrivalStatus,
        arrivedAt: newArrivalStatus ? new Date().toISOString() : null
      });

      // If marking as "Gelmedi" (not arrived), delete associated anamnez record
      if (!newArrivalStatus) {
        try {
          const anamrezQuery = query(
            collection(db, 'anamrezRecords'),
            where('appointmentId', '==', appointment.id)
          );
          const anamrezSnapshot = await getDocs(anamrezQuery);
          
          for (const anamrezDoc of anamrezSnapshot.docs) {
            await deleteDoc(doc(db, 'anamrezRecords', anamrezDoc.id));
          }
          
          if (!anamrezSnapshot.empty) {
            console.log('Anamnez record(s) deleted - patient did not arrive');
          }
        } catch (anamrezError) {
          console.error('Error deleting anamnez record:', anamrezError);
        }
      }

      setPatientArrived(newArrivalStatus);
      toast.success(newArrivalStatus ? 'Hasta geldi olarak işaretlendi!' : 'Hasta gelmedi olarak işaretlendi, anamnez silindi!');
      onStatusUpdated?.();
    } catch (error) {
      console.error('Error updating patient arrival:', error);
      toast.error('Hasta durumu güncellenirken bir hata oluştu!');
    } finally {
      setIsUpdatingArrival(false);
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

            {/* Cancel Reason - Show if appointment is cancelled */}
            {currentStatus === 'cancelled' && appointment.cancelReason && (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🚫</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">İptal Sebebi</h3>
                  </div>
                </div>
                <div className="bg-white/60 rounded-lg p-3">
                  <p className="text-red-700 text-sm leading-relaxed">{appointment.cancelReason}</p>
                  {appointment.cancelledAt && (
                    <p className="text-red-400 text-xs mt-2">
                      İptal tarihi: {new Date(appointment.cancelledAt).toLocaleDateString('tr-TR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-5 gap-3">
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
              <div className={`text-center p-3 rounded-lg border transition-all duration-300 ${patientArrived ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}>
                <div className="text-lg mb-1">{patientArrived ? '✅' : '🚶'}</div>
                <div className="text-xs text-gray-500 font-semibold">Hasta</div>
                <div className={`text-xs font-bold ${patientArrived ? 'text-green-700' : 'text-gray-700'}`}>{patientArrived ? 'Geldi' : 'Bekleniyor'}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
            <div className="flex justify-between items-center gap-3">
              <button 
                onClick={() => setShowCancelConfirm(true)}
                disabled={currentStatus === 'cancelled'}
                className={`px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 ${currentStatus === 'cancelled' ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
              >
                <span>🚫</span>
                Randevuyu İptal Et
              </button>
              <div className="flex gap-3">
                {/* Patient Arrived Button - Only show when appointment is confirmed */}
                {currentStatus === 'confirmed' && (
                  <button 
                    onClick={handlePatientArrival}
                    disabled={isUpdatingArrival}
                    className={`px-6 py-3 ${
                      patientArrived 
                        ? 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700' 
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                    } text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                  >
                    {isUpdatingArrival ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Güncelleniyor...</span>
                      </>
                    ) : (
                      <>
                        <span>{patientArrived ? '❌' : '✅'}</span>
                        <span>{patientArrived ? 'Gelmedi' : 'Hasta Geldi'}</span>
                      </>
                    )}
                  </button>
                )}
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

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4" onClick={() => setShowCancelConfirm(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full transform animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-orange-500 to-red-600 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <span className="text-white text-2xl">🚫</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Randevuyu İptal Et</h3>
                  <p className="text-white/90 text-sm">Onay gerektiriyor</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="text-center">
                <h4 className="text-lg font-bold text-gray-800 mb-2">Emin misiniz?</h4>
                <p className="text-gray-600 text-sm mb-4">Bu randevu iptal edilecek ve takvimde iptal edilmiş olarak görünecektir.</p>
              </div>
              
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="text-orange-800 font-semibold text-sm mb-2">İptal Edilecek Randevu:</div>
                <div className="bg-orange-100 rounded-lg p-3">
                  <div className="text-orange-700 font-medium">{appointment.patientName}</div>
                  <div className="text-orange-600 text-sm">{formatDate(appointment.dateISO)}</div>
                  <div className="text-orange-600 text-sm">{formatTime(startTime)} - {endTime}</div>
                </div>
              </div>
              
              {/* Cancel Reason */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 İptal Sebebi <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Randevu iptal sebebini yazın..."
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-gray-700 ${!cancelReason.trim() ? 'border-red-300 bg-red-50/50' : 'border-gray-300'}`}
                  rows={3}
                  required
                />
                {!cancelReason.trim() && (
                  <p className="text-red-500 text-xs mt-1">İptal sebebi zorunludur</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-3xl">
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Vazgeç
                </button>
                <button 
                  onClick={handleCancel}
                  disabled={isCancelling || !cancelReason.trim()}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isCancelling ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>İptal Ediliyor...</span>
                    </>
                  ) : (
                    <>
                      <span>🚫</span>
                      <span>Evet, İptal Et</span>
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