import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface SurveyData {
  ratings: {
    overall_satisfaction?: number;
    staff_friendliness?: number;
    treatment_effectiveness?: number;
    cleanliness?: number;
    recommendation?: number;
  };
  averageRating: number;
  additionalFeedback?: string;
  completedAt: string;
}

interface PatientWithSurvey {
  id: string;
  fullName: string;
  dischargeSurvey: SurveyData;
}

interface SurveyAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId?: string;
}

const questionMeta: { id: keyof SurveyData['ratings']; label: string; icon: string }[] = [
  { id: 'overall_satisfaction', label: 'Genel Memnuniyet', icon: '😊' },
  { id: 'staff_friendliness', label: 'Personel İlgisi', icon: '👨‍⚕️' },
  { id: 'treatment_effectiveness', label: 'Tedavi Etkinliği', icon: '💊' },
  { id: 'cleanliness', label: 'Hijyen & Temizlik', icon: '✨' },
  { id: 'recommendation', label: 'Tavsiye Edilirlik', icon: '🌟' },
];

const ratingLabels = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'];

const getRatingColor = (avg: number) => {
  if (avg >= 4.5) return 'from-emerald-400 to-green-500';
  if (avg >= 3.5) return 'from-green-400 to-teal-500';
  if (avg >= 2.5) return 'from-yellow-400 to-amber-500';
  if (avg >= 1.5) return 'from-orange-400 to-orange-500';
  return 'from-red-400 to-red-500';
};

const getRatingBadgeClass = (rating: number) => {
  if (rating >= 5) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (rating >= 4) return 'bg-green-500/20 text-green-300 border-green-500/30';
  if (rating >= 3) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  if (rating >= 2) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  return 'bg-red-500/20 text-red-300 border-red-500/30';
};

const StarRating: React.FC<{ value: number; max?: number }> = ({ value, max = 5 }) => {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`text-sm transition-colors ${
            i < Math.round(value) ? 'text-yellow-400' : 'text-white/20'
          }`}
        >
          ★
        </span>
      ))}
      <span className="text-white/70 text-xs ml-1">{value.toFixed(1)}</span>
    </div>
  );
};

const SurveyAnalyticsModal: React.FC<SurveyAnalyticsModalProps> = ({
  isOpen,
  onClose,
  clinicId,
}) => {
  const [patients, setPatients] = useState<PatientWithSurvey[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'comments'>('overview');

  useEffect(() => {
    if (!isOpen || !clinicId) return;
    fetchSurveyData();
  }, [isOpen, clinicId]);

  const fetchSurveyData = async () => {
    try {
      setLoading(true);
      const patientsRef = collection(db, 'patients');
      const q = query(patientsRef, where('clinicId', '==', clinicId));
      const snapshot = await getDocs(q);

      const withSurvey: PatientWithSurvey[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.dischargeSurvey && data.dischargeSurvey.ratings) {
          withSurvey.push({
            id: doc.id,
            fullName: data.fullName || 'Bilinmiyor',
            dischargeSurvey: data.dischargeSurvey,
          });
        }
      });

      // Sort by date descending
      withSurvey.sort(
        (a, b) =>
          new Date(b.dischargeSurvey.completedAt).getTime() -
          new Date(a.dischargeSurvey.completedAt).getTime()
      );

      setPatients(withSurvey);
    } catch (err) {
      console.error('Error fetching survey data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ── Aggregate calculations ──
  const totalSurveys = patients.length;

  const questionAverages = questionMeta.map(({ id, label, icon }) => {
    const vals = patients
      .map((p) => p.dischargeSurvey.ratings[id])
      .filter((v): v is number => typeof v === 'number');
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { id, label, icon, avg, count: vals.length };
  });

  const overallAvg =
    patients.length > 0
      ? patients.reduce((sum, p) => sum + p.dischargeSurvey.averageRating, 0) / patients.length
      : 0;

  const bestQuestion = [...questionAverages].sort((a, b) => b.avg - a.avg)[0];
  const latestSurveyDate =
    patients.length > 0
      ? new Date(patients[0].dischargeSurvey.completedAt).toLocaleDateString('tr-TR')
      : '-';

  const patientsWithComments = patients.filter(
    (p) => p.dischargeSurvey.additionalFeedback?.trim()
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-3xl flex flex-col"
        style={{
          background: 'linear-gradient(135deg, #1a1040 0%, #0d0824 50%, #120d30 100%)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          boxShadow: '0 25px 80px rgba(139, 92, 246, 0.25), 0 0 0 1px rgba(139,92,246,0.1)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex-shrink-0 p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(236,72,153,0.2) 100%)',
            borderBottom: '1px solid rgba(139,92,246,0.2)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  boxShadow: '0 8px 24px rgba(139,92,246,0.4)',
                }}
              >
                📊
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Memnuniyet Anketi Analizi</h2>
                <p className="text-white/60 text-sm mt-0.5">
                  Taburcu olan hastaların geri bildirim özeti
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-5">
            {[
              { key: 'overview', label: '📈 Genel Bakış' },
              { key: 'table', label: '📋 Hasta Detayları' },
              { key: 'comments', label: `💬 Yorumlar (${patientsWithComments.length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === key
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
                style={
                  activeTab === key
                    ? {
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(236,72,153,0.4))',
                        border: '1px solid rgba(139,92,246,0.5)',
                      }
                    : { border: '1px solid transparent' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-white/60 text-lg animate-pulse">Veriler yükleniyor...</div>
            </div>
          ) : totalSurveys === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-6xl mb-4">📭</div>
              <div className="text-white/60 text-lg">Henüz tamamlanmış anket yok</div>
              <div className="text-white/40 text-sm mt-1">
                Hastalar taburcu edildiğinde anket verileri burada görünecek
              </div>
            </div>
          ) : (
            <>
              {/* ── OVERVIEW TAB ── */}
              {activeTab === 'overview' && (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {
                        icon: '📋',
                        label: 'Toplam Anket',
                        value: totalSurveys.toString(),
                        sub: 'tamamlandı',
                        color: 'from-violet-500 to-purple-600',
                      },
                      {
                        icon: '⭐',
                        label: 'Genel Ortalama',
                        value: overallAvg.toFixed(1),
                        sub: '/ 5.0 puan',
                        color: 'from-amber-400 to-orange-500',
                      },
                      {
                        icon: '🏆',
                        label: 'En Yüksek Alan',
                        value: bestQuestion?.icon || '-',
                        sub: bestQuestion?.label || '-',
                        color: 'from-emerald-400 to-teal-500',
                      },
                      {
                        icon: '📅',
                        label: 'Son Anket',
                        value: latestSurveyDate,
                        sub: 'tarihi',
                        color: 'from-sky-400 to-blue-500',
                      },
                    ].map((kpi, i) => (
                      <div
                        key={i}
                        className="rounded-2xl p-4"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-xl mb-3 shadow-lg`}
                        >
                          {kpi.icon}
                        </div>
                        <div className="text-xl font-bold text-white">{kpi.value}</div>
                        <div className="text-white/50 text-xs mt-0.5">{kpi.sub}</div>
                        <div className="text-white/70 text-sm font-medium mt-1">{kpi.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Overall star display */}
                  <div
                    className="rounded-2xl p-5 flex items-center justify-between"
                    style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))',
                      border: '1px solid rgba(139,92,246,0.25)',
                    }}
                  >
                    <div>
                      <div className="text-white/60 text-sm mb-1">Klinik Genel Puanı</div>
                      <div className="text-5xl font-black text-white">{overallAvg.toFixed(2)}</div>
                      <div className="mt-2">
                        <StarRating value={overallAvg} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-8xl opacity-20">⭐</div>
                    </div>
                  </div>

                  {/* Bar Chart - Per Question */}
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <h3 className="text-white font-semibold mb-4 text-lg">
                      Soru Bazında Ortalama Puanlar
                    </h3>
                    <div className="space-y-4">
                      {questionAverages.map(({ id, label, icon, avg }) => {
                        const pct = (avg / 5) * 100;
                        const colorClass = getRatingColor(avg);
                        return (
                          <div key={id}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 text-white/80 text-sm">
                                <span className="text-base">{icon}</span>
                                <span>{label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <StarRating value={avg} />
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRatingBadgeClass(
                                    avg
                                  )}`}
                                >
                                  {ratingLabels[Math.round(avg)] || '?'}
                                </span>
                              </div>
                            </div>
                            <div
                              className="h-3 rounded-full overflow-hidden"
                              style={{ background: 'rgba(255,255,255,0.08)' }}
                            >
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-700`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rating Distribution */}
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <h3 className="text-white font-semibold mb-4 text-lg">
                      Puan Dağılımı (Tüm Anketler)
                    </h3>
                    {[5, 4, 3, 2, 1].map((score) => {
                      const allRatings = patients.flatMap((p) =>
                        Object.values(p.dischargeSurvey.ratings).filter(
                          (v): v is number => typeof v === 'number'
                        )
                      );
                      const count = allRatings.filter((v) => v === score).length;
                      const pct = allRatings.length > 0 ? (count / allRatings.length) * 100 : 0;
                      const emojis = ['', '😞', '😕', '😐', '😊', '🤩'];
                      const colors = [
                        '',
                        'from-red-500 to-red-600',
                        'from-orange-500 to-orange-600',
                        'from-yellow-500 to-amber-500',
                        'from-green-500 to-green-600',
                        'from-emerald-500 to-teal-500',
                      ];
                      return (
                        <div key={score} className="flex items-center gap-3 mb-2.5">
                          <span className="text-lg w-6">{emojis[score]}</span>
                          <span className="text-white/60 text-sm w-16">{ratingLabels[score]}</span>
                          <div
                            className="flex-1 h-2.5 rounded-full overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.08)' }}
                          >
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${colors[score]} transition-all duration-700`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-white/50 text-xs w-12 text-right">
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── TABLE TAB ── */}
              {activeTab === 'table' && (
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: 'rgba(139,92,246,0.15)' }}>
                          <th className="px-4 py-3 text-left text-white/70 text-sm font-semibold">
                            Hasta
                          </th>
                          <th className="px-4 py-3 text-left text-white/70 text-sm font-semibold">
                            Tarih
                          </th>
                          {questionMeta.map((q) => (
                            <th
                              key={q.id}
                              className="px-3 py-3 text-center text-white/70 text-sm font-semibold"
                              title={q.label}
                            >
                              {q.icon}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center text-white/70 text-sm font-semibold">
                            Ort.
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {patients.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-white/5 transition-colors duration-150"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {p.fullName
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)}
                                </div>
                                <span className="text-white text-sm font-medium whitespace-nowrap">
                                  {p.fullName}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-white/60 text-sm whitespace-nowrap">
                              {new Date(p.dischargeSurvey.completedAt).toLocaleDateString('tr-TR')}
                            </td>
                            {questionMeta.map((q) => {
                              const val = p.dischargeSurvey.ratings[q.id];
                              return (
                                <td key={q.id} className="px-3 py-3 text-center">
                                  {val !== undefined ? (
                                    <span
                                      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold border ${getRatingBadgeClass(
                                        val
                                      )}`}
                                    >
                                      {val}
                                    </span>
                                  ) : (
                                    <span className="text-white/20">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-white font-bold text-sm">
                                  {p.dischargeSurvey.averageRating.toFixed(1)}
                                </span>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={`text-xs ${
                                        i < Math.round(p.dischargeSurvey.averageRating)
                                          ? 'text-yellow-400'
                                          : 'text-white/15'
                                      }`}
                                    >
                                      ★
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Legend */}
                  <div
                    className="px-4 py-3 flex flex-wrap gap-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-white/40 text-xs">Sütun açıklamaları:</span>
                    {questionMeta.map((q) => (
                      <span key={q.id} className="text-white/50 text-xs">
                        {q.icon} {q.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── COMMENTS TAB ── */}
              {activeTab === 'comments' && (
                <div className="space-y-4">
                  {patientsWithComments.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                      <div className="text-4xl mb-3">💬</div>
                      <div>Yazılı yorum bulunamadı</div>
                    </div>
                  ) : (
                    patientsWithComments.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-2xl p-5"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                              {p.fullName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)}
                            </div>
                            <div>
                              <div className="text-white font-semibold text-sm">{p.fullName}</div>
                              <div className="text-white/40 text-xs">
                                {new Date(p.dischargeSurvey.completedAt).toLocaleDateString(
                                  'tr-TR'
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={`text-sm ${
                                  i < Math.round(p.dischargeSurvey.averageRating)
                                    ? 'text-yellow-400'
                                    : 'text-white/15'
                                }`}
                              >
                                ★
                              </span>
                            ))}
                            <span className="text-white/60 text-sm ml-1">
                              {p.dischargeSurvey.averageRating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed italic pl-2 border-l-2 border-violet-500/40">
                          "{p.dischargeSurvey.additionalFeedback}"
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurveyAnalyticsModal;
