import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, updateDoc, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import 'react-day-picker/dist/style.css';
import AppointmentModal from '../components/AppointmentModal';
import AppointmentTypeManager from '../components/AppointmentTypeManager';
import AppointmentDetailsModal from '../components/AppointmentDetailsModal';
import MoveAppointmentModal from '../components/MoveAppointmentModal';
import ExcelJS from 'exceljs';

type PanelSection = 'patients' | 'appointments' | 'anamnez' | 'settings' | 'treatment-protocols' | 'users' | 'accounting' | 'pharmacy' | 'prescriptions' | 'assistant-panel' | 'doctor-panel' | 'treatment-panel';

interface AppointmentsProps {
  doctorProfile?: any;
  onSectionChange?: (section: PanelSection) => void;
}

const Appointments: React.FC<AppointmentsProps> = ({ doctorProfile, onSectionChange }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openTypeModal, setOpenTypeModal] = useState(false);
  const [openExcelModal, setOpenExcelModal] = useState(false);
  const [excelStartDate, setExcelStartDate] = useState('');
  const [excelEndDate, setExcelEndDate] = useState('');
  const [openDetailsModal, setOpenDetailsModal] = useState(false);
  const [openMoveModal, setOpenMoveModal] = useState(false);
  const [movingAppointment, setMovingAppointment] = useState<any | null>(null);
  const [editedAppointment, setEditedAppointment] = useState<any | null>(null);
  const [viewedAppointment, setViewedAppointment] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | undefined>(undefined);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | undefined>(undefined);
  
  // Call Center için filtreleme state'leri
  const [filterPatientName, setFilterPatientName] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  
  // Calendar için hasta filtreleme
  const [calendarPatientFilter, setCalendarPatientFilter] = useState('');
  const [patientAllAppointments, setPatientAllAppointments] = useState<any[]>([]);
  const [patientAllAppointmentsLoading, setPatientAllAppointmentsLoading] = useState(false);

  // Rutin Tedavi Programları
  const [activeTab, setActiveTab] = useState<'calendar' | 'routinePrograms' | 'nextAppointments'>('calendar');
  const [routinePrograms, setRoutinePrograms] = useState<any[]>([]);
  const [preselectedPatientId, setPreselectedPatientId] = useState<string | undefined>();
  const [preselectedTypeId, setPreselectedTypeId] = useState<string | undefined>();
  const [schedulingProgramId, setSchedulingProgramId] = useState<string | null>(null);

  // Sonraki Muayeneyi Planla (Operatör)
  const [nextAppRequests, setNextAppRequests] = useState<any[]>([]);
  const [schedulingReqId, setSchedulingReqId] = useState<string | null>(null);


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

  // Helper function to format date as YYYY-MM-DD in local timezone (avoids UTC timezone issues)
  const formatDateISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const WORK_START = '08:45';
  const WORK_END = '19:00';
  const hourSlots = useMemo(() => {
    const start = timeToMinutes(WORK_START);
    const end = timeToMinutes(WORK_END);
    const arr: number[] = [];
    for (let t = start; t <= end; t += 5) arr.push(t);
    return arr;
  }, []);

  // Breakpoint'ler: sadece 5 dakikalık slotlar
  const breakpoints = useMemo(() => {
    return hourSlots;
  }, [hourSlots]);

  // 5 dk grid kaldırıldı; saatlik satırlar üzerinden oransal bloklar gösterilecek

  const dateISO = useMemo(() => formatDateISO(selectedDate), [selectedDate]);

  // Filter appointments by patient name for calendar view
  const filteredAppointments = useMemo(() => {
    if (!calendarPatientFilter.trim()) return appointments;
    const searchTerm = calendarPatientFilter.toLowerCase().trim();
    return appointments.filter(apt => 
      apt.patientName?.toLowerCase().includes(searchTerm)
    );
  }, [appointments, calendarPatientFilter]);

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
        startDate = formatDateISO(start);
        endDate = formatDateISO(end);
      } else { // month
        const { start, end } = getMonthRange(selectedDate);
        startDate = formatDateISO(start);
        endDate = formatDateISO(end);
      }
      
      // Fetch appointments with only clinicId filter to avoid composite index requirement
      // Then filter by date on client side
      const qDay = query(
        collection(db, 'appointments'),
        where('clinicId', '==', doctorProfile.clinicId)
      );
      const snap = await getDocs(qDay);
      
      // Client-side filtering by date range (clinic-wide; clinicId already scopes the query)
      const allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const list = allAppointments.filter(apt => {
        const aptDate = apt.dateISO || '';
        return aptDate >= startDate && aptDate <= endDate;
      });
      
      list.sort((a,b) => {
        const dateCompare = String(a.dateISO||'').localeCompare(String(b.dateISO||''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start||'').localeCompare(String(b.start||''));
      });
      
      // Filtreleme
      let filteredList = list;
      if (filterPatientName) {
        filteredList = filteredList.filter(a =>
          a.patientName?.toLowerCase().includes(filterPatientName.toLowerCase())
        );
      }
      if (filterStartDate) {
        filteredList = filteredList.filter(a => a.dateISO >= filterStartDate);
      }
      if (filterEndDate) {
        filteredList = filteredList.filter(a => a.dateISO <= filterEndDate);
      }
      if (filterStatus !== 'all') {
        filteredList = filteredList.filter(a => a.status === filterStatus);
      }

      console.log('📅 Appointments: Found appointments:', filteredList.length);
      setAppointments(filteredList);
    };
    fetchAppointments();
  }, [dateISO, viewMode, selectedDate, doctorProfile?.clinicId, filterPatientName, filterStartDate, filterEndDate, filterStatus]);

  // Hasta filtrelendiğinde tüm randevuları çek
  useEffect(() => {
    if (!calendarPatientFilter.trim() || !doctorProfile?.clinicId) {
      setPatientAllAppointments([]);
      return;
    }
    const fetchAll = async () => {
      setPatientAllAppointmentsLoading(true);
      const snap = await getDocs(
        query(collection(db, 'appointments'), where('clinicId', '==', doctorProfile.clinicId))
      );
      const searchTerm = calendarPatientFilter.toLowerCase().trim();
      const all = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(apt =>
          apt.patientName?.toLowerCase().includes(searchTerm)
        );
      all.sort((a, b) => {
        const dateCompare = String(a.dateISO || '').localeCompare(String(b.dateISO || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start || '').localeCompare(String(b.start || ''));
      });
      setPatientAllAppointments(all);
      setPatientAllAppointmentsLoading(false);
    };
    fetchAll();
  }, [calendarPatientFilter, doctorProfile?.clinicId, doctorProfile?.uid]);

  // Segment aralığına düşen randevular - sadece başlangıç zamanı bu slot içinde olanlar
  const getAppointmentsForSegment = (segStart: number, segEnd: number) => {
    return filteredAppointments
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

  // Fetch routine programs (real-time)
  useEffect(() => {
    if (!doctorProfile?.clinicId) return;
    const q = query(
      collection(db, 'routine_programs'),
      where('clinicId', '==', doctorProfile.clinicId),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q, (snap) => {
      const programs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      programs.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRoutinePrograms(programs);
    });
    return () => unsub();
  }, [doctorProfile?.clinicId]);

  // Fetch next appointment requests (real-time)
  useEffect(() => {
    if (!doctorProfile?.clinicId) return;
    const q = query(
      collection(db, 'next_appointment_requests'),
      where('clinicId', '==', doctorProfile.clinicId),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      requests.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setNextAppRequests(requests);
    });
    return () => unsub();
  }, [doctorProfile?.clinicId]);

  const exportToExcel = async (startDate?: string, endDate?: string) => {
    if (!doctorProfile?.clinicId) return;

    const snap = await getDocs(
      query(collection(db, 'appointments'), where('clinicId', '==', doctorProfile.clinicId))
    );
    let allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    if (startDate) {
      allAppointments = allAppointments.filter(a => String(a.dateISO || '') >= startDate);
    }
    if (endDate) {
      allAppointments = allAppointments.filter(a => String(a.dateISO || '') <= endDate);
    }
    allAppointments.sort((a, b) => {
      const dateCompare = String(b.dateISO || '').localeCompare(String(a.dateISO || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(b.start || '').localeCompare(String(a.start || ''));
    });

    const statusMap: Record<string, string> = {
      confirmed: 'Onaylandı',
      pending: 'Bekliyor',
      cancelled: 'İptal Edildi',
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'RTM Soft';
    wb.created = new Date();

    const ws = wb.addWorksheet('Randevular');

    // Sütun genişlikleri
    ws.columns = [
      { key: 'patientName', width: 28 },
      { key: 'dateISO',     width: 14 },
      { key: 'start',       width: 10 },
      { key: 'typeName',    width: 24 },
      { key: 'status',      width: 16 },
    ];

    // Başlık satırı
    const headerRow = ws.addRow(['Hasta Adı', 'Tarih', 'Saat', 'Randevu Tipi', 'Durum']);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A7A4A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF0F5C37' } },
      };
    });
    headerRow.height = 22;

    // Veri satırları
    allAppointments.forEach((apt, i) => {
      const row = ws.addRow([
        apt.patientName || '-',
        apt.dateISO     || '-',
        apt.start || apt.time || '-',
        apt.typeName || apt.type || '-',
        statusMap[apt.status] || apt.status || '-',
      ]);

      const isEven = i % 2 === 0;
      row.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFF4FAF7' : 'FFFFFFFF' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { size: 10 };
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFD0E8DB' } },
        };
      });
      row.height = 18;
    });

    // İndir
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Randevular_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
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
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
              setExcelStartDate(monthAgo);
              setExcelEndDate(today);
              setOpenExcelModal(true);
            }}
            className="px-4 py-3 bg-emerald-700/80 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-all duration-200 border border-emerald-500/40 flex items-center gap-2"
          >
            <span>📥</span> Excel İndir
          </button>
          <button
            onClick={() => setOpenTypeModal(true)}
            className="px-4 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200 border border-white/20"
          >
            Randevu Tipi Ekle
          </button>
          <button
            onClick={() => {
              setSelectedSlotDate(undefined);
              setSelectedSlotTime(undefined);
              setOpenAddModal(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-200 shadow-lg"
          >
            + Randevu Ekle
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all ${
            activeTab === 'calendar'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          Takvim
        </button>
        <button
          onClick={() => setActiveTab('routinePrograms')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'routinePrograms'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          Rutin Tedavi Programları
          {routinePrograms.length > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {routinePrograms.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('nextAppointments')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'nextAppointments'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          Sonraki Muayeneyi Planla
          {nextAppRequests.length > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {nextAppRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Routine Programs Tab */}
      {activeTab === 'routinePrograms' && (
        <div className="space-y-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">
              Bekleyen Rutin Tedavi Programları
            </h2>
            {routinePrograms.length === 0 ? (
              <p className="text-white/60 text-center py-8">Bekleyen rutin tedavi programı bulunmuyor.</p>
            ) : (
              <div className="space-y-3">
                {routinePrograms.map((program: any) => (
                  <div key={program.id} className="bg-white/10 border border-white/20 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{program.patientName}</h3>
                        <div className="flex flex-wrap gap-3 mt-2">
                          <span className="text-sm text-white/70 bg-white/10 px-3 py-1 rounded-lg">
                            Protokol: {program.treatmentProtocolName || '-'}
                          </span>
                          <span className="text-sm text-blue-300 bg-blue-500/20 px-3 py-1 rounded-lg">
                            Sıklık: {program.frequency}
                          </span>
                          <span className="text-sm text-green-300 bg-green-500/20 px-3 py-1 rounded-lg">
                            Planlanan: {program.scheduledSessions} / {program.totalSessions} seans
                          </span>
                        </div>
                        {program.notes && (
                          <p className="text-sm text-yellow-300 mt-2">Not: {program.notes}</p>
                        )}
                        {program.doctorName && (
                          <p className="text-xs text-white/50 mt-1">Doktor: {program.doctorName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white">
                            {program.totalSessions - program.scheduledSessions}
                          </div>
                          <div className="text-xs text-white/60">Kalan</div>
                        </div>
                        <button
                          onClick={() => {
                            setPreselectedPatientId(program.patientId);
                            setPreselectedTypeId('tedavi');
                            setSchedulingProgramId(program.id);
                            setSelectedSlotDate(undefined);
                            setSelectedSlotTime(undefined);
                            setEditedAppointment(null);
                            setOpenAddModal(true);
                          }}
                          disabled={program.scheduledSessions >= program.totalSessions}
                          className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                          Randevu Planla
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(program.scheduledSessions / program.totalSessions) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sonraki Muayeneyi Planla Tab (Operatör) */}
      {activeTab === 'nextAppointments' && (
        <div className="space-y-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">
              Sonraki Muayeneyi Planla
            </h2>
            {nextAppRequests.length === 0 ? (
              <p className="text-white/60 text-center py-8">Bekleyen muayene planı talebi bulunmuyor.</p>
            ) : (
              <div className="space-y-4">
                {nextAppRequests.map((req: any) => (
                  <div key={req.id} className="bg-white/10 border border-white/20 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{req.patientName}</h3>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {req.suggestedDateISO && (
                            <span className="text-sm text-blue-300 bg-blue-500/20 px-3 py-1 rounded-lg">
                              Önerilen: {req.suggestedDateISO} — {String(req.suggestedHour ?? 9).padStart(2, '0')}:{String(req.suggestedMinute ?? 0).padStart(2, '0')}
                            </span>
                          )}
                          <span className="text-sm text-green-300 bg-green-500/20 px-3 py-1 rounded-lg">
                            Muayene
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPreselectedPatientId(req.patientId);
                          setPreselectedTypeId('kontrol');
                          setSchedulingReqId(req.id);
                          if (req.suggestedDateISO) {
                            const [y, mo, d] = req.suggestedDateISO.split('-').map(Number);
                            setSelectedSlotDate(new Date(y, mo - 1, d));
                          } else {
                            setSelectedSlotDate(undefined);
                          }
                          if (req.suggestedHour !== undefined) {
                            setSelectedSlotTime(
                              `${String(req.suggestedHour).padStart(2, '0')}:${String(req.suggestedMinute ?? 0).padStart(2, '0')}`
                            );
                          } else {
                            setSelectedSlotTime(undefined);
                          }
                          setEditedAppointment(null);
                          setOpenAddModal(true);
                        }}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:scale-105 transition-all shadow-lg ml-4"
                      >
                        Muayene Planla
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'calendar' && <>
      {/* Filtreleme */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Filtreleme</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Hasta Adı</label>
            <input
              type="text"
              value={filterPatientName}
              onChange={(e) => setFilterPatientName(e.target.value)}
              placeholder="Hasta adı ile ara..."
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Başlangıç Tarihi</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Bitiş Tarihi</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white/80 mb-2">Durum</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all" className="bg-gray-800 text-white">Tümü</option>
              <option value="confirmed" className="bg-gray-800 text-white">Onaylanan</option>
              <option value="pending" className="bg-gray-800 text-white">Beklemede</option>
              <option value="cancelled" className="bg-gray-800 text-white">İptal</option>
            </select>
          </div>
        </div>
        {(filterPatientName || filterStartDate || filterEndDate || filterStatus !== 'all') && (
          <button
            onClick={() => {
              setFilterPatientName('');
              setFilterStartDate('');
              setFilterEndDate('');
              setFilterStatus('all');
            }}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-300 hover:text-red-200 transition-all duration-200 text-sm font-semibold"
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Calendar Controls */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        {/* Patient Filter for Calendar */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-semibold text-white/80 mb-2">🔍 Hasta Ara</label>
              <div className="relative">
                <input
                  type="text"
                  value={calendarPatientFilter}
                  onChange={(e) => setCalendarPatientFilter(e.target.value)}
                  placeholder="Hasta adıyla filtrele..."
                  className="w-full px-4 py-2.5 pl-10 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-200"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">👤</span>
                {calendarPatientFilter && (
                  <button
                    onClick={() => setCalendarPatientFilter('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                    title="Temizle"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {calendarPatientFilter && (
              <div className="pt-6">
                <div className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300 text-sm font-semibold">
                  {filteredAppointments.length} randevu bulundu
                </div>
              </div>
            )}
          </div>
        </div>
        
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
              
              // Separate active and cancelled appointments
              const activeAppointments = list.filter(({ a }) => a.status !== 'cancelled');
              const cancelledAppointments = list.filter(({ a }) => a.status === 'cancelled');
              const hasActiveAny = activeAppointments.length > 0;
              const hasCancelledAny = cancelledAppointments.length > 0;
              
              // Calculate row height based on max of active or cancelled appointments
              const activeHeight = Math.max(1, activeAppointments.length) * 56;
              const cancelledHeight = Math.max(1, cancelledAppointments.length) * 44;
              const rowHeight = Math.max(56, hasActiveAny ? activeHeight : 56, hasCancelledAny && !hasActiveAny ? cancelledHeight : 0);

              // Check if this time slot is in the past
              const isToday = selectedDate.toDateString() === currentTime.toDateString();
              const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
              const isPast = isToday && next <= currentMinutes;

              return (
                <div key={`${bp}-${next}`} className={`flex items-stretch gap-4 p-4 rounded-xl transition-all duration-200 ${isPast ? 'bg-white/5 opacity-50' : 'bg-white/5 hover:bg-white/10'}`}>
                  <div className="w-20 text-center flex-shrink-0">
                    <div className="text-white font-semibold">{minutesToTime(bp)}</div>
                    <div className="text-white/60 text-xs">{minutesToTime(next)}</div>
                  </div>
                  
                  {/* Main content area - split vertically if both active and cancelled exist */}
                  <div className="flex-1 flex gap-2" style={{ minHeight: rowHeight }}>
                    {/* Active appointments section */}
                    <div className={`${hasCancelledAny && hasActiveAny ? 'flex-[3]' : 'flex-1'} relative border border-white/10 rounded-lg ${hasActiveAny ? 'bg-transparent' : 'bg-white/5'}`}>
                      {/* Empty slot message - only show if no active appointments */}
                      {!hasActiveAny && (
                        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">Boş</div>
                      )}
                      
                      {/* Active appointments - full size, prominent */}
                      {activeAppointments.map(({ a, dur }, idx2) => {
                        const endLabel = minutesToTime((a.start ? timeToMinutes(a.start) : timeToMinutes(a.time)) + dur);
                        const statusBg = a.status === 'confirmed' ? 'bg-green-500/20 border-green-500/30' : 'bg-yellow-500/20 border-yellow-500/30';
                        return (
                          <div key={`active-${a.id}-${idx2}`}
                            className={`absolute inset-x-0 border ${statusBg} rounded-md p-3 overflow-hidden`}
                            style={{ top: idx2 * 56 }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-white text-sm font-semibold truncate pr-2">{a.patientName}</div>
                              <div className="flex items-center gap-1">
                                {a.status === 'confirmed' && a.patientArrived && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-teal-500/30 text-teal-300 border-teal-400/40">
                                    ✓ Geldi
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusColor(a.status)}`}>
                                  {a.status === 'confirmed' ? 'Onaylandı' : 'Beklemede'}
                                </span>
                              </div>
                            </div>
                            <div className="text-white/80 text-xs truncate">{a.typeName ?? a.type} • {dur} dk</div>
                            <div className="text-white/60 text-[11px]">{a.start ?? a.time} - {endLabel}</div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Cancelled appointments section - only show if there are cancelled appointments */}
                    {hasCancelledAny && (
                      <div className={`${hasActiveAny ? 'flex-1' : 'flex-1'} relative border border-red-500/20 rounded-lg bg-red-500/5 overflow-hidden`}>
                        {/* Cancelled header */}
                        <div className="sticky top-0 bg-red-500/20 px-2 py-1 border-b border-red-500/20">
                          <span className="text-red-300 text-[10px] font-semibold uppercase tracking-wide">İptal ({cancelledAppointments.length})</span>
                        </div>
                        
                        {/* Cancelled appointments list */}
                        <div className="p-1 space-y-1">
                          {cancelledAppointments.map(({ a }, idx2) => {
                            return (
                              <div key={`cancelled-${a.id}-${idx2}`}
                                className="bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 cursor-pointer hover:bg-red-500/20 transition-colors"
                                onClick={() => { setViewedAppointment(a); setOpenDetailsModal(true); }}
                                title={a.cancelReason ? `Sebep: ${a.cancelReason}` : 'Detayları görüntüle'}
                              >
                                <div className="text-white/60 text-xs font-medium truncate line-through">{a.patientName}</div>
                                <div className="text-red-300/60 text-[10px] truncate">{a.cancelReason || a.typeName || a.type}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-center justify-center gap-2 w-12 flex-shrink-0">
                    {hasActiveAny ? (
                      <>
                        <button
                          title="İncele"
                          onClick={() => { setViewedAppointment(activeAppointments[0].a); setOpenDetailsModal(true); }}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 hover:text-blue-200 transition-colors duration-150 cursor-pointer"
                        >👁️</button>
                        <button
                          title="Düzenle"
                          onClick={() => { setEditedAppointment(activeAppointments[0].a); setOpenAddModal(true); }}
                          className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-300 hover:text-green-200 transition-colors duration-150 cursor-pointer"
                        >✏️</button>
                      </>
                    ) : (
                      <button
                        aria-label="Yeni randevu ekle"
                        disabled={isPast}
                        onClick={() => {
                          setEditedAppointment(null);
                          setSelectedSlotDate(selectedDate);
                          setSelectedSlotTime(minutesToTime(bp));
                          setOpenAddModal(true);
                        }}
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

            // Saatlik slotlar (08:45 - 19:00)
            const timeSlots = Array.from({ length: 11 }, (_, i) => 8 + i); // 8-19 arası saatler

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
                      
                      return (
                        <div key={hour} className="grid grid-cols-8 gap-2">
                          {/* Saat etiketi */}
                          <div className="text-white/70 text-xs font-semibold text-center py-2">
                            {timeStr}
                          </div>
                          
                          {/* Her gün için slot */}
                          {weekDays.map((day) => {
                            const dayISO = formatDateISO(day);
                            const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
                            
                            // Bu saat aralığındaki randevular
                            const slotAppointments = filteredAppointments.filter(a => {
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
                      const dayISO = formatDateISO(day);
                      const dayAppointments = filteredAppointments.filter(a => a.dateISO === dayISO);
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
                      const dayISO = formatDateISO(currentDay);
                      const dayAppointments = filteredAppointments.filter(a => a.dateISO === dayISO);
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

        {/* Yaklaşan Randevular */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-2">
            {calendarPatientFilter ? 'Tüm Randevular' : viewMode === 'day' ? 'Yaklaşan Randevular' : 'Randevular'}
          </h2>
          {calendarPatientFilter && (
            <p className="text-white/50 text-xs mb-4">Geçmiş ve gelecek tüm randevular gösteriliyor</p>
          )}

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {calendarPatientFilter ? (
              patientAllAppointmentsLoading ? (
                <div className="text-white/40 text-center py-8">Yükleniyor...</div>
              ) : patientAllAppointments.length === 0 ? (
                <div className="text-white/40 text-center py-8">Aradığınız hastaya ait randevu bulunamadı</div>
              ) : (
                patientAllAppointments.map((appointment) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isPast = appointment.dateISO < today;
                  return (
                    <div
                      key={appointment.id}
                      className={`bg-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors ${isPast ? 'opacity-60' : ''}`}
                      onClick={() => { setViewedAppointment(appointment); setOpenDetailsModal(true); }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-white font-semibold">{appointment.patientName}</div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(appointment.status)}`}>
                          {appointment.status === 'confirmed' ? 'Onaylandı' :
                           appointment.status === 'pending' ? 'Beklemede' : 'İptal'}
                        </span>
                      </div>
                      <div className="text-white/60 text-xs mb-1 flex items-center gap-2">
                        {appointment.dateISO}
                        {isPast && <span className="text-white/40 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">Geçmiş</span>}
                      </div>
                      <div className="text-white/70 text-sm mb-1">{appointment.start} • {appointment.typeName ?? appointment.type}</div>
                      <div className="text-white/60 text-xs">{appointment.notes ?? ''}</div>
                    </div>
                  );
                })
              )
            ) : filteredAppointments.length === 0 ? (
              <div className="text-white/40 text-center py-8">Randevu bulunamadı</div>
            ) : (
              filteredAppointments.map((appointment) => (
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
      </>}

      {/* Modals */}
      <AppointmentModal
        isOpen={openAddModal}
        onClose={() => {
          setOpenAddModal(false);
          setEditedAppointment(null);
          setSelectedSlotDate(undefined);
          setSelectedSlotTime(undefined);
          setPreselectedPatientId(undefined);
          setPreselectedTypeId(undefined);
          setSchedulingProgramId(null);
          setSchedulingReqId(null);
        }}
        onAdded={() => {
          (async () => {
            if (!doctorProfile?.clinicId) return;
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId)
            );
            const snap = await getDocs(qDay);
            const allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            const list = allAppointments.filter(apt => apt.dateISO === dateISO);
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);

            // If scheduling from a routine program, increment scheduledSessions
            if (schedulingProgramId) {
              try {
                const programRef = doc(db, 'routine_programs', schedulingProgramId);
                const programSnap = await getDoc(programRef);
                if (programSnap.exists()) {
                  const programData = programSnap.data();
                  const newScheduled = (programData.scheduledSessions || 0) + 1;
                  const updates: any = { scheduledSessions: newScheduled };
                  if (newScheduled >= programData.totalSessions) {
                    updates.status = 'completed';
                  }
                  await updateDoc(programRef, updates);
                }
              } catch (err) {
                console.error('Error updating routine program:', err);
              }
              setSchedulingProgramId(null);
            }

            if (schedulingReqId) {
              try {
                await updateDoc(doc(db, 'next_appointment_requests', schedulingReqId), {
                  status: 'completed',
                  updatedAt: new Date().toISOString(),
                });
              } catch (err) {
                console.error('Error updating next_appointment_request:', err);
              }
              setSchedulingReqId(null);
            }

            setPreselectedPatientId(undefined);
            setPreselectedTypeId(undefined);
          })();
        }}
        editedAppointment={editedAppointment}
        doctorProfile={doctorProfile}
        doctorId={doctorProfile?.uid}
        initialDate={selectedSlotDate}
        initialTime={selectedSlotTime}
        initialPatientId={preselectedPatientId}
        initialTypeId={preselectedTypeId}
        routineProgramId={schedulingProgramId || undefined}
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
        onCancelled={() => {
          (async () => {
            if (!doctorProfile?.clinicId) return;
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId)
            );
            const snap = await getDocs(qDay);
            const allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            const list = allAppointments.filter(apt => apt.dateISO === dateISO);
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);
          })();
        }}
        onStatusUpdated={() => {
          (async () => {
            if (!doctorProfile?.clinicId) return;
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId)
            );
            const snap = await getDocs(qDay);
            const allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            const list = allAppointments.filter(apt => apt.dateISO === dateISO);
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);
          })();
        }}
        onMove={() => {
          setMovingAppointment(viewedAppointment);
          setOpenDetailsModal(false);
          setOpenMoveModal(true);
        }}
        onNavigate={onSectionChange}
      />

      <MoveAppointmentModal
        isOpen={openMoveModal}
        appointment={movingAppointment}
        doctorProfile={doctorProfile}
        onClose={() => { setOpenMoveModal(false); setMovingAppointment(null); }}
        onMoved={() => {
          (async () => {
            if (!doctorProfile?.clinicId) return;
            const qDay = query(
              collection(db, 'appointments'),
              where('clinicId', '==', doctorProfile.clinicId)
            );
            const snap = await getDocs(qDay);
            const allAppointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            const list = allAppointments.filter(apt => apt.dateISO === dateISO);
            list.sort((a,b) => String(a.start||'').localeCompare(String(b.start||'')));
            setAppointments(list);
          })();
        }}
      />

      {openExcelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenExcelModal(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Excel İndir</h2>
              <button
                onClick={() => setOpenExcelModal(false)}
                className="text-white/60 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-white/70 text-sm mb-4">
              Randevuları indirmek istediğiniz tarih aralığını seçin.
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-white/80 text-sm mb-1">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={excelStartDate}
                  onChange={(e) => setExcelStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm mb-1">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={excelEndDate}
                  onChange={(e) => setExcelEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpenExcelModal(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20"
              >
                İptal
              </button>
              <button
                onClick={async () => {
                  if (excelStartDate && excelEndDate && excelStartDate > excelEndDate) {
                    alert('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
                    return;
                  }
                  await exportToExcel(excelStartDate || undefined, excelEndDate || undefined);
                  setOpenExcelModal(false);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
              >
                İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Appointments;