import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { LineChart, Line } from 'recharts';
import { db } from '../../../firebase/config';
import type { LabTestResult, LabFlag } from '../../../utils/biyokimyaPdfParser';

interface LabReportDoc {
  id: string;
  reportDate: string;
  uploadedAt: string;
  fileUrl: string;
  fileName: string;
  tests: LabTestResult[];
}

interface LabTrendTabProps {
  patientId: string;
}

interface TrendTest {
  section: string;
  testName: string;
  unit: string;
  byDate: Map<string, LabTestResult>;
}

const SECTION_ORDER = ['Biyokimya', 'Hormon', 'Hematoloji', 'İdrar', 'Elektroforez'];

const FLAG_BADGE: Record<LabFlag, { label: string; className: string } | null> = {
  normal: null,
  high: { label: 'Yüksek', className: 'bg-red-50 text-red-700 border border-red-200' },
  low: { label: 'Düşük', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  critical_high: { label: 'Kritik Yüksek', className: 'bg-red-100 text-red-800 border border-red-300 font-semibold' },
  critical_low: { label: 'Kritik Düşük', className: 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold' },
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return <div className="w-20 h-8" />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <LineChart width={80} height={32} data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
      <Line
        type="monotone"
        dataKey="v"
        stroke="#9ca3af"
        strokeWidth={2}
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
};

const LabTrendTab: React.FC<LabTrendTabProps> = ({ patientId }) => {
  const [reports, setReports] = useState<LabReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'patients', patientId, 'labReports'));
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LabReportDoc));
        docs.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
        setReports(docs);
      } catch (error) {
        console.error('❌ LabTrendTab: Error fetching lab reports:', error);
      } finally {
        setLoading(false);
      }
    };
    if (patientId) fetchReports();
  }, [patientId]);

  const dates = useMemo(() => Array.from(new Set(reports.map(r => r.reportDate))).sort(), [reports]);

  const trendTests = useMemo(() => {
    const map = new Map<string, TrendTest>();
    reports.forEach(report => {
      report.tests.forEach(test => {
        const key = `${test.section}::${test.testName}`;
        if (!map.has(key)) {
          map.set(key, { section: test.section, testName: test.testName, unit: test.unit, byDate: new Map() });
        }
        map.get(key)!.byDate.set(report.reportDate, test);
      });
    });
    return Array.from(map.values());
  }, [reports]);

  const filteredTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? trendTests.filter(t => t.testName.toLowerCase().includes(q)) : trendTests;
  }, [trendTests, search]);

  const bySection = useMemo(() => {
    const groups = new Map<string, TrendTest[]>();
    filteredTests.forEach(t => {
      if (!groups.has(t.section)) groups.set(t.section, []);
      groups.get(t.section)!.push(t);
    });
    const orderedSections = [
      ...SECTION_ORDER.filter(s => groups.has(s)),
      ...Array.from(groups.keys()).filter(s => !SECTION_ORDER.includes(s)),
    ];
    return orderedSections.map(section => ({
      section,
      tests: groups.get(section)!.sort((a, b) => a.testName.localeCompare(b.testName, 'tr')),
    }));
  }, [filteredTests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3" />
        Laboratuvar sonuçları yükleniyor...
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-4xl mb-3">🧪</div>
        <p className="font-medium">Henüz laboratuvar sonucu yüklenmedi</p>
        <p className="text-sm mt-1">Anamnez formundaki Biyokimya bölümünden bir rapor PDF'i yüklendiğinde burada görünecek.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h4 className="text-lg font-bold text-gray-900">🧪 Laboratuvar Trend</h4>
          <p className="text-sm text-gray-600">{dates.length} rapor tarihi · {trendTests.length} farklı test</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Test ara..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50">Test</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-700">Trend</th>
              {dates.map(date => (
                <th key={date} className="text-left px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  {formatDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bySection.map(group => (
              <React.Fragment key={group.section}>
                <tr className="bg-purple-50">
                  <td colSpan={2 + dates.length} className="px-4 py-2 font-semibold text-purple-800 text-xs uppercase tracking-wide">
                    {group.section}
                  </td>
                </tr>
                {group.tests.map(test => {
                  const numericSeries = dates
                    .map(d => test.byDate.get(d)?.numericValue)
                    .filter((v): v is number => v !== null && v !== undefined);

                  return (
                    <tr key={`${test.section}::${test.testName}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800 sticky left-0 bg-white">
                        <div className="font-medium">{test.testName}</div>
                        {test.unit && <div className="text-xs text-gray-400">{test.unit}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Sparkline values={numericSeries} />
                      </td>
                      {dates.map((date, idx) => {
                        const entry = test.byDate.get(date);
                        if (!entry) return <td key={date} className="px-3 py-2 text-gray-300">—</td>;

                        const prevDate = dates.slice(0, idx).reverse().find(d => test.byDate.get(d)?.numericValue != null);
                        const prevEntry = prevDate ? test.byDate.get(prevDate) : undefined;
                        let deltaIcon: React.ReactNode = null;
                        if (entry.numericValue != null && prevEntry?.numericValue != null) {
                          if (entry.numericValue > prevEntry.numericValue) deltaIcon = <span className="text-gray-400 ml-1">▲</span>;
                          else if (entry.numericValue < prevEntry.numericValue) deltaIcon = <span className="text-gray-400 ml-1">▼</span>;
                        }

                        const badge = FLAG_BADGE[entry.flag];
                        return (
                          <td key={date} className="px-3 py-2 whitespace-nowrap">
                            <span className="text-gray-800 font-medium">{entry.rawValue}</span>
                            {deltaIcon}
                            {badge && (
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${badge.className}`}>{badge.label}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LabTrendTab;
