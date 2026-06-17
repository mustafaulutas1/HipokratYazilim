import React, { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../../firebase/config';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface MoveAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: any | null;
  doctorProfile?: any;
  onMoved?: () => void;
}

type MoveType = 'straight' | 'cancel_reappoint';

const WORK_START = '08:45';
const WORK_END = '19:00';

function timeToMinutes(t: string) { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; }
function minutesToTime(mins: number) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
function isoToDate(iso: string): Date {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}
function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MoveAppointmentModal: React.FC<MoveAppointmentModalProps> = ({ isOpen, onClose, appointment, doctorProfile, onMoved }) => {
  const [moveType, setMoveType] = useState<MoveType>('straight');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startHour, setStartHour] = useState<number>(9);
  const [startMinute, setStartMinute] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState('');
  const [dayAppointments, setDayAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const duration: number = appointment?.durationMinutes ?? appointment?.duration ?? 30;
  const clinicId = appointment?.clinicId || doctorProfile?.clinicId;
  const startTime = useMemo(() => `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`, [startHour, startMinute]);

  const originalDateISO = appointment?.dateISO || '';
  const originalStart = appointment?.start || appointment?.time || '';

  // Initialize fields from the appointment when opened
  useEffect(() => {
    if (!isOpen || !appointment) return;
    setMoveType('straight');
    setError('');
    setCancelReason('');
    if (appointment.dateISO) setSelectedDate(isoToDate(appointment.dateISO));
    const s = appointment.start || appointment.time;
    if (s) {
      const [hh, mm] = String(s).split(':').map((n: string) => parseInt(n, 10));
      setStartHour(hh);
      setStartMinute(mm);
    }
  }, [isOpen, appointment]);

  // Fetch same-day appointments (clinic-scoped) for conflict detection
  useEffect(() => {
    if (!isOpen || !appointment) return;
    (async () => {
      const dateISO = dateToISO(selectedDate);
      const snap = await getDocs(query(collection(db, 'appointments'), where('dateISO', '==', dateISO)));
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(x => (!clinicId || x.clinicId === clinicId) && x.id !== appointment.id);
      setDayAppointments(list);
    })();
  }, [isOpen, selectedDate, appointment, clinicId]);

  // Suggest a default cancellation reason when switching to "cancel & re-appoint"
  useEffect(() => {
    if (moveType !== 'cancel_reappoint') return;
    if (cancelReason.trim()) return;
    const fromStr = originalDateISO ? `${isoToDate(originalDateISO).toLocaleDateString('tr-TR')} ${originalStart}` : '-';
    const toStr = `${selectedDate.toLocaleDateString('tr-TR')} ${startTime}`;
    setCancelReason(`Randevu ${fromStr} tarihinden ${toStr} tarihine alındı.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveType]);

  const minSelectableTimeToday = useMemo(() => {
    if (selectedDate.toDateString() !== new Date().toDateString()) return null;
    const now = new Date();
    let mins = now.getHours() * 60 + now.getMinutes();
    mins = Math.ceil(mins / 5) * 5;
    return minutesToTime(Math.max(mins, timeToMinutes(WORK_START)));
  }, [selectedDate]);

  const allTimeSlots = useMemo(() => {
    const slots: { time: string; available: boolean; isPast: boolean; hasConflict: boolean }[] = [];
    const startMinutes = timeToMinutes(WORK_START);
    const endMinutes = timeToMinutes(WORK_END);
    for (let time = startMinutes; time <= endMinutes; time += 5) {
      const timeStr = minutesToTime(time);
      const hasConflict = dayAppointments.some(a => {
        if (a.status === 'cancelled') return false;
        const apptStart = timeToMinutes(a.start ?? a.time);
        return apptStart >= time && apptStart < time + 5;
      });
      const isPast = !!minSelectableTimeToday && timeToMinutes(timeStr) < timeToMinutes(minSelectableTimeToday);
      slots.push({ time: timeStr, available: !hasConflict && !isPast, isPast, hasConflict });
    }
    return slots;
  }, [dayAppointments, minSelectableTimeToday]);

  const endTime = useMemo(() => minutesToTime(timeToMinutes(startTime) + duration), [startTime, duration]);

  const isUnchanged = dateToISO(selectedDate) === originalDateISO && startTime === originalStart;

  const handleMove = async () => {
    if (!appointment?.id) return;
    setError('');

    if (timeToMinutes(startTime) < timeToMinutes(WORK_START) || timeToMinutes(startTime) > timeToMinutes(WORK_END)) {
      return setError('Seçilen saat mesai saatleri dışında.');
    }
    if (moveType === 'straight' && isUnchanged) {
      return setError('Lütfen yeni bir tarih veya saat seçin.');
    }
    if (moveType === 'cancel_reappoint' && !cancelReason.trim()) {
      return setError('İptal sebebi zorunludur.');
    }

    // Final overlap check
    const newStartMin = timeToMinutes(startTime);
    const overlap = dayAppointments.some(a => {
      if (a.status === 'cancelled') return false;
      const s = timeToMinutes(a.start ?? a.time);
      const e = s + (a.durationMinutes ?? a.duration ?? 30);
      return Math.max(newStartMin, s) < Math.min(newStartMin + duration, e);
    });
    if (overlap) {
      setError('Seçilen zaman aralığı dolu. Lütfen başka bir saat seçin.');
      toast.error('Seçilen zaman aralığı dolu.');
      return;
    }

    const newDateISO = dateToISO(selectedDate);
    setLoading(true);
    try {
      if (moveType === 'straight') {
        await updateDoc(doc(db, 'appointments', appointment.id), {
          dateISO: newDateISO,
          start: startTime,
          updatedAt: new Date().toISOString(),
        });
        toast.success('Randevu başarıyla taşındı!');
      } else {
        // Cancel the original (with reason) and create a fresh appointment at the new spot
        await updateDoc(doc(db, 'appointments', appointment.id), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: cancelReason.trim(),
        });

        // Remove any anamnez records tied to the cancelled appointment
        try {
          const anamrezSnap = await getDocs(
            query(collection(db, 'anamrezRecords'), where('appointmentId', '==', appointment.id))
          );
          for (const a of anamrezSnap.docs) {
            await deleteDoc(doc(db, 'anamrezRecords', a.id));
          }
        } catch (e) {
          console.error('Error deleting anamnez for moved appointment:', e);
        }

        const newAppointment: any = {
          patientId: appointment.patientId || null,
          patientName: appointment.patientName || 'Hasta',
          typeId: appointment.typeId || null,
          typeName: appointment.typeName || appointment.type || '',
          durationMinutes: duration,
          dateISO: newDateISO,
          start: startTime,
          status: 'pending',
          doctorId: appointment.doctorId || doctorProfile?.uid || null,
          notes: appointment.notes || '',
          clinicId: clinicId || 'default-clinic',
          movedFromId: appointment.id,
          createdAt: new Date().toISOString(),
        };
        if (appointment.patientPhone) newAppointment.patientPhone = appointment.patientPhone;
        if (appointment.routineProgramId) newAppointment.routineProgramId = appointment.routineProgramId;

        await addDoc(collection(db, 'appointments'), newAppointment);
        toast.success('Randevu iptal edildi ve yeni randevu oluşturuldu!');
      }
      onMoved?.();
      onClose();
    } catch (err) {
      console.error('Error moving appointment:', err);
      setError('Taşıma sırasında bir hata oluştu.');
      toast.error('Randevu taşınırken bir hata oluştu!');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !appointment) return null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/80 to-slate-800/80 backdrop-blur-sm animate-fadeIn" />
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-white/95 to-gray-50/95 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl animate-scaleIn">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-200/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-xl">↔️</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">Randevuyu Taşı</h3>
                  <p className="text-gray-600 text-sm">
                    {appointment.patientName} • {originalDateISO ? isoToDate(originalDateISO).toLocaleDateString('tr-TR') : '-'} {originalStart}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all duration-200 hover:scale-110">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {/* Move type selector */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">Taşıma Türü</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMoveType('straight')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    moveType === 'straight'
                      ? 'border-green-500 bg-green-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">✅</span>
                    <span className="font-bold text-gray-800">Düz Taşıma</span>
                  </div>
                  <p className="text-xs text-gray-500">Sorunsuz erteleme. Randevu yeni tarih/saate taşınır, iptal kaydı oluşmaz.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMoveType('cancel_reappoint')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    moveType === 'cancel_reappoint'
                      ? 'border-orange-500 bg-orange-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🚫</span>
                    <span className="font-bold text-gray-800">İptal Et & Yeniden Planla</span>
                  </div>
                  <p className="text-xs text-gray-500">Mevcut randevu iptal edilir (iptal sebebi ile) ve yeni bir randevu oluşturulur.</p>
                </button>
              </div>
            </div>

            {/* Cancel reason — only for cancel & re-appoint */}
            {moveType === 'cancel_reappoint' && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 animate-slideDown">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 İptal Sebebi <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="İptal sebebini yazın..."
                  rows={2}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-gray-700 ${!cancelReason.trim() ? 'border-red-300 bg-red-50/50' : 'border-gray-300 bg-white'}`}
                />
                {!cancelReason.trim() && <p className="text-red-500 text-xs mt-1">İptal sebebi zorunludur</p>}
              </div>
            )}

            {/* Date + time picker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* New date */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span className="text-purple-500">📅</span> Yeni Tarih
                </label>
                <div className="bg-white/90 backdrop-blur-sm border border-purple-300/50 rounded-2xl p-3 shadow-sm">
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                    className="w-full"
                    styles={{
                      root: { width: '100%', maxWidth: '100%' },
                      month: { fontSize: '14px', width: '100%' },
                      caption: { fontSize: '16px', marginBottom: '8px' },
                      table: { fontSize: '13px', width: '100%', maxWidth: '100%', tableLayout: 'fixed' },
                      cell: { padding: 0, textAlign: 'center' },
                      day: { fontSize: '13px', height: '40px', width: '100%', margin: 0 },
                      head_cell: { fontSize: '12px', padding: '6px 0', textAlign: 'center' },
                      nav: { fontSize: '14px' },
                    }}
                  />
                </div>
              </div>

              {/* New time */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span className="text-green-500">🕒</span> Yeni Saat ({selectedDate.toLocaleDateString('tr-TR')})
                </label>
                <div className="bg-white/90 backdrop-blur-sm border border-green-300/50 rounded-2xl shadow-sm">
                  <div className="grid grid-cols-3 gap-2 p-4 max-h-80 overflow-y-auto">
                    {allTimeSlots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => {
                          const [h, m] = slot.time.split(':').map(Number);
                          setStartHour(h);
                          setStartMinute(m);
                        }}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 font-medium ${
                          slot.isPast
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                            : slot.hasConflict
                              ? 'bg-red-100 text-red-400 border-red-200 cursor-not-allowed opacity-60'
                              : startTime === slot.time
                                ? 'bg-green-600 text-white border-green-700 shadow-md hover:scale-105'
                                : 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:scale-105'
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between bg-white/70 border border-gray-200 rounded-xl px-4 py-2">
                  <span className="text-sm text-gray-500">Bitiş Saati:</span>
                  <span className="text-sm font-bold text-gray-800">{startTime} - {endTime} ({duration} dk)</span>
                </div>
                {minSelectableTimeToday && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-700 flex items-center gap-2">
                    <span>ℹ️</span> Bugün için minimum saat: {minSelectableTimeToday}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 rounded-b-3xl flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleMove}
              disabled={loading}
              className={`px-6 py-3 text-white font-semibold rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 ${
                moveType === 'straight'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>İşleniyor...</span>
                </>
              ) : (
                <>
                  <span>{moveType === 'straight' ? '↔️' : '🚫'}</span>
                  <span>{moveType === 'straight' ? 'Randevuyu Taşı' : 'İptal Et & Yeniden Planla'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoveAppointmentModal;
