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
  doctorId: string;
  doctorName: string;
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

const TreatmentReport: React.FC<TreatmentReportProps> = ({ doctorProfile }) => {
  const [records, setRecords] = useState<TreatmentReportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterPatient, setFilterPatient] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
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

  const uniqueVisitTypes = useMemo(() => {
    const types = new Set(records.map(r => r.visitType).filter(Boolean));
    return Array.from(types);
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (filterPatient && !r.patientName.toLowerCase().includes(filterPatient.toLowerCase())) return false;
      if (filterDoctor && !r.doctorName.toLowerCase().includes(filterDoctor.toLowerCase())) return false;
      if (filterVisitType && r.visitType !== filterVisitType) return false;
      if (filterStartDate && r.date < filterStartDate) return false;
      if (filterEndDate && r.date > filterEndDate) return false;
      if (filterStatus === 'applied' && !r.treatmentApplied) return false;
      if (filterStatus === 'not_applied' && r.treatmentApplied) return false;
      return true;
    });
  }, [records, filterPatient, filterDoctor, filterVisitType, filterStartDate, filterEndDate, filterStatus]);

  const clearFilters = () => {
    setFilterPatient('');
    setFilterDoctor('');
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
            <p className="text-white/60 text-sm">Tedavi Ekranı üzerinden kaydedilen tüm tedavi geçmişi</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={fetchReports}
              className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-2 text-white/80 text-sm transition-colors"
            >
              Yenile
            </button>
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full px-4 py-1 text-sm font-semibold">
              {filtered.length} kayıt
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Filtreler</h3>
          <button onClick={clearFilters} className="text-white/50 hover:text-white text-sm transition-colors">
            Temizle
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="text-white/60 text-xs mb-1 block">Hasta Adı</label>
            <input
              type="text"
              value={filterPatient}
              onChange={e => setFilterPatient(e.target.value)}
              placeholder="Hasta ara..."
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Doktor</label>
            <input
              type="text"
              value={filterDoctor}
              onChange={e => setFilterDoctor(e.target.value)}
              placeholder="Doktor ara..."
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Ziyaret Türü</label>
            <select
              value={filterVisitType}
              onChange={e => setFilterVisitType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
            >
              <option value="" className="bg-slate-800">Tümü</option>
              {uniqueVisitTypes.map(t => (
                <option key={t} value={t} className="bg-slate-800">
                  {formatVisitType(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Durum</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as 'all' | 'applied' | 'not_applied')}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
            >
              <option value="all" className="bg-slate-800">Tümü</option>
              <option value="applied" className="bg-slate-800">Uygulandı</option>
              <option value="not_applied" className="bg-slate-800">Uygulanmadı</option>
            </select>
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Başlangıç Tarihi</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1 block">Bitiş Tarihi</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        {records.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-white text-lg font-semibold mb-2">Henüz Tedavi Raporu Yok</h3>
            <p className="text-white/50 text-sm">
              Tedavi Ekranı'nda "Tedavi Kaydet" butonuna basıldığında raporlar burada görünecek.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20 bg-white/5">
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Hasta</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Tarih</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Saat</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Doktor</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Ziyaret Türü</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Şikayet</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Uygulanan Tedavi</th>
                  <th className="text-left px-4 py-3 text-white/60 text-xs font-semibold uppercase tracking-wider">Durum</th>
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
                    const treatmentText = row.appliedTreatments?.length
                      ? row.appliedTreatments.join(', ')
                      : row.protocolName || (row.treatmentNotes || '-');
                    const finalTreatmentText = !row.treatmentApplied
                      ? (row.notAppliedReason || 'Belirtilmedi')
                      : treatmentText;

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-white/10 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {row.patientName?.charAt(0) || '?'}
                            </div>
                            <span className="text-white font-medium text-sm">{row.patientName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/80 text-sm whitespace-nowrap">
                          {row.date ? new Date(row.date).toLocaleDateString('tr-TR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-white/80 text-sm whitespace-nowrap">{row.time || '-'}</td>
                        <td className="px-4 py-3 text-white/80 text-sm">{row.doctorName || '-'}</td>
                        <td className="px-4 py-3">
                          <VisitTypeBadge type={row.visitType} />
                        </td>
                        <td className="px-4 py-3 text-white/70 text-sm max-w-[180px]">
                          <span className="line-clamp-2" title={row.complaint}>{row.complaint || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-white/70 text-sm max-w-[200px]">
                          <span className="line-clamp-2" title={finalTreatmentText}>{finalTreatmentText}</span>
                        </td>
                        <td className="px-4 py-3">
                          {row.treatmentApplied ? (
                            <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full px-3 py-0.5 text-xs font-semibold">
                              ✅ Uygulandı
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-3 py-0.5 text-xs font-semibold">
                              ❌ Uygulanmadı
                            </span>
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
  );
};

export default TreatmentReport;
