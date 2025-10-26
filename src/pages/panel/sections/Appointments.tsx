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

  // Get week range for weekly view
  const getWeekRange = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  };

  // Get month range for monthly view
  const getMonthRange = (date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  };

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
      // Check if doctorProfile and clinicId exist
      if (!doctorProfile?.clinicId) {
        console.error('❌ Appointments: No clinicId found in doctorProfile');
        setAppointments([]);
        return;
      }
      
      console.log('🔍 Appointments: Fetching appointments for clinicId:', doctorProfile.clinicId);
      
      let startDate: string, endDate: string;
      
      if (viewMode === 'day') {
        startDate = endDate = dateISO;
      } else if (viewMode === 'week') {
        const { start, end } = getWeekRange(selectedDate);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      } else { // month
        const { start, end } = getMonthRange(selectedDate);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      }
      
      const qDay = query(
        collection(db, 'appointments'),
        where('clinicId', '==', doctorProfile.clinicId),
        where('dateISO', '>=', startDate),
        where('dateISO', '<=', endDate)
      );
      const snap = await getDocs(qDay);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a,b) => {
        const dateCompare = String(a.dateISO||'').localeCompare(String(b.dateISO||''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start||'').localeCompare(String(b.start||''));
      });
      
      console.log('📅 Appointments: Found appointments:', list.length);
      setAppointments(list);
    };
    fetchAppointments();
  }, [dateISO, viewMode, selectedDate, doctorProfile?.clinicId]);

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
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-300 hover:text-green-200 transition-all duration-200 text-sm font-semibold"
            >
              Bugün
            </button>
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
              {viewMode === 'week' && (() => {
                const { start, end } = getWeekRange(selectedDate);
                return `${start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
              })()}
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
            { 
              title: viewMode === 'day' ? 'Bugünkü Randevular' : viewMode === 'week' ? 'Haftalık Randevular' : 'Aylık Randevular', 
              value: String(appointments.length), 
              icon: '📅', 
              color: 'from-blue-500 to-cyan-500' 
            },
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

      {/* Schedule View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Slots / Calendar */}
        <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">
            {viewMode === 'day' ? 'Günlük Program' : viewMode === 'week' ? 'Haftalık Program' : 'Aylık Program'}
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
          {viewMode === 'week' && (() => {
            const { start } = getWeekRange(selectedDate);
            const weekDays = Array.from({ length: 7 }, (_, i) => {
              const day = new Date(start);
              day.setDate(start.getDate() + i);
              return day;
            });

            // Saatlik slotlar (08:00 - 18:00)
            const timeSlots = Array.from({ length: 11 }, (_, i) => 8 + i); // 8-18 arası saatler

            return (
              <div className="overflow-auto max-h-[600px]">
                <div className="min-w-[1000px]">
                  {/* Header - Günler */}
                  <div className="grid grid-cols-8 gap-2 mb-3 sticky top-0 bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 backdrop-blur-xl z-10 pb-3 pt-2 px-2 rounded-xl shadow-lg border border-white/10">
                    <div className="text-white/70 text-xs font-semibold text-center py-2">Saat</div>
                    {weekDays.map((day) => {
                      const isToday = day.toDateString() === new Date().toDateString();
                      return (
                        <div key={day.toISOString()} className={`text-center py-2 rounded-lg ${isToday ? 'bg-green-500/30 ring-2 ring-green-400' : 'bg-white/10'}`}>
                          <div className="text-white/90 text-xs uppercase font-semibold">{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</div>
                          <div className="text-white font-bold text-xl">{day.getDate()}</div>
                          <div className="text-white/70 text-[10px]">{day.toLocaleDateString('tr-TR', { month: 'short' })}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Time Grid */}
                  <div className="space-y-1">
                    {timeSlots.map((hour) => {
                      const timeStr = `${String(hour).padStart(2, '0')}:00`;
                      const nextTimeStr = `${String(hour + 1).padStart(2, '0')}:00`;
                      
                      return (
                        <div key={hour} className="grid grid-cols-8 gap-2">
                          {/* Saat etiketi */}
                          <div className="text-white/70 text-xs font-semibold text-center py-2">
                            {timeStr}
                          </div>
                          
                          {/* Her gün için slot */}
                          {weekDays.map((day) => {
                            const dayISO = day.toISOString().slice(0, 10);
                            const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
                            
                            // Bu saat aralığındaki randevular
                            const slotAppointments = appointments.filter(a => {
                              if (a.dateISO !== dayISO) return false;
                              const aptHour = parseInt(a.start?.split(':')[0] || '0');
                              return aptHour === hour;
                            });

                            return (
                              <div 
                                key={`${dayISO}-${hour}`} 
                                className={`min-h-[80px] bg-white/5 rounded-lg p-2 border border-white/10 ${isPast ? 'opacity-40' : ''}`}
                              >
                                {slotAppointments.length === 0 ? (
                                  <div className="h-full flex items-center justify-center text-white/20 text-xs">-</div>
                                ) : (
                                  <div className="space-y-1">
                                    {slotAppointments.map((apt) => {
                                      const dur = apt.durationMinutes ?? apt.duration ?? 0;
                                      return (
                                        <div
                                          key={apt.id}
                                          onClick={() => { setViewedAppointment(apt); setOpenDetailsModal(true); }}
                                          className={`p-2 rounded border cursor-pointer hover:scale-105 transition-all ${getStatusColor(apt.status)}`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="text-[10px] font-bold">{apt.start}</div>
                                            <div className="text-[8px] opacity-70">{dur}dk</div>
                                          </div>
                                          <div className="text-[11px] font-semibold truncate">{apt.patientName}</div>
                                          <div className="text-[9px] opacity-80 truncate">{apt.typeName ?? apt.type}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer - Günlük özet */}
                  <div className="grid grid-cols-8 gap-2 mt-2 pt-2 border-t border-white/10">
                    <div className="text-white/70 text-xs font-semibold text-center py-2">Toplam</div>
                    {weekDays.map((day) => {
                      const dayISO = day.toISOString().slice(0, 10);
                      const dayAppointments = appointments.filter(a => a.dateISO === dayISO);
                      return (
                        <div key={`total-${dayISO}`} className="text-center py-2 bg-white/5 rounded-lg">
                          <div className="text-white font-bold">{dayAppointments.length}</div>
                          <div className="text-white/60 text-[10px]">randevu</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Monthly View */}
          {viewMode === 'month' && (() => {
            const { start, end } = getMonthRange(selectedDate);
            const firstDay = new Date(start);
            const lastDay = new Date(end);
            
            // Get first Monday before or on the first day of month
            const calendarStart = new Date(firstDay);
            const dayOfWeek = calendarStart.getDay();
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            calendarStart.setDate(calendarStart.getDate() - daysToMonday);
            
            // Get last Sunday after or on the last day of month
            const calendarEnd = new Date(lastDay);
            const daysToSunday = 7 - calendarEnd.getDay();
            if (daysToSunday < 7) {
              calendarEnd.setDate(calendarEnd.getDate() + daysToSunday);
            }
            
            const totalDays = Math.ceil((calendarEnd.getTime() - calendarStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const weeks = Math.ceil(totalDays / 7);
            
            return (
              <div className="space-y-2">
                {/* Week day headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                    <div key={day} className="text-center text-white/70 text-sm font-semibold py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Calendar grid */}
                {Array.from({ length: weeks }, (_, weekIdx) => (
                  <div key={weekIdx} className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 7 }, (_, dayIdx) => {
                      const currentDay = new Date(calendarStart);
                      currentDay.setDate(calendarStart.getDate() + weekIdx * 7 + dayIdx);
                      const dayISO = currentDay.toISOString().slice(0, 10);
                      const dayAppointments = appointments.filter(a => a.dateISO === dayISO);
                      const isCurrentMonth = currentDay.getMonth() === selectedDate.getMonth();
                      const isToday = currentDay.toDateString() === new Date().toDateString();
                      const isPast = currentDay < new Date(new Date().setHours(0, 0, 0, 0));

                      return (
                        <div
                          key={dayISO}
                          onClick={() => {
                            setSelectedDate(new Date(currentDay));
                            setViewMode('day');
                          }}
                          className={`bg-white/5 rounded-xl p-2 min-h-[100px] cursor-pointer hover:bg-white/10 transition-all ${
                            !isCurrentMonth ? 'opacity-30' : ''
                          } ${isToday ? 'ring-2 ring-green-500' : ''} ${isPast ? 'opacity-50' : ''}`}
                        >
                          <div className="text-white text-sm font-semibold mb-1">{currentDay.getDate()}</div>
                          <div className="space-y-1">
                            {dayAppointments.slice(0, 3).map((apt) => (
                              <div
                                key={apt.id}
                                onClick={(e) => { 
                                  e.stopPropagation();
                                  setViewedAppointment(apt); 
                                  setOpenDetailsModal(true); 
                                }}
                                className={`text-[10px] p-1 rounded border cursor-pointer hover:scale-105 transition-transform truncate ${getStatusColor(apt.status)}`}
                              >
                                {apt.start} {apt.patientName}
                              </div>
                            ))}
                            {dayAppointments.length > 3 && (
                              <div className="text-[10px] text-white/60 text-center">+{dayAppointments.length - 3}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">
            {viewMode === 'day' ? 'Yaklaşan Randevular' : 'Randevular'}
          </h2>
          
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {appointments.length === 0 ? (
              <div className="text-white/40 text-center py-8">Randevu bulunamadı</div>
            ) : (
              appointments.slice(0, viewMode === 'day' ? 5 : 10).map((appointment) => (
                <div 
                  key={appointment.id} 
                  className="bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => { setViewedAppointment(appointment); setOpenDetailsModal(true); }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white font-semibold">{appointment.patientName}</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(appointment.status)}`}>
                      {appointment.status === 'confirmed' ? 'Onaylandı' :
                       appointment.status === 'pending' ? 'Beklemede' : 'İptal'}
                    </span>
                  </div>
                  {viewMode !== 'day' && (
                    <div className="text-white/60 text-xs mb-1">
                      {new Date(appointment.dateISO).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
                    </div>
                  )}
                  <div className="text-white/70 text-sm mb-1">{appointment.start} • {appointment.typeName ?? appointment.type}</div>
                  <div className="text-white/60 text-xs">{appointment.notes ?? ''}</div>
                </div>
              ))
            )}
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