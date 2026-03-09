import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../../firebase/config';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  doctorId?: string;
  editedAppointment?: any | null;
  doctorProfile?: any;
  initialDate?: Date;
  initialTime?: string; // Format: "HH:MM"
  initialPatientId?: string;
  initialTypeId?: string;
  routineProgramId?: string;
}

interface PatientDoc { id: string; fullName: string; }
interface TypeDoc { id: string; name: string; durationMinutes: number; }

const WORK_START = '08:45';
const WORK_END = '19:00';

function timeToMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(mins: number) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
// generateTimes kaldırıldı (artık custom saat bileşeni var)

const AppointmentModal: React.FC<AppointmentModalProps> = ({ isOpen, onClose, onAdded, doctorId, editedAppointment, doctorProfile, initialDate, initialTime, initialPatientId, initialTypeId, routineProgramId }) => {
  const [patients, setPatients] = useState<PatientDoc[]>([]);
  const [types] = useState<TypeDoc[]>([
    { id: 'kontrol', name: 'Kontrol', durationMinutes: 5 },
    { id: 'tedavi', name: 'Tedavi', durationMinutes: 5 },
  ]);
  const [patientOpen, setPatientOpen] = useState<boolean>(false);
  const [typeOpen, setTypeOpen] = useState<boolean>(false);
  const [searchPatient, setSearchPatient] = useState('');
  const [searchType, setSearchType] = useState('');

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [, setHourOpen] = useState(false);
  const [, setMinuteOpen] = useState(false);
  const [startHour, setStartHour] = useState<number>(9);
  const [startMinute, setStartMinute] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [dayAppointments, setDayAppointments] = useState<any[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [cancelledAppointments, setCancelledAppointments] = useState<Array<{ cancelReason: string; cancelledAt: string; dateISO: string; typeName: string }>>([]);

  // Quick reservation fields (for non-registered patients)
  const [useQuickReservation, setUseQuickReservation] = useState<boolean>(false);
  const [quickName, setQuickName] = useState<string>('');
  const [quickPhone, setQuickPhone] = useState<string>('');

  // Refs for click-outside handling
  const patientRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const startTime = useMemo(() => `${String(startHour).padStart(2,'0')}:${String(startMinute).padStart(2,'0')}`, [startHour, startMinute]);

  // Close overlays on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePatient = patientRef.current?.contains(target);
      const insideType = typeRef.current?.contains(target);
      const insideTime = timeRef.current?.contains(target);
      if (!insidePatient) setPatientOpen(false);
      if (!insideType) setTypeOpen(false);
      if (!insideTime) { setHourOpen(false); setMinuteOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  // Focus container so ESC works reliably
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        containerRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      // Check if doctorProfile and clinicId exist
      if (!doctorProfile?.clinicId) {
        console.error('❌ AppointmentModal: No clinicId found in doctorProfile');
        setPatients([]);
        return;
      }
      
      console.log('🔍 AppointmentModal: Fetching patients for clinicId:', doctorProfile.clinicId);
      
      // Fetch patients with clinicID filter
      const patientsQuery = query(
        collection(db, 'patients'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const ps = await getDocs(patientsQuery);
      const patientsList: PatientDoc[] = ps.docs.map(d => ({ id: d.id, fullName: (d.data() as any).fullName || 'İsimsiz' }));
      setPatients(patientsList);
      
      console.log('👥 AppointmentModal: Found patients:', patientsList.length);
      
      setError('');
    })();
  }, [isOpen, doctorProfile?.clinicId]);

  // Edit modunda alanları doldur
  useEffect(() => {
    if (!isOpen) return;
    if (editedAppointment) {
      const s = editedAppointment.start ?? editedAppointment.time;
      if (s) {
        const [hh, mm] = String(s).split(':').map((n: string) => parseInt(n, 10));
        setStartHour(hh);
        setStartMinute(mm);
      }
      if (editedAppointment.dateISO) {
        const d = new Date(editedAppointment.dateISO);
        if (!isNaN(d.getTime())) setSelectedDate(d);
      }
      if (editedAppointment.patientId) setSelectedPatient(editedAppointment.patientId);
      if (editedAppointment.typeId) setSelectedType(editedAppointment.typeId);
      if (editedAppointment.notes) setNotes(editedAppointment.notes);
    } else {
      // add moduna dönüşte temizleme
      setSelectedPatient('');
      setSelectedType('');
      setNotes('');
      setUseQuickReservation(false);
      setQuickName('');
      setQuickPhone('');

      // Set initial date and time if provided (from slot click)
      if (initialDate) {
        setSelectedDate(initialDate);
      }
      if (initialTime) {
        const [hh, mm] = initialTime.split(':').map((n: string) => parseInt(n, 10));
        setStartHour(hh);
        setStartMinute(mm);
      }
      if (initialPatientId) {
        setSelectedPatient(initialPatientId);
      }
      if (initialTypeId) {
        setSelectedType(initialTypeId);
      }
    }
  }, [isOpen, editedAppointment, initialDate, initialTime, initialPatientId, initialTypeId]);

  // Fetch cancelled appointments for selected patient
  useEffect(() => {
    if (!isOpen || !selectedPatient || useQuickReservation) {
      setCancelledAppointments([]);
      return;
    }
    (async () => {
      const cancelledQuery = query(
        collection(db, 'appointments'),
        where('patientId', '==', selectedPatient),
        where('status', '==', 'cancelled')
      );
      const snap = await getDocs(cancelledQuery);
      const results = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          cancelReason: data.cancelReason || '',
          cancelledAt: data.cancelledAt || '',
          dateISO: data.dateISO || '',
          typeName: data.typeName || '',
        };
      });
      results.sort((a, b) => (b.cancelledAt || '').localeCompare(a.cancelledAt || ''));
      setCancelledAppointments(results);
    })();
  }, [isOpen, selectedPatient, useQuickReservation]);

  // Gün randevularını çek (disable için). Edit modda mevcut id'yi hariç tut.
  useEffect(() => {
    if (!isOpen) return;
    // Use local date instead of UTC to avoid timezone issues
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateISO = `${year}-${month}-${day}`;
    (async () => {
      const qDay = query(collection(db, 'appointments'), where('dateISO', '==', dateISO));
      const snap = await getDocs(qDay);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const filtered = editedAppointment ? list.filter(x => x.id !== editedAppointment.id) : list;
      // start'a göre sırala
      filtered.sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
      setDayAppointments(filtered);
    })();
  }, [isOpen, selectedDate, editedAppointment]);

  const selectedTypeObj = useMemo(() => types.find(t => t.id === selectedType), [types, selectedType]);

  const endTime = useMemo(() => {
    if (!selectedTypeObj) return null;
    const dur = selectedTypeObj.durationMinutes || 0;
    const end = timeToMinutes(startTime) + dur;
    return minutesToTime(end);
  }, [startTime, selectedTypeObj]);

  const withinWorkHours = useMemo(() => {
    const startOk = timeToMinutes(startTime) >= timeToMinutes(WORK_START);
    const startNotAfterEnd = timeToMinutes(startTime) <= timeToMinutes(WORK_END);
    return startOk && startNotAfterEnd;
  }, [startTime]);


  // Başlangıç dakikasının dolu olup olmadığını kontrol et (segment başı engelleme)
  /*
  const isStartDisabled = (h: number, m: number) => {
    const startMin = h * 60 + m;
    // mesai sınırı
    if (startMin < timeToMinutes(WORK_START) || startMin > timeToMinutes(WORK_END)) return true;
    // bugün min saat
    if (minSelectableTimeToday) {
      const [mh, mm] = minSelectableTimeToday.split(':').map(Number);
      const minToday = mh * 60 + mm;
      if (selectedDate.toDateString() === new Date().toDateString() && startMin < minToday) return true;
    }
    // mevcut randevu aralıkları
    for (const a of dayAppointments) {
      const durA: number = (a.durationMinutes ?? a.duration ?? 0);
      const sA = timeToMinutes(a.start ?? a.time);
      const eA = sA + durA;
      if (startMin >= sA && startMin < eA) return true;
    }
    return false;
  };
  */

  const filteredPatients = useMemo(() => {
    const s = searchPatient.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter(p => p.fullName.toLowerCase().includes(s));
  }, [patients, searchPatient]);

  const filteredTypes = useMemo(() => {
    const s = searchType.trim().toLowerCase();
    if (!s) return types;
    return types.filter(t => t.name.toLowerCase().includes(s));
  }, [types, searchType]);

  // Min-time kontrolü (bugün için): şimdi + 5dk yuvarla
  const minSelectableTimeToday = useMemo(() => {
    const now = new Date();
    if (selectedDate.toDateString() !== new Date().toDateString()) return null;
    let mins = now.getHours() * 60 + now.getMinutes();
    mins = Math.ceil(mins / 5) * 5; // 5dk'ya yuvarla
    const bound = Math.max(mins, timeToMinutes(WORK_START));
    return minutesToTime(bound);
  }, [selectedDate]);

  // Calculate all time slots with availability status
  const allTimeSlots = useMemo(() => {
    const slots = [];
    const startMinutes = timeToMinutes(WORK_START);
    const endMinutes = timeToMinutes(WORK_END);
    const slotDuration = 5; // 5 dakikalık slotlar

    for (let time = startMinutes; time <= endMinutes; time += slotDuration) {
      const timeStr = minutesToTime(time);

      // Only block if an appointment STARTS in this exact time slot (exclude cancelled appointments)
      const hasConflict = dayAppointments.some(appointment => {
        // Skip cancelled appointments - they shouldn't block slots
        if (appointment.status === 'cancelled') return false;
        const apptStart = timeToMinutes(appointment.start ?? appointment.time);
        return apptStart >= time && apptStart < time + slotDuration;
      });

      // Check if slot is in the past for today
      const isPast = minSelectableTimeToday && timeToMinutes(timeStr) < timeToMinutes(minSelectableTimeToday);

      slots.push({
        time: timeStr,
        available: !hasConflict && !isPast,
        isPast: isPast,
        hasConflict: hasConflict
      });
    }

    return slots;
  }, [dayAppointments, minSelectableTimeToday]);

  // Keep backwards compatibility for availableSlots
  /*
  const availableSlots = useMemo(() => {
    return allTimeSlots.filter(slot => slot.available).map(slot => slot.time);
  }, [allTimeSlots]);
  */

  useEffect(() => {
    // Eğer bugün ise, startTime en az minSelectableTimeToday olsun
    if (!minSelectableTimeToday) return;
    const cur = timeToMinutes(startTime);
    const minT = timeToMinutes(minSelectableTimeToday);
    if (cur < minT) {
      setStartHour(Math.floor(minT / 60));
      setStartMinute(minT % 60);
    }
  }, [minSelectableTimeToday]);

  /*
  const clampToWorkHours = (h: number, m: number) => {
    let total = h * 60 + m;
    const start = timeToMinutes(WORK_START);
    const end = timeToMinutes(WORK_END);
    if (total < start) total = start;
    if (total > end) total = end;
    // bugün min zaman altında kalmasın
    if (minSelectableTimeToday) {
      const minT = timeToMinutes(minSelectableTimeToday);
      if (total < minT) total = minT;
    }
    return { h: Math.floor(total/60), m: total%60 };
  };
  */

  /*
  const stepMinutes = (delta: number) => {
    const total = timeToMinutes(startTime) + delta;
    const { h, m } = clampToWorkHours(Math.floor(total/60), total%60);
    setStartHour(h); setStartMinute(m);
  };
  */

  const checkOverlap = async () => {
    // fetch same-day appointments to check overlap
    // Use local date instead of UTC
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateISO = `${year}-${month}-${day}`;
    const qDay = query(collection(db, 'appointments'), where('dateISO', '==', dateISO));
    const snap = await getDocs(qDay);
    const start = timeToMinutes(startTime);
    const dur = selectedTypeObj?.durationMinutes || 0;
    const end = start + dur;
    for (const d of snap.docs) {
      const data = d.data() as any;
      // Skip cancelled appointments - they don't block time slots
      if (data.status === 'cancelled') continue;
      const s = timeToMinutes(data.start ?? data.time);
      const apptDuration = data.durationMinutes ?? data.duration ?? 30;
      const e = s + apptDuration;
      const overlap = Math.max(start, s) < Math.min(end, e);
      if (overlap) return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation for quick reservation mode
    if (useQuickReservation) {
      if (!quickName.trim()) return setError('Lütfen ad soyad girin.');
      if (!quickPhone.trim()) return setError('Lütfen telefon numarası girin.');
    } else {
      if (!selectedPatient) return setError('Lütfen hasta seçin.');
    }

    if (!selectedTypeObj) return setError('Lütfen randevu tipi seçin.');
    if (!withinWorkHours) return setError('Seçilen saat mesai saatleri dışında.');

    setLoading(true);
    try {
      const overlap = await checkOverlap();
      if (overlap) {
        setError('Seçilen zaman aralığı dolu. Lütfen başka bir saat seçin.');
        toast.error('Seçilen zaman aralığı dolu. Lütfen başka bir saat seçin.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // Use local date instead of UTC
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateISO = `${year}-${month}-${day}`;
        if (editedAppointment?.id) {
          // edit: hasta adı sabit, diğerleri güncellenebilir
          await updateDoc(doc(db, 'appointments', editedAppointment.id), {
            typeId: selectedTypeObj.id,
            typeName: selectedTypeObj.name,
            durationMinutes: selectedTypeObj.durationMinutes,
            dateISO,
            start: startTime,
            status: editedAppointment.status || 'confirmed',
            doctorId: doctorId || editedAppointment.doctorId || null,
            notes: notes || '',
            clinicId: doctorProfile?.clinicId || editedAppointment.clinicId || 'default-clinic',
          });
        } else {
          // Quick reservation or regular appointment
          const appointmentData: any = {
            typeId: selectedTypeObj.id,
            typeName: selectedTypeObj.name,
            durationMinutes: selectedTypeObj.durationMinutes,
            dateISO,
            start: startTime,
            status: 'pending',
            doctorId: doctorId || null,
            notes: notes || '',
            clinicId: doctorProfile?.clinicId || 'default-clinic',
            ...(routineProgramId ? { routineProgramId } : {}),
          };

          if (useQuickReservation) {
            // Quick reservation - create a patient record with incomplete data
            const patientData = {
              fullName: quickName.trim(),
              phone: quickPhone.trim(),
              registrationStatus: 'incomplete', // Mark as incomplete registration
              clinicId: doctorProfile?.clinicId || 'default-clinic',
              createdAt: new Date().toISOString(),
              createdVia: 'quick_reservation',
            };

            const patientDoc = await addDoc(collection(db, 'patients'), patientData);

            appointmentData.patientId = patientDoc.id;
            appointmentData.patientName = quickName.trim();
            appointmentData.patientPhone = quickPhone.trim();
            appointmentData.isQuickReservation = true;
          } else {
            // Regular appointment with registered patient
            appointmentData.patientId = selectedPatient;
            appointmentData.patientName = patients.find(p=>p.id===selectedPatient)?.fullName || 'Hasta';
          }

          await addDoc(collection(db, 'appointments'), appointmentData);
        }
        toast.success(editedAppointment ? 'Randevu başarıyla güncellendi!' : 'Randevu başarıyla eklendi!');
        onAdded();
        onClose();
      } catch (err: any) {
        setError('Kayıt sırasında hata oluştu.');
        toast.error('Randevu kaydedilirken bir hata oluştu!');
      } finally {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError('Randevu eklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={containerRef} className={`fixed inset-0 z-50 ${isOpen ? '' : 'hidden'}`}
      onClick={() => onClose()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/80 to-slate-800/80 backdrop-blur-sm animate-fadeIn" />
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e)=>e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-white/95 to-gray-50/95 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl transform animate-scaleIn">
          {/* Modern Header */}
          <div className="px-8 py-6 border-b border-gray-200/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-xl">{editedAppointment ? '✏️' : '📅'}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    {editedAppointment ? 'Randevu Düzenle' : 'Yeni Randevu Ekle'}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {editedAppointment ? 'Mevcut randevuyu güncelleyin' : 'Yeni bir randevu oluşturun'}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all duration-200 hover:scale-110" 
                onClick={onClose}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 text-red-700 rounded-2xl shadow-sm animate-slideDown">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">⚠️</span>
                  {error}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Selection */}
              <div ref={patientRef} className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500">👤</span>
                    Hasta Seçimi
                  </div>
                  {!editedAppointment && (
                    <button
                      type="button"
                      onClick={() => {
                        setUseQuickReservation(!useQuickReservation);
                        setSelectedPatient('');
                        setQuickName('');
                        setQuickPhone('');
                      }}
                      className="text-xs px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-all duration-200"
                    >
                      {useQuickReservation ? 'Kayıtlı Hasta' : 'Hızlı Rezervasyon'}
                    </button>
                  )}
                </label>

                {useQuickReservation ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="Ad Soyad"
                      className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-gray-300/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
                    />
                    <input
                      type="tel"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      placeholder="Telefon Numarası"
                      className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-gray-300/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      disabled={!!editedAppointment}
                      onClick={()=>setPatientOpen(v=>!v)}
                      className={`w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-gray-300/50 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 shadow-sm hover:shadow-md font-medium ${editedAppointment?'opacity-60 cursor-not-allowed':'hover:border-blue-400'}`}
                    >
                      {patients.find(p=>p.id===selectedPatient)?.fullName || 'Hasta seçin...'}
                    </button>
                  {patientOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-2xl p-4 z-50">
                      <input 
                        value={searchPatient} 
                        onChange={e=>setSearchPatient(e.target.value)} 
                        placeholder="Hasta ara..." 
                        className="w-full px-4 py-2 bg-gray-50/80 border border-gray-200 rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {filteredPatients.map(p => (
                          <button 
                            type="button" 
                            key={p.id} 
                            onClick={()=>{setSelectedPatient(p.id); setPatientOpen(false);}} 
                            className={`w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 transition-all duration-200 cursor-pointer ${selectedPatient===p.id?'bg-blue-100 border border-blue-200':'hover:shadow-sm'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                                <span className="text-blue-600 text-sm">👤</span>
                              </div>
                              <span className="font-medium">{p.fullName}</span>
                            </div>
                          </button>
                        ))}
                        {filteredPatients.length===0 && (
                          <div className="px-4 py-6 text-center text-gray-500">
                            <div className="text-2xl mb-2">🔍</div>
                            <div>Hasta bulunamadı</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                )}
              </div>

              {/* Appointment Type Selection */}
              <div ref={typeRef} className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span className="text-green-500">📋</span>
                  Randevu Tipi
                </label>
                <div className="relative">
                  <button 
                    type="button" 
                    onClick={()=>setTypeOpen(v=>!v)} 
                    className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-gray-300/50 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all duration-200 shadow-sm hover:shadow-md font-medium hover:border-green-400"
                  >
                    {types.find(t=>t.id===selectedType)?.name || 'Randevu tipi seçin...'}
                  </button>
                  {typeOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-2xl p-4 z-50">
                      <input 
                        value={searchType} 
                        onChange={e=>setSearchType(e.target.value)} 
                        placeholder="Randevu tipi ara..." 
                        className="w-full px-4 py-2 bg-gray-50/80 border border-gray-200 rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                      />
                      <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {filteredTypes.map(t => (
                          <button 
                            type="button" 
                            key={t.id} 
                            onClick={()=>{setSelectedType(t.id); setTypeOpen(false);}} 
                            className={`w-full text-left px-4 py-3 rounded-xl hover:bg-green-50 transition-all duration-200 cursor-pointer ${selectedType===t.id?'bg-green-100 border border-green-200':'hover:shadow-sm'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center">
                                  <span className="text-green-600 text-sm">📋</span>
                                </div>
                                <span className="font-medium">{t.name}</span>
                              </div>
                              <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full font-semibold">
                                {t.durationMinutes} dk
                              </span>
                            </div>
                          </button>
                        ))}
                        {filteredTypes.length===0 && (
                          <div className="px-4 py-6 text-center text-gray-500">
                            <div className="text-2xl mb-2">🔍</div>
                            <div>Randevu tipi bulunamadı</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span className="text-purple-500">📅</span>
                  Randevu Tarihi
                </label>
                <div className="bg-white/90 backdrop-blur-sm border border-purple-300/50 rounded-2xl p-3 pb-1 shadow-sm">
                  <DayPicker 
                    mode="single" 
                    selected={selectedDate} 
                    onSelect={(d)=>d && setSelectedDate(d)} 
                    className="w-full"
                    styles={{
                      month: { fontSize: '14px', width: '100%' },
                      caption: { fontSize: '16px', marginBottom: '8px' },
                      table: { fontSize: '13px', width: '100%', tableLayout: 'fixed' },
                      day: { fontSize: '13px', padding: '12px', height: '48px', width: '48px' },
                      head_cell: { fontSize: '12px', padding: '8px', textAlign: 'center' },
                      nav: { fontSize: '14px' }
                    }}
                  />
                </div>

                {/* Cancelled Appointments Warning */}
                {cancelledAppointments.length > 0 && (
                  <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4 shadow-sm animate-slideDown">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-red-600 text-lg">⚠️</span>
                      </div>
                      <h4 className="text-sm font-bold text-red-700">
                        Dikkat: Geçmiş İptal Kayıtları ({cancelledAppointments.length})
                      </h4>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {cancelledAppointments.map((ca, idx) => (
                        <div key={idx} className="bg-white border border-red-200 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-red-600">
                              {ca.dateISO ? new Date(ca.dateISO + 'T00:00:00').toLocaleDateString('tr-TR') : '-'}
                            </span>
                            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                              {ca.typeName || '-'}
                            </span>
                          </div>
                          <p className="text-sm text-red-800 font-medium">
                            {ca.cancelReason || 'Sebep belirtilmemiş'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Available Time Slots - Right Column */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                  <span className="text-green-500">🕒</span>
                  Müsait Saatler ({selectedDate.toLocaleDateString('tr-TR')})
                </label>
                <div className="bg-white/90 backdrop-blur-sm border border-green-300/50 rounded-2xl shadow-sm">
                  {allTimeSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 p-4 max-h-80 overflow-y-auto">
                      {allTimeSlots.map((slot) => (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => {
                            if (slot.available) {
                              const [h, m] = slot.time.split(':').map(Number);
                              setStartHour(h);
                              setStartMinute(m);
                            }
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
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-2">❌</div>
                      <div className="text-lg font-medium">Bu tarihte saat bulunmuyor</div>
                      <div className="text-sm">Lütfen başka bir tarih seçin</div>
                    </div>
                  )}
                </div>

                {/* Time Information */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-gray-600">Bitiş Saati:</span>
                    <span className="text-xs font-bold text-gray-800">{endTime ?? '-'}</span>
                  </div>
                  {minSelectableTimeToday && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-600">
                        <span>ℹ️</span>
                        <span className="text-xs font-medium">Bugün için minimum saat: {minSelectableTimeToday}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section - Right Column */}
                <div className="space-y-2 mt-4">
                  <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                    <span className="text-yellow-500">📝</span>
                    Notlar (Opsiyonel)
                  </label>
                  <div className="bg-white/90 backdrop-blur-sm border border-yellow-300/50 rounded-xl p-3 shadow-sm">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Randevu notları..."
                      rows={3}
                      maxLength={500}
                      className="w-full px-3 py-2 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all duration-200 shadow-sm hover:shadow-md font-medium resize-none text-sm"
                    />
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                      <span className="text-yellow-500">💡</span>
                      <span className={`${notes.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                        {notes.length}/500
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>


            {/* Action Buttons */}
            <div className="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-200/50">
              <button 
                type="button" 
                onClick={onClose} 
                className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-300 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
              >
                İptal
              </button>
              <button 
                type="submit" 
                disabled={loading} 
                className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 min-w-[160px] justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">{editedAppointment ? '💾' : '📅'}</span>
                    <span>{editedAppointment ? 'Güncelle' : 'Randevu Ekle'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentModal;
