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

  // Get week dates for weekly view
  const getWeekDates = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    const monday = new Date(date.setDate(diff));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  // Get month dates for monthly view
  const getMonthDates = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];
    
    // Add days from previous month to fill the first week
    const firstDayOfWeek = firstDay.getDay();
    const daysFromPrevMonth = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = daysFromPrevMonth; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      dates.push(d);
    }
    
    // Add all days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dates.push(new Date(year, month, i));
    }
    
    // Add days from next month to fill the last week
    const remainingDays = 42 - dates.length; // 6 weeks * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      dates.push(new Date(year, month + 1, i));
    }
    
    return dates;
  };

  const weekDates = useMemo(() => getWeekDates(new Date(selectedDate)), [selectedDate]);
  const monthDates = useMemo(() => getMonthDates(new Date(selectedDate)), [selectedDate]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Fetch appointments based on view mode
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!doctorProfile?.clinicId) {
        console.error('❌ Appointments: No clinicId found in doctorProfile');
        setAppointments([]);
        return;
      }
      
      console.log('🔍 Appointments: Fetching appointments for clinicId:', doctorProfile.clinicId);
      
      let qAppointments;
      
      if (viewMode === 'day') {
        qAppointments = query(
          collection(db, 'appointments'),
          where('clinicId', '==', doctorProfile.clinicId),
          where('dateISO', '==', dateISO)
        );
      } else if (viewMode === 'week') {
        const startDate = weekDates[0].toISOString().slice(0, 10);
        const endDate = weekDates[6].toISOString().slice(0, 10);
        qAppointments = query(
          collection(db, 'appointments'),
          where('clinicId', '==', doctorProfile.clinicId),
          where('dateISO', '>=', startDate),
          where('dateISO', '<=', endDate)
        );
      } else {
        const startDate = monthDates[0].toISOString().slice(0, 10);
        const endDate = monthDates[monthDates.length - 1].toISOString().slice(0, 10);
        qAppointments = query(
          collection(db, 'appointments'),
          where('clinicId', '==', doctorProfile.clinicId),
          where('dateISO', '>=', startDate),
          where('dateISO', '<=', endDate)
        );
      }
      
      const snap = await getDocs(qAppointments);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
      
      console.log('📅 Appointments: Found appointments:', list.length);
      setAppointments(list);
    };
    fetchAppointments();
  }, [dateISO, doctorProfile?.clinicId, viewMode, weekDates, monthDates]);

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
            <button 
              onClick={() => {
                const newDate = new Date(selectedDate);
                if (viewMode === 'day') {
                  newDate.setDate(newDate.getDate() - 1);
                } else if (viewMode === 'week') {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setMonth(newDate.getMonth() - 1);
                }
                setSelectedDate(newDate);
              }} 
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all duration-200"
            >
              ←
            </button>
            <div className="text-white font-semibold">
              {viewMode === 'day' && selectedDate.toLocaleDateString('tr-TR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
              {viewMode === 'week' && `${weekDates[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${weekDates[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              {viewMode === 'month' && selectedDate.toLocaleDateString('tr-TR', { 
                year: 'numeric', 
                month: 'long' 
              })}
            </div>
            <button 
              onClick={() => {
                const newDate = new Date(selectedDate);
                if (viewMode === 'day') {
                  newDate.setDate(newDate.getDate() + 1);
                } else if (viewMode === 'week') {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setMonth(newDate.getMonth() + 1);
                }
                setSelectedDate(newDate);
              }} 
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all duration-200"
            >
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

      {/* Calendar Views */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Slots / Calendar Grid */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">
            {viewMode === 'day' && 'Günlük Program'}
            {viewMode === 'week' && 'Haftalık Program'}
            {viewMode === 'month' && 'Aylık Program'}
          </h2>
          
          {/* Daily View */}
          {viewMode === 'day' && (
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
          )}

          {/* Weekly View */}
          {viewMode === 'week' && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-8 gap-2 min-w-[800px]">
                {/* Header */}
                <div className="text-white/60 text-sm font-semibold p-2">Saat</div>
                {weekDates.map((date, idx) => (
                  <div key={idx} className="text-center p-2">
                    <div className="text-white font-semibold text-sm">
                      {date.toLocaleDateString('tr-TR', { weekday: 'short' })}
                    </div>
                    <div className="text-white/60 text-xs">
                      {date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                ))}
                
                {/* Time slots */}
                {breakpoints.slice(0, -1).map((bp, idx) => {
                  const next = breakpoints[idx + 1];
                  return (
                    <React.Fragment key={`${bp}-${next}`}>
                      <div className="text-white/60 text-xs p-2 flex items-center justify-center">
                        {minutesToTime(bp)}
                      </div>
                      {weekDates.map((date, dayIdx) => {
                        const dateISO = date.toISOString().slice(0, 10);
                        const dayAppointments = appointments.filter(a => a.dateISO === dateISO);
                        const list = dayAppointments
                          .map(a => {
                            const dur: number = (a.durationMinutes ?? a.duration ?? 0);
                            const s = timeToMinutes(a.start ?? a.time);
                            const e = s + dur;
                            return { a, s, e, dur };
                          })
                          .filter(({ s }) => s >= bp && s < next);
                        
                        return (
                          <div key={dayIdx} className="bg-white/5 border border-white/10 rounded-lg p-1 min-h-[60px] relative">
                            {list.map(({ a, dur }) => (
                              <div
                                key={a.id}
                                onClick={() => { setViewedAppointment(a); setOpenDetailsModal(true); }}
                                className="bg-green-500/20 border border-green-500/30 rounded p-1 mb-1 cursor-pointer hover:bg-green-500/30 transition-colors"
                              >
                                <div className="text-white text-[10px] font-semibold truncate">{a.patientName}</div>
                                <div className="text-white/60 text-[9px] truncate">{a.start}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly View */}
          {viewMode === 'month' && (
            <div>
              {/* Days header */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day, idx) => (
                  <div key={idx} className="text-center text-white/60 text-sm font-semibold p-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-2">
                {monthDates.map((date, idx) => {
                  const dateISO = date.toISOString().slice(0, 10);
                  const dayAppointments = appointments.filter(a => a.dateISO === dateISO);
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const isToday = date.toDateString() === new Date().toDateString();
                  
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedDate(date);
                        setViewMode('day');
                      }}
                      className={`min-h-[100px] p-2 rounded-lg border cursor-pointer transition-all ${
                        isToday
                          ? 'bg-green-500/20 border-green-500/50'
                          : isCurrentMonth
                          ? 'bg-white/5 border-white/10 hover:bg-white/10'
                          : 'bg-white/5 border-white/5 opacity-50'
                      }`}
                    >
                      <div className={`text-sm font-semibold mb-1 ${isCurrentMonth ? 'text-white' : 'text-white/40'}`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayAppointments.slice(0, 3).map((a) => (
                          <div
                            key={a.id}
                            className={`text-[10px] px-1 py-0.5 rounded truncate ${getStatusColor(a.status)}`}
                          >
                            {a.start} {a.patientName}
                          </div>
                        ))}
                        {dayAppointments.length > 3 && (
                          <div className="text-[10px] text-white/60 px-1">
                            +{dayAppointments.length - 3} daha
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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