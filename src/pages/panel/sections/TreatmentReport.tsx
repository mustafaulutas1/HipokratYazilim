import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface TreatmentReportProps {
  doctorProfile?: {
    clinicId: string;
    fullName?: string;
    role?: string;
    userType?: string;
  } | null;
}

interface TreatmentReportRecord {
  id: string;
  patientId: string;
  patientName: string;
  clinicId: string;
  date: string;
  time: string;
  performerName: string;
  assignedDoctorName?: string;
  // legacy field fallback
  doctorName?: string;
  visitType: string;
  complaint: string;
  appliedTreatments: string[];
  treatmentApplied: boolean;
  treatmentNotes: string;
  notAppliedReason: string;
  protocolName: string;
  createdAt: string;
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  tedavi: 'Tedavi',
  kontrol: 'Kontrol Muayenesi',
  muayene: 'Muayene',
  ilk_muayene: 'İlk Muayene',
  'ilk-muayene': 'İlk Muayene',
  rutin_tedavi: 'Rutin Tedavi',
};

const VISIT_TYPE_COLORS: Record<string, string> = {
  'Tedavi': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Kontrol Muayenesi': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Muayene': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'İlk Muayene': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Rutin Tedavi': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const formatVisitType = (type?: string): string => {
  if (!type) return '-';
  return VISIT_TYPE_LABELS[type.toLowerCase()] ?? VISIT_TYPE_LABELS[type] ?? type;
};

const VisitTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const label = formatVisitType(type);
  const colorClass = VISIT_TYPE_COLORS[label] || 'bg-white/10 text-white/60 border-white/20';
  return (
    <span className={`inline-block border rounded-full px-3 py-0.5 text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  );
};

// Horizontal bar chart component
const HBarChart: React.FC<{ data: { label: string; value: number; color?: string }[]; max: number }> = ({ data, max }) => (
  <div className="space-y-2">
    {data.map((item, i) => (
      <div key={i} className="flex items-center gap-3">
        <span className="text-white/70 text-xs w-28 truncate shrink-0 text-right" title={item.label}>{item.label}</span>
        <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2 ${item.color || 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
            style={{ width: max > 0 ? `${(item.value / max) * 100}%` : '0%' }}
          >
            {item.value > 0 && (
              <span className="text-white text-xs font-bold">{item.value}</span>
            )}
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Vertical bar chart component
const VBarChart: React.FC<{ data: { label: string; value: number }[]; color?: string }> = ({ data, color }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-32 w-full">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-white/60 text-xs">{item.value > 0 ? item.value : ''}</span>
          <div className="w-full bg-white/5 rounded-t-lg overflow-hidden flex items-end" style={{ height: '80px' }}>
            <div
              className={`w-full rounded-t-lg transition-all duration-700 ${color || 'bg-gradient-to-t from-cyan-600 to-cyan-400'}`}
              style={{ height: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="text-white/50 text-xs truncate max-w-full text-center">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

// Mini donut/ring stat
const RingStat: React.FC<{ value: number; total: number; color: string; label: string }> = ({ value, total, color, label }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{pct}%</text>
      </svg>
      <span className="text-white/60 text-xs text-center">{label}</span>
      <span className="text-white font-bold text-sm">{value} / {total}</span>
    </div>
  );
};

const TreatmentReport: React.FC<TreatmentReportProps> = ({ doctorProfile }) => {
  const [records, setRecords] = useState<TreatmentReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'table'>('stats');

  const [filterPatient, setFilterPatient] = useState('');
  const [filterPerformer, setFilterPerformer] = useState('');
  const [filterVisitType, setFilterVisitType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'applied' | 'not_applied'>('all');

  useEffect(() => {
    if (!doctorProfile?.clinicId) return;
    fetchReports();
  }, [doctorProfile?.clinicId]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'treatmentReports'),
        where('clinicId', '==', doctorProfile!.clinicId)
      ));
      const data: TreatmentReportRecord[] = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<TreatmentReportRecord, 'id'>) }))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setRecords(data);
    } catch (err) {
      console.error('Tedavi Raporu veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper: get performer name (new field or legacy fallback)
  const getPerformer = (r: TreatmentReportRecord) =>
    r.performerName || r.doctorName || '-';

  // ── Statistics ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = records.length;
    const applied = records.filter(r => r.treatmentApplied).length;
    const notApplied = total - applied;

    // Top performers
    const performerMap = new Map<string, number>();
    records.forEach(r => {
      const name = getPerformer(r);
      if (name && name !== '-') performerMap.set(name, (performerMap.get(name) || 0) + 1);
    });
    const topPerformers = Array.from(performerMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Day of week density (0=Sun..6=Sat)
    const dayCount = Array(7).fill(0);
    records.forEach(r => {
      if (r.date) {
        const d = new Date(r.date).getDay();
        dayCount[d]++;
      }
    });
    const dayData = DAYS_TR.map((label, i) => ({ label: label.slice(0, 3), value: dayCount[i] }));

    // Hourly density
    const hourCount = Array(24).fill(0);
    records.forEach(r => {
      if (r.time) {
        const h = parseInt(r.time.split(':')[0]);
        if (!isNaN(h)) hourCount[h]++;
      }
    });
    // Show only hours 07-22 for readability
    const hourData = Array.from({ length: 16 }, (_, i) => ({
      label: `${i + 7}:00`,
      value: hourCount[i + 7]
    }));

    // Last 6 months trend
    const now = new Date();
    const monthData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { label: MONTHS_TR[d.getMonth()], year: d.getFullYear(), month: d.getMonth(), value: 0 };
    });
    records.forEach(r => {
      if (r.date) {
        const d = new Date(r.date);
        const idx = monthData.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
        if (idx !== -1) monthData[idx].value++;
      }
    });

    // Visit type distribution
    const typeMap = new Map<string, number>();
    records.forEach(r => {
      const label = formatVisitType(r.visitType);
      typeMap.set(label, (typeMap.get(label) || 0) + 1);
    });
    const typeData = Array.from(typeMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    // Most applied treatments
    const treatmentMap = new Map<string, number>();
    records.forEach(r => {
      (r.appliedTreatments || []).forEach(t => {
        if (t) treatmentMap.set(t, (treatmentMap.get(t) || 0) + 1);
      });
      if (!r.appliedTreatments?.length && r.protocolName)
        treatmentMap.set(r.protocolName, (treatmentMap.get(r.protocolName) || 0) + 1);
    });
    const topTreatments = Array.from(treatmentMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Busiest performer
    const busiestPerformer = topPerformers[0]?.label || '-';
    const busiestDay = dayData.reduce((a, b) => b.value > a.value ? b : a, dayData[0]);
    const busiestHour = hourData.reduce((a, b) => b.value > a.value ? b : a, hourData[0]);

    return {
      total, applied, notApplied,
      topPerformers, dayData, hourData, monthData, typeData, topTreatments,
      busiestPerformer, busiestDay, busiestHour,
      maxPerformer: topPerformers[0]?.value || 1,
      maxType: typeData[0]?.value || 1,
      maxTreatment: topTreatments[0]?.value || 1,
    };
  }, [records]);

  const uniqueVisitTypes = useMemo(() => {
    const types = new Set(records.map(r => r.visitType).filter(Boolean));
    return Array.from(types);
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      const performer = getPerformer(r);
      if (filterPatient && !r.patientName.toLowerCase().includes(filterPatient.toLowerCase())) return false;
      if (filterPerformer && !performer.toLowerCase().includes(filterPerformer.toLowerCase())) return false;
      if (filterVisitType && r.visitType !== filterVisitType) return false;
      if (filterStartDate && r.date < filterStartDate) return false;
      if (filterEndDate && r.date > filterEndDate) return false;
      if (filterStatus === 'applied' && !r.treatmentApplied) return false;
      if (filterStatus === 'not_applied' && r.treatmentApplied) return false;
      return true;
    });
  }, [records, filterPatient, filterPerformer, filterVisitType, filterStartDate, filterEndDate, filterStatus]);

  const clearFilters = () => {
    setFilterPatient('');
    setFilterPerformer('');
    setFilterVisitType('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterStatus('all');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white/70">Tedavi raporları yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl">📊</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Tedavi Raporu</h2>
            <p className="text-white/60 text-sm">Tedavi Ekranı üzerinden kaydedilen tüm tedavi geçmişi ve istatistikler</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={fetchReports} className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-2 text-white/80 text-sm transition-colors">
              Yenile
            </button>
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full px-4 py-1 text-sm font-semibold">
              {records.length} kayıt
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-5">
          {([['stats', '📈 İstatistikler'], ['table', '📋 Tablo']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── STATS TAB ── */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {records.length === 0 ? (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-center py-20">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-white text-lg font-semibold mb-2">Henüz Veri Yok</h3>
              <p className="text-white/50 text-sm">Tedavi Ekranı'nda "Tedavi Kaydet" butonuna basıldıkça istatistikler burada görünecek.</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Toplam Tedavi', value: stats.total, icon: '🏥', color: 'from-blue-500/30 to-blue-600/20', border: 'border-blue-500/30' },
                  { label: 'Uygulanan', value: stats.applied, icon: '✅', color: 'from-green-500/30 to-green-600/20', border: 'border-green-500/30' },
                  { label: 'Uygulanmayan', value: stats.notApplied, icon: '❌', color: 'from-red-500/30 to-red-600/20', border: 'border-red-500/30' },
                  { label: 'Tekil Personel', value: new Set(records.map(r => getPerformer(r)).filter(n => n !== '-')).size, icon: '👩‍⚕️', color: 'from-purple-500/30 to-purple-600/20', border: 'border-purple-500/30' },
                ].map((c, i) => (
                  <div key={i} className={`bg-gradient-to-br ${c.color} backdrop-blur-xl border ${c.border} rounded-2xl p-5`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/60 text-xs font-medium mb-1">{c.label}</p>
                        <p className="text-3xl font-bold text-white">{c.value}</p>
                      </div>
                      <span className="text-3xl">{c.icon}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'En Yoğun Personel', value: stats.busiestPerformer, icon: '🏆', sub: `${stats.topPerformers[0]?.value || 0} tedavi` },
                  { label: 'En Yoğun Gün', value: DAYS_TR[stats.dayData.findIndex(d => d === stats.busiestDay)] || '-', icon: '📅', sub: `${stats.busiestDay.value} tedavi` },
                  { label: 'En Yoğun Saat', value: stats.busiestHour.label, icon: '🕐', sub: `${stats.busiestHour.value} tedavi` },
                ].map((h, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 flex items-center gap-4">
                    <span className="text-4xl">{h.icon}</span>
                    <div>
                      <p className="text-white/50 text-xs">{h.label}</p>
                      <p className="text-white font-bold text-lg leading-tight">{h.value}</p>
                      <p className="text-cyan-300 text-xs">{h.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Uygulama oranları (ring stats) */}
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <h3 className="text-white font-bold text-lg mb-6">Tedavi Uygulama Oranları</h3>
                <div className="flex flex-wrap justify-around gap-6">
                  <RingStat value={stats.applied} total={stats.total} color="#22d3ee" label="Uygulanan" />
                  <RingStat value={stats.notApplied} total={stats.total} color="#f87171" label="Uygulanmayan" />
                  {stats.typeData.slice(0, 3).map((t, i) => {
                    const colors = ['#a78bfa', '#34d399', '#fb923c'];
                    return <RingStat key={i} value={t.value} total={stats.total} color={colors[i]} label={t.label} />;
                  })}
                </div>
              </div>

              {/* Charts row 1: Performers + Visit types */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Tedaviyi Gerçekleştirenler</h3>
                  <p className="text-white/40 text-xs mb-4">Kişi başına uygulanan tedavi sayısı</p>
                  {stats.topPerformers.length === 0
                    ? <p className="text-white/40 text-sm">Veri yok</p>
                    : <HBarChart data={stats.topPerformers} max={stats.maxPerformer} />
                  }
                </div>

                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Tedavi Türü Dağılımı</h3>
                  <p className="text-white/40 text-xs mb-4">Ziyaret türüne göre tedavi sayıları</p>
                  {stats.typeData.length === 0
                    ? <p className="text-white/40 text-sm">Veri yok</p>
                    : <HBarChart
                        data={stats.typeData}
                        max={stats.maxType}
                      />
                  }
                </div>
              </div>

              {/* Charts row 2: Daily + Hourly */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Haftanın Günlerine Göre Yoğunluk</h3>
                  <p className="text-white/40 text-xs mb-4">Hangi günler hasta trafiği daha yoğun?</p>
                  <VBarChart data={stats.dayData} color="bg-gradient-to-t from-violet-600 to-violet-400" />
                </div>

                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Saatlik Hasta Yoğunluğu</h3>
                  <p className="text-white/40 text-xs mb-4">Tedavilerin saate göre dağılımı (07:00–22:00)</p>
                  <VBarChart data={stats.hourData} color="bg-gradient-to-t from-emerald-600 to-emerald-400" />
                </div>
              </div>

              {/* Charts row 3: Monthly trend + Top treatments */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Son 6 Ay Tedavi Trendi</h3>
                  <p className="text-white/40 text-xs mb-4">Aylık toplam tedavi sayıları</p>
                  <VBarChart data={stats.monthData} color="bg-gradient-to-t from-cyan-600 to-cyan-400" />
                </div>

                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">En Çok Uygulanan Tedaviler</h3>
                  <p className="text-white/40 text-xs mb-4">Tedavi/protokol bazında uygulama sayıları</p>
                  {stats.topTreatments.length === 0
                    ? <p className="text-white/40 text-sm">Veri yok</p>
                    : <HBarChart
                        data={stats.topTreatments.map(t => ({ ...t, color: 'bg-gradient-to-r from-orange-500 to-amber-500' }))}
                        max={stats.maxTreatment}
                      />
                  }
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TABLE TAB ── */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Filtreler
                <span className="ml-2 text-cyan-300 text-sm">({filtered.length} sonuç)</span>
              </h3>
              <button onClick={clearFilters} className="text-white/50 hover:text-white text-sm transition-colors">Temizle</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                { label: 'Hasta Adı', value: filterPatient, set: setFilterPatient, placeholder: 'Hasta ara...' },
                { label: 'Gerçekleştiren', value: filterPerformer, set: setFilterPerformer, placeholder: 'Personel ara...' },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-white/60 text-xs mb-1 block">{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ))}
              <div>
                <label className="text-white/60 text-xs mb-1 block">Ziyaret Türü</label>
                <select value={filterVisitType} onChange={e => setFilterVisitType(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400">
                  <option value="" className="bg-slate-800">Tümü</option>
                  {uniqueVisitTypes.map(t => <option key={t} value={t} className="bg-slate-800">{formatVisitType(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">Durum</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400">
                  <option value="all" className="bg-slate-800">Tümü</option>
                  <option value="applied" className="bg-slate-800">Uygulandı</option>
                  <option value="not_applied" className="bg-slate-800">Uygulanmadı</option>
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">Başlangıç</label>
                <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">Bitiş</label>
                <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400" />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            {records.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-white text-lg font-semibold mb-2">Henüz Tedavi Raporu Yok</h3>
                <p className="text-white/50 text-sm">Tedavi Ekranı'nda "Tedavi Kaydet" butonuna basıldığında raporlar burada görünecek.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20 bg-white/5">
                      {['Hasta', 'Tarih', 'Saat', 'Tedaviyi Gerçekleştiren', 'Ziyaret Türü', 'Şikayet', 'Uygulanan Tedavi', 'Durum'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-white/40">
                          <div className="text-3xl mb-2">🔍</div>
                          <p>Filtre kriterlerine uygun kayıt bulunamadı.</p>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row, idx) => {
                        const performer = getPerformer(row);
                        const treatmentText = row.appliedTreatments?.length
                          ? row.appliedTreatments.join(', ')
                          : row.protocolName || row.treatmentNotes || '-';
                        const finalTreatmentText = !row.treatmentApplied
                          ? (row.notAppliedReason || 'Belirtilmedi')
                          : treatmentText;

                        return (
                          <tr key={row.id} className={`border-b border-white/10 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {row.patientName?.charAt(0) || '?'}
                                </div>
                                <span className="text-white font-medium text-sm whitespace-nowrap">{row.patientName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-white/80 text-sm whitespace-nowrap">
                              {row.date ? new Date(row.date).toLocaleDateString('tr-TR') : '-'}
                            </td>
                            <td className="px-4 py-3 text-white/80 text-sm whitespace-nowrap">{row.time || '-'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {performer?.charAt(0) || '?'}
                                </div>
                                <span className="text-white/80 text-sm whitespace-nowrap">{performer}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><VisitTypeBadge type={row.visitType} /></td>
                            <td className="px-4 py-3 text-white/70 text-sm max-w-[160px]">
                              <span className="line-clamp-2" title={row.complaint}>{row.complaint || '-'}</span>
                            </td>
                            <td className="px-4 py-3 text-white/70 text-sm max-w-[180px]">
                              <span className="line-clamp-2" title={finalTreatmentText}>{finalTreatmentText}</span>
                            </td>
                            <td className="px-4 py-3">
                              {row.treatmentApplied ? (
                                <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap">✅ Uygulandı</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap">❌ Uygulanmadı</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TreatmentReport;
