import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AppointmentModal from '../components/AppointmentModal';
import AppointmentTypeManager from '../components/AppointmentTypeManager';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';

interface AppointmentsProps {
  doctorProfile?: any;
}

const Appointments: React.FC<AppointmentsProps> = ({ doctorProfile }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openTypeModal, setOpenTypeModal] = useState(false);
  const [openDetailsModal, setOpenDetailsModal] = useState(false);
  const [editedAppointment, setEditedAppointment] = useState<any | null>(null);
  const [viewedAppointment, setViewedAppointment] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Utils for time math
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const minutesToTime = (mins: number) => {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const WORK_START = '08:00';
  const WORK_END = '17:30';
  const hourSlots = useMemo(() => {
    const start = timeToMinutes(WORK_START);
    const end = timeToMinutes(WORK_END);
    const arr: number[] = [];
    for (let t = start; t <= end; t += 15) arr.push(t);
    return arr;
  }, []);

  // Breakpoint'ler: sadece 15 dakikalık slotlar
  const breakpoints = useMemo(() => {
    return hourSlots;
  }, [hourSlots]);

  // 5 dk grid kaldırıldı; saatlik satırlar üzerinden oransal bloklar gösterilecek

  const dateISO = useMemo(() => selectedDate.toISOString().slice(0, 10), [selectedDate]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Fetch appointments for selected day
  useEffect(() => {
    const fetchAppointments = async () => {
      // Check if doctorProfile and clinicId exist
      if (!doctorProfile?.clinicId) {
        console.error('❌ Appointments: No clinicId found in doctorProfile');
        setAppointments([]);
        return;
      }
      
      console.log('🔍 Appointments: Fetching appointments for clinicId:', doctorProfile.clinicId);
      
      const qDay = query(
        collection(db, 'appointments'),
        where('clinicId', '==', doctorProfile.clinicId),
        where('dateISO', '==', dateISO)
      );
      const snap = await getDocs(qDay);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
      
      console.log('📅 Appointments: Found appointments:', list.length);
      setAppointments(list);
    };
    fetchAppointments();
  }, [dateISO, doctorProfile?.clinicId]);

  // Segment aralığına düşen randevular - sadece başlangıç zamanı bu slot içinde olanlar
  const getAppointmentsForSegment = (segStart: number, segEnd: number) => {
    return appointments
      .map(a => {
        const dur: number = (a.durationMinutes ?? a.duration ?? 0);
        const s = timeToMinutes(a.start ?? a.time);
        const e = s + dur;
        return { a, s, e, dur };
      })
      .filter(({ s }) => s >= segStart && s < segEnd) // only if start time is in this slot
      .sort((x, y) => x.s - y.s);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'cancelled': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Randevu Yönetimi</h1>
          <p className="text-white/70">Randevu takvimi ve planlama</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpenTypeModal(true)}
            className="px-4 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200 border border-white/20"
          >
            Randevu Tipi Ekle
          </button>
          <button
            onClick={() => setOpenAddModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-200 shadow-lg"
          >
            + Yeni Randevu
          </button>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all duration-200 ${
                viewMode === 'day' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Günlük
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all duration-200 ${
                viewMode === 'week' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Haftalık
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 rounded-xl font-semibold transition-all duration-200 ${
                viewMode === 'month' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Aylık
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all duration-200">
              ←
            </button>
            <div className="text-white font-semibold">
              {selectedDate.toLocaleDateString('tr-TR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
            <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all duration-200">
              →
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { title: 'Bugünkü Randevular', value: String(appointments.length), icon: '📅', color: 'from-blue-500 to-cyan-500' },
            { title: 'Onaylanan', value: String(appointments.filter(a=>a.status==='confirmed').length), icon: '✅', color: 'from-green-500 to-emerald-500' },
            { title: 'Beklemede', value: String(appointments.filter(a=>a.status==='pending').length), icon: '⏳', color: 'from-yellow-500 to-orange-500' },
            { title: 'İptal', value: String(appointments.filter(a=>a.status==='cancelled').length), icon: '❌', color: 'from-red-500 to-pink-500' }
          ].map((stat, index) => (
            <div key={index} className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}>
                  <span className="text-white text-lg">{stat.icon}</span>
                </div>
                <div>
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-white/70 text-sm">{stat.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Slots */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Günlük Program</h2>
          
          <div className="space-y-3">
            {breakpoints.slice(0, -1).map((bp, idx) => {
              const next = breakpoints[idx + 1];
              const list = getAppointmentsForSegment(bp, next);
              const hasAny = list.length > 0;
              const rowHeight = Math.max(56, list.length * 56);

              // Check if this time slot is in the past
              const isToday = selectedDate.toDateString() === currentTime.toDateString();
              const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
              const isPast = isToday && next <= currentMinutes;

              return (
                <div key={`${bp}-${next}`} className={`flex items-stretch gap-4 p-4 rounded-xl transition-all duration-200 ${isPast ? 'bg-white/5 opacity-50' : 'bg-white/5 hover:bg-white/10'}`}>
                  <div className="w-20 text-center">
                    <div className="text-white font-semibold">{minutesToTime(bp)}</div>
                    <div className="text-white/60 text-xs">{minutesToTime(next)}</div>
                  </div>
                  <div className={`flex-1 relative border border-white/10 rounded-lg ${hasAny ? 'bg-transparent h-full' : 'bg-white/5'}`} style={{ minHeight: rowHeight }}>
                    {!hasAny && (
                      <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">Boş</div>
                    )}
                    {list.map(({ a, dur }, idx2) => {
                      // Segment yapısında blok segmenti tamamen doldurur
                      const endLabel = minutesToTime((a.start ? timeToMinutes(a.start) : timeToMinutes(a.time)) + dur);
                      return (
                        <div key={`${a.id}-${idx2}`}
                          className="absolute inset-x-0 border border-white/20 bg-green-500/20 rounded-md p-3 overflow-hidden"
                          style={{ top: idx2 * 56 }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-white text-sm font-semibold truncate pr-2">{a.patientName}</div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusColor(a.status)}`}>
                              {a.status === 'confirmed' ? 'Onaylandı' : a.status === 'pending' ? 'Beklemede' : 'İptal'}
                            </span>
                          </div>
                          <div className="text-white/80 text-xs truncate">{a.typeName ?? a.type} • {dur} dk</div>
                          <div className="text-white/60 text-[11px]">{a.start ?? a.time} - {endLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 w-12">
                    {hasAny ? (
                      <>
                        <button
                          title="İncele"
                          onClick={() => { setViewedAppointment(list[0].a); setOpenDetailsModal(true); }}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-colors duration-150 cursor-pointer"
                        >👁️</button>
                        <button
                          title="Düzenle"
                          onClick={() => { setEditedAppointment(list[0].a); setOpenAddModal(true); }}
                          className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-300 hover:text-green-200 transition-colors duration-150 cursor-pointer"
                        >✏️</button>
                      </>
                    ) : (
                      <button
                        aria-label="Yeni randevu ekle"
                        disabled={isPast}
                        onClick={() => { setEditedAppointment(null); setOpenAddModal(true); }}
                        className={`p-2 rounded-lg transition-colors duration-150 leading-none ${
                          isPast
                            ? 'bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-not-allowed'
                            : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 hover:text-green-200 cursor-pointer'
                        }`}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Yaklaşan Randevular</h2>
          
          <div className="space-y-4">
            {appointments.slice(0, 5).map((appointment) => (
              <div key={appointment.id} className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white font-semibold">{appointment.patientName}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(appointment.status)}`}>
                    {appointment.status === 'confirmed' ? 'Onaylandı' :
                     appointment.status === 'pending' ? 'Beklemede' : 'İptal'}
                  </span>
                </div>
                <div className="text-white/70 text-sm mb-1">{appointment.start} • {appointment.typeName ?? appointment.type}</div>
                <div className="text-white/60 text-xs">{appointment.notes ?? ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AppointmentModal
        isOpen={openAddModal}
        onClose={() => { setOpenAddModal(false); setEditedAppointment(null); }}
        onAdded={() => {
          // refresh after add
          (async () => {
            if (!doctorProfile?.clinicId) return;
            
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId),
              where('dateISO', '==', dateISO)
            );
            const snap = await getDocs(qDay);
            const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);
          })();
        }}
        editedAppointment={editedAppointment}
        doctorProfile={doctorProfile}
      />
      <AppointmentTypeManager
        isOpen={openTypeModal}
        onClose={() => setOpenTypeModal(false)}
        onAdded={() => { /* types modal eklemeden sonra, seçim listesi AppointmentModal içinde dinamik gelecek */ }}
      />
      <AppointmentDetailsModal
        isOpen={openDetailsModal}
        onClose={() => { setOpenDetailsModal(false); setViewedAppointment(null); }}
        appointment={viewedAppointment}
        onDeleted={() => {
          // refresh appointments after delete
          (async () => {
            if (!doctorProfile?.clinicId) return;
            
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId),
              where('dateISO', '==', dateISO)
            );
            const snap = await getDocs(qDay);
            const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);
          })();
        }}
      />
    </div>
  );
};

export default Appointments;