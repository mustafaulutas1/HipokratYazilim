import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs
} from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface DepoPanelProps {
  doctorProfile?: {
    clinicId: string;
    fullName: string;
    role?: string;
    userType?: string;
    uid?: string;
  } | null;
}

interface DepoUrun {
  id?: string;
  productName: string;
  stockCode: string;
  cost: number;
  purchaseDate: string;
  quantity: number;
  clinicId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface TransferItem {
  productId: string;
  productName: string;
  stockCode: string;
  quantity: number;
}

interface DepoTransfer {
  id?: string;
  items: TransferItem[];
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
  status: 'planned' | 'completed' | 'cancelled';
  completedAt?: string;
  completedBy?: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
}

interface KullanimKaydi {
  id?: string;
  nurseName: string;
  nurseId: string;
  patientName: string;
  treatmentName: string;
  items: { productId: string; productName: string; plannedQty: number; usedQty: number }[];
  clinicId: string;
  date: string;
  createdAt: string;
}

const emptyUrun = (): Omit<DepoUrun, 'id' | 'clinicId' | 'createdBy' | 'createdAt'> => ({
  productName: '',
  stockCode: '',
  cost: 0,
  purchaseDate: new Date().toISOString().split('T')[0],
  quantity: 0,
});

const todayDate = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0, 5);

const DepoPanel: React.FC<DepoPanelProps> = ({ doctorProfile }) => {
  const userRole = doctorProfile?.role || doctorProfile?.userType || '';
  const isAdmin = userRole === 'admin';
  const isBashemshire = userRole === 'bashemshire';
  const isDepoyonetici = userRole === 'depoyonetici';
  const isNurse = userRole === 'nurse';
  const canManage = isAdmin || isDepoyonetici;

  const [activeTab, setActiveTab] = useState<'ana-depo' | 'kat-deposu'>('ana-depo');
  const [katActiveTab, setKatActiveTab] = useState<'stok' | 'kullanim'>('stok');

  const [anaDepoUrunler, setAnaDepoUrunler] = useState<DepoUrun[]>([]);
  const [katDepoUrunler, setKatDepoUrunler] = useState<DepoUrun[]>([]);
  const [transferler, setTransferler] = useState<DepoTransfer[]>([]);
  const [kullanimKayitlari, setKullanimKayitlari] = useState<KullanimKaydi[]>([]);
  const [loading, setLoading] = useState(true);

  // Ürün ekleme/düzenleme
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUrun, setEditingUrun] = useState<DepoUrun | null>(null);
  const [formData, setFormData] = useState(emptyUrun());
  const [saving, setSaving] = useState(false);
  const [activeDepo, setActiveDepo] = useState<'ana' | 'kat'>('ana');

  // Transfer
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [transferDate, setTransferDate] = useState(todayDate());
  const [transferTime, setTransferTime] = useState(nowTime());
  const [transferNotes, setTransferNotes] = useState('');
  const [completingTransferId, setCompletingTransferId] = useState<string | null>(null);
  const processingIds = useRef<Set<string>>(new Set());

  // Kullanım filtresi
  const [filterNurse, setFilterNurse] = useState('');

  useEffect(() => {
    if (!doctorProfile?.clinicId) return;

    const anaQ = query(collection(db, 'anaDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId));
    const katQ = query(collection(db, 'katDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId));
    const trfQ = query(collection(db, 'depoTransferleri'), where('clinicId', '==', doctorProfile.clinicId));
    const kullQ = query(collection(db, 'katDepoKullanimlar'), where('clinicId', '==', doctorProfile.clinicId));

    const unsubAna = onSnapshot(anaQ, snap => {
      setAnaDepoUrunler(snap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun)));
    });
    const unsubKat = onSnapshot(katQ, snap => {
      setKatDepoUrunler(snap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun)));
      setLoading(false);
    });
    const unsubTrf = onSnapshot(trfQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DepoTransfer));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransferler(list);
    });
    const unsubKull = onSnapshot(kullQ, snap => {
      setKullanimKayitlari(snap.docs.map(d => ({ id: d.id, ...d.data() } as KullanimKaydi)));
    });

    return () => { unsubAna(); unsubKat(); unsubTrf(); unsubKull(); };
  }, [doctorProfile?.clinicId]);

  // Ürün CRUD
  const openAdd = (depo: 'ana' | 'kat') => {
    setActiveDepo(depo);
    setEditingUrun(null);
    setFormData(emptyUrun());
    setShowAddModal(true);
  };

  const openEdit = (urun: DepoUrun, depo: 'ana' | 'kat') => {
    setActiveDepo(depo);
    setEditingUrun(urun);
    setFormData({ productName: urun.productName, stockCode: urun.stockCode, cost: urun.cost, purchaseDate: urun.purchaseDate, quantity: urun.quantity });
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!doctorProfile?.clinicId) return;
    if (!formData.productName.trim() || !formData.stockCode.trim()) { alert('Ürün adı ve stok kodu zorunludur.'); return; }
    setSaving(true);
    const colName = activeDepo === 'ana' ? 'anaDepoUrunler' : 'katDepoUrunler';
    try {
      if (editingUrun?.id) {
        await updateDoc(doc(db, colName, editingUrun.id), { ...formData, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, colName), { ...formData, clinicId: doctorProfile.clinicId, createdBy: doctorProfile.fullName, createdAt: new Date().toISOString() });
      }
      setShowAddModal(false);
    } catch (e) { console.error(e); alert('Kayıt sırasında hata oluştu.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (urun: DepoUrun, depo: 'ana' | 'kat') => {
    if (!urun.id) return;
    if (!confirm(`"${urun.productName}" silinecek. Emin misiniz?`)) return;
    await deleteDoc(doc(db, depo === 'ana' ? 'anaDepoUrunler' : 'katDepoUrunler', urun.id));
  };

  // Transfer modal açma
  const openTransferModal = () => {
    if (anaDepoUrunler.length === 0) { alert('Ana depoda kayıtlı ürün bulunmuyor.'); return; }
    setSelectedItems({});
    setTransferDate(todayDate());
    setTransferTime(nowTime());
    setTransferNotes('');
    setShowTransferModal(true);
  };

  const toggleProductSelection = (urun: DepoUrun) => {
    setSelectedItems(prev => {
      if (prev[urun.id!] !== undefined) {
        const next = { ...prev };
        delete next[urun.id!];
        return next;
      }
      return { ...prev, [urun.id!]: 1 };
    });
  };

  const handleTransferSave = async () => {
    if (!doctorProfile?.clinicId) return;
    const transferItems = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const urun = anaDepoUrunler.find(u => u.id === id)!;
        return { productId: id, productName: urun.productName, stockCode: urun.stockCode, quantity: qty };
      });
    if (transferItems.length === 0) { alert('En az bir ürün ve miktar seçmelisiniz.'); return; }
    if (!transferDate) { alert('Transfer tarihi zorunludur.'); return; }
    if (!transferTime) { alert('Transfer saati zorunludur.'); return; }

    const overStock = transferItems.find(ti => {
      const urun = anaDepoUrunler.find(u => u.id === ti.productId);
      return urun && ti.quantity > urun.quantity;
    });
    if (overStock) { alert(`"${overStock.productName}" için mevcut stoktan fazla miktar girildi.`); return; }

    setTransferSaving(true);
    try {
      await addDoc(collection(db, 'depoTransferleri'), {
        items: transferItems,
        scheduledDate: transferDate,
        scheduledTime: transferTime,
        notes: transferNotes.trim(),
        status: 'planned',
        clinicId: doctorProfile.clinicId,
        createdBy: doctorProfile.fullName,
        createdAt: new Date().toISOString(),
      });
      setShowTransferModal(false);
    } catch (e) { console.error(e); alert('Transfer kaydı sırasında hata oluştu.'); }
    finally { setTransferSaving(false); }
  };

  // Merkezi transfer yürütme — hem otomatik hem manuel "Hemen Gönder" kullanır
  const executeTransfer = useCallback(async (transfer: DepoTransfer) => {
    if (!transfer.id || !doctorProfile?.clinicId) return;
    if (processingIds.current.has(transfer.id)) return; // zaten işleniyor
    processingIds.current.add(transfer.id);
    setCompletingTransferId(transfer.id);
    try {
      // Ana depo miktarlarını düş
      const anaSnap = await getDocs(query(collection(db, 'anaDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId)));
      const anaMevcut = anaSnap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun));
      for (const ti of transfer.items) {
        const urun = anaMevcut.find(u => u.id === ti.productId);
        if (urun?.id) {
          const newQty = Math.max(0, urun.quantity - ti.quantity);
          await updateDoc(doc(db, 'anaDepoUrunler', urun.id), { quantity: newQty, updatedAt: new Date().toISOString() });
        }
      }

      // Kat deposuna ekle/artır
      const katSnap = await getDocs(query(collection(db, 'katDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId)));
      const katMevcut = katSnap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun));
      for (const ti of transfer.items) {
        const anaUrun = anaMevcut.find(u => u.id === ti.productId);
        const existing = katMevcut.find(k => k.stockCode === ti.stockCode);
        if (existing?.id) {
          await updateDoc(doc(db, 'katDepoUrunler', existing.id), { quantity: existing.quantity + ti.quantity, updatedAt: new Date().toISOString() });
        } else {
          await addDoc(collection(db, 'katDepoUrunler'), {
            productName: ti.productName,
            stockCode: ti.stockCode,
            cost: anaUrun?.cost ?? 0,
            purchaseDate: anaUrun?.purchaseDate ?? todayDate(),
            quantity: ti.quantity,
            clinicId: doctorProfile.clinicId,
            createdBy: doctorProfile.fullName,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Transfer'i tamamlandı olarak işaretle
      await updateDoc(doc(db, 'depoTransferleri', transfer.id), {
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: doctorProfile.fullName,
      });
    } catch (e) {
      console.error('Transfer yürütme hatası:', e);
    } finally {
      processingIds.current.delete(transfer.id!);
      setCompletingTransferId(null);
    }
  }, [doctorProfile]);

  // Zamanı gelen transferleri her 30 saniyede otomatik yürüt
  useEffect(() => {
    const check = () => {
      const now = new Date();
      transferler
        .filter(t => t.status === 'planned')
        .forEach(t => {
          const scheduled = new Date(`${t.scheduledDate}T${t.scheduledTime}`);
          if (scheduled <= now) {
            executeTransfer(t);
          }
        });
    };
    check(); // Sayfa yüklenince hemen kontrol et
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [transferler, executeTransfer]);

  const handleCancelTransfer = async (transfer: DepoTransfer) => {
    if (!transfer.id) return;
    if (!confirm('Bu transfer planı iptal edilsin mi?')) return;
    await updateDoc(doc(db, 'depoTransferleri', transfer.id), { status: 'cancelled', updatedAt: new Date().toISOString() });
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

  const formatDateTime = (date: string, time: string) =>
    `${new Date(date).toLocaleDateString('tr-TR')} ${time}`;

  const filteredKullanim = kullanimKayitlari.filter(k => {
    if (isNurse) return k.nurseId === doctorProfile?.uid;
    if (filterNurse) return k.nurseName.toLowerCase().includes(filterNurse.toLowerCase());
    return true;
  });

  const nurseUsageSummary = () => {
    const map: Record<string, { nurseName: string; totalItems: number; records: number }> = {};
    filteredKullanim.forEach(k => {
      if (!map[k.nurseId]) map[k.nurseId] = { nurseName: k.nurseName, totalItems: 0, records: 0 };
      map[k.nurseId].records++;
      map[k.nurseId].totalItems += k.items.reduce((s, i) => s + i.usedQty, 0);
    });
    return Object.values(map);
  };

  const plannedTransfers = transferler.filter(t => t.status === 'planned');
  const completedTransfers = transferler.filter(t => t.status === 'completed');

  // ─── Alt bileşen: Ürün tablosu ────────────────────────────────────────────
  const UrunTable: React.FC<{ urunler: DepoUrun[]; depo: 'ana' | 'kat' }> = ({ urunler, depo }) => (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-white/20 flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">
          {depo === 'ana' ? '🏭 Ana Depo Stok Listesi' : '🏥 Kat Deposu Stok Listesi'}
        </h3>
        <div className="flex gap-2">
          {depo === 'ana' && canManage && (
            <button
              onClick={openTransferModal}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-xl text-white font-semibold text-sm transition-all flex items-center gap-2"
            >
              <span>🚚</span> Kat Depoya Gönderilecekler
            </button>
          )}
          {canManage && (
            <button
              onClick={() => openAdd(depo)}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-xl text-white font-semibold text-sm transition-all"
            >
              + Ürün Ekle
            </button>
          )}
        </div>
      </div>
      {urunler.length === 0 ? (
        <div className="p-10 text-center text-white/50">
          <div className="text-4xl mb-3">📦</div>
          <p>Henüz ürün eklenmemiş.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20 bg-white/5">
                <th className="px-4 py-3 text-left text-white/70">Ürün Adı</th>
                <th className="px-4 py-3 text-left text-white/70">Stok Kodu</th>
                <th className="px-4 py-3 text-left text-white/70">Maliyet</th>
                <th className="px-4 py-3 text-left text-white/70">Alım Tarihi</th>
                <th className="px-4 py-3 text-left text-white/70">Adet</th>
                {canManage && <th className="px-4 py-3 text-left text-white/70">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {urunler.map(u => (
                <tr key={u.id} className="border-b border-white/10 hover:bg-white/5 transition-all">
                  <td className="px-4 py-3 text-white font-medium">{u.productName}</td>
                  <td className="px-4 py-3 text-white/70">{u.stockCode}</td>
                  <td className="px-4 py-3 text-white/70">{formatCurrency(u.cost)}</td>
                  <td className="px-4 py-3 text-white/70">{new Date(u.purchaseDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      u.quantity <= 5 ? 'bg-red-500/20 text-red-300' : u.quantity <= 20 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'
                    }`}>
                      {u.quantity} adet
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(u, depo)} className="px-3 py-1 bg-blue-500/20 border border-blue-400/50 rounded-lg text-blue-300 hover:bg-blue-500/30 text-xs transition-all">Düzenle</button>
                        <button onClick={() => handleDelete(u, depo)} className="px-3 py-1 bg-red-500/20 border border-red-400/50 rounded-lg text-red-300 hover:bg-red-500/30 text-xs transition-all">Sil</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white">Depo verileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">📦</span>
        <div>
          <h1 className="text-3xl font-bold text-white">Depo Yönetimi</h1>
          <p className="text-white/60 text-sm">Ana depo ve kat deposu stok takibi</p>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 border border-white/20 rounded-2xl p-5">
          <p className="text-white/70 text-sm">Ana Depo</p>
          <p className="text-3xl font-bold text-white">{anaDepoUrunler.length}</p>
          <p className="text-white/50 text-xs">ürün çeşidi</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/30 border border-white/20 rounded-2xl p-5">
          <p className="text-white/70 text-sm">Kat Deposu</p>
          <p className="text-3xl font-bold text-white">{katDepoUrunler.length}</p>
          <p className="text-white/50 text-xs">ürün çeşidi</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/30 border border-white/20 rounded-2xl p-5">
          <p className="text-white/70 text-sm">Bekleyen Transfer</p>
          <p className="text-3xl font-bold text-white">{plannedTransfers.length}</p>
          <p className="text-white/50 text-xs">planlandı</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 border border-white/20 rounded-2xl p-5">
          <p className="text-white/70 text-sm">Kullanım Kaydı</p>
          <p className="text-3xl font-bold text-white">{kullanimKayitlari.length}</p>
          <p className="text-white/50 text-xs">toplam</p>
        </div>
      </div>

      {/* Ana Sekmeler */}
      <div className="flex gap-2">
        {(['ana-depo', 'kat-deposu'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              activeTab === tab
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            {tab === 'ana-depo' ? '🏭 Ana Depo' : '🏥 Kat Deposu'}
          </button>
        ))}
      </div>

      {/* ─── ANA DEPO ──────────────────────────────────────────── */}
      {activeTab === 'ana-depo' && (
        <div className="space-y-6">
          <UrunTable urunler={anaDepoUrunler} depo="ana" />

          {/* Planlanan Transferler */}
          {(plannedTransfers.length > 0 || completedTransfers.length > 0) && (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/20 flex items-center gap-3">
                <span className="text-xl">🚚</span>
                <h3 className="text-white font-bold text-lg">Transfer Planları</h3>
              </div>

              {/* Bekleyen transferler */}
              {plannedTransfers.length > 0 && (
                <div className="divide-y divide-white/10">
                  {plannedTransfers.map(t => (
                    <div key={t.id} className="p-4 hover:bg-white/5 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/50 rounded-full text-amber-300 text-xs font-semibold">
                              Planlandı
                            </span>
                            <span className="text-white/70 text-sm font-medium">
                              🗓 {formatDateTime(t.scheduledDate, t.scheduledTime)}
                            </span>
                            {(() => {
                              const diff = new Date(`${t.scheduledDate}T${t.scheduledTime}`).getTime() - Date.now();
                              if (diff <= 0) return <span className="px-2 py-0.5 bg-green-500/20 border border-green-400/50 rounded-full text-green-300 text-xs animate-pulse">⏳ Otomatik gönderiliyor…</span>;
                              const mins = Math.floor(diff / 60_000);
                              const hrs = Math.floor(mins / 60);
                              const label = hrs > 0 ? `${hrs} sa ${mins % 60} dk sonra` : `${mins} dk sonra`;
                              return <span className="text-white/40 text-xs">🤖 {label} otomatik gönderilecek</span>;
                            })()}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {t.items.map((item, i) => (
                              <span key={i} className="px-2 py-1 bg-white/10 rounded-lg text-white/70 text-xs">
                                {item.productName}
                                <span className="text-amber-300 font-semibold ml-1">×{item.quantity}</span>
                              </span>
                            ))}
                          </div>
                          {t.notes && <p className="text-white/40 text-xs mt-1">Not: {t.notes}</p>}
                          <p className="text-white/30 text-xs mt-1">Oluşturan: {t.createdBy}</p>
                        </div>
                        {canManage && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => executeTransfer(t)}
                              disabled={completingTransferId === t.id}
                              className="px-3 py-1.5 bg-blue-500/20 border border-blue-400/50 rounded-lg text-blue-300 hover:bg-blue-500/30 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              {completingTransferId === t.id
                                ? <><div className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full animate-spin" />İşleniyor...</>
                                : <><span>⚡</span>Hemen Gönder</>}
                            </button>
                            <button
                              onClick={() => handleCancelTransfer(t)}
                              disabled={completingTransferId === t.id}
                              className="px-3 py-1.5 bg-red-500/20 border border-red-400/50 rounded-lg text-red-300 hover:bg-red-500/30 text-xs transition-all disabled:opacity-50"
                            >
                              İptal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tamamlanan transferler (son 5) */}
              {completedTransfers.length > 0 && (
                <div className="border-t border-white/10">
                  <div className="px-4 py-2 bg-white/5">
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Son Tamamlananlar</p>
                  </div>
                  <div className="divide-y divide-white/5">
                    {completedTransfers.slice(0, 5).map(t => (
                      <div key={t.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                        <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/70 text-xs">
                            {formatDateTime(t.scheduledDate, t.scheduledTime)} •{' '}
                            {t.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
                          </p>
                          <p className="text-white/40 text-xs">Tamamlayan: {t.completedBy}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex-shrink-0">Tamamlandı</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── KAT DEPOSU ───────────────────────────────────────── */}
      {activeTab === 'kat-deposu' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['stok', 'kullanim'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setKatActiveTab(tab)}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                  katActiveTab === tab ? 'bg-white/20 text-white border border-white/40' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab === 'stok' ? '📋 Stok Durumu' : '📊 Kullanım Raporu'}
              </button>
            ))}
          </div>

          {katActiveTab === 'stok' && <UrunTable urunler={katDepoUrunler} depo="kat" />}

          {katActiveTab === 'kullanim' && (
            <div className="space-y-4">
              {(isAdmin || isBashemshire) && (
                <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/20 flex items-center justify-between">
                    <h3 className="text-white font-bold">Hemşire Bazlı Kullanım Özeti</h3>
                    <input
                      type="text"
                      placeholder="Hemşire ara..."
                      value={filterNurse}
                      onChange={e => setFilterNurse(e.target.value)}
                      className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/20 bg-white/5">
                          <th className="px-4 py-3 text-left text-white/70">Hemşire</th>
                          <th className="px-4 py-3 text-left text-white/70">Tedavi Sayısı</th>
                          <th className="px-4 py-3 text-left text-white/70">Toplam Kullanılan Ürün</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nurseUsageSummary().length === 0 ? (
                          <tr><td colSpan={3} className="px-4 py-8 text-center text-white/40">Kullanım kaydı bulunamadı</td></tr>
                        ) : (
                          nurseUsageSummary().map((s, i) => (
                            <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                              <td className="px-4 py-3 text-white font-medium">{s.nurseName}</td>
                              <td className="px-4 py-3 text-white/70">{s.records}</td>
                              <td className="px-4 py-3 text-white/70">{s.totalItems} adet</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/20">
                  <h3 className="text-white font-bold">{isNurse ? 'Kendi Kullanım Geçmişim' : 'Tüm Kullanım Kayıtları'}</h3>
                </div>
                {filteredKullanim.length === 0 ? (
                  <div className="p-10 text-center text-white/40">
                    <div className="text-4xl mb-3">📊</div>
                    <p>Kullanım kaydı bulunamadı.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {filteredKullanim.slice().reverse().map(k => (
                      <div key={k.id} className="p-4 hover:bg-white/5 transition-all">
                        <p className="text-white font-semibold">{k.treatmentName}</p>
                        <p className="text-white/60 text-xs">Hasta: {k.patientName} • Hemşire: {k.nurseName}</p>
                        <p className="text-white/50 text-xs">{new Date(k.date).toLocaleDateString('tr-TR')}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {k.items.map((item, i) => (
                            <span key={i} className="px-2 py-1 bg-white/10 rounded-lg text-white/70 text-xs">
                              {item.productName}: <span className="text-white font-semibold">{item.usedQty}</span>
                              {item.usedQty !== item.plannedQty && <span className="text-yellow-400 ml-1">(plan: {item.plannedQty})</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Ürün Ekle/Düzenle Modal ──────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-white/20">
              <h3 className="text-white font-bold text-lg">
                {editingUrun ? 'Ürün Düzenle' : `Ürün Ekle — ${activeDepo === 'ana' ? 'Ana Depo' : 'Kat Deposu'}`}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Ürün Adı *', key: 'productName', type: 'text', placeholder: 'Kelebek valfi, Ozon filtresi...' },
                { label: 'Stok Kodu *', key: 'stockCode', type: 'text', placeholder: 'STK-001' },
                { label: 'Maliyet (₺)', key: 'cost', type: 'number', placeholder: '0' },
                { label: 'Alım Tarihi', key: 'purchaseDate', type: 'date', placeholder: '' },
                { label: 'Adet', key: 'quantity', type: 'number', placeholder: '0' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-white/70 text-sm mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={(formData as any)[field.key]}
                    onChange={e => setFormData(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-white/20 flex gap-3 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">İptal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-semibold transition-all disabled:opacity-50">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Transfer Modal ───────────────────────────────────── */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            {/* Başlık */}
            <div className="p-5 border-b border-white/20 flex items-center gap-3">
              <span className="text-2xl">🚚</span>
              <div>
                <h3 className="text-white font-bold text-lg">Kat Depoya Gönderilecekler</h3>
                <p className="text-white/50 text-xs">Gönderilecek ürünleri, miktarları ve zamanı belirleyin</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Tarih ve Saat */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-1">Transfer Tarihi *</label>
                  <input
                    type="date"
                    value={transferDate}
                    min={todayDate()}
                    onChange={e => setTransferDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1">Transfer Saati *</label>
                  <input
                    type="time"
                    value={transferTime}
                    onChange={e => setTransferTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Ürün Seçimi */}
              <div>
                <label className="block text-white/70 text-sm mb-2">
                  Gönderilecek Ürünler *
                  <span className="text-white/40 ml-2 font-normal">(Seçmek için satıra tıklayın)</span>
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {anaDepoUrunler.map(urun => {
                    const isSelected = selectedItems[urun.id!] !== undefined;
                    return (
                      <div
                        key={urun.id}
                        onClick={() => toggleProductSelection(urun)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-400/60'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Checkbox görseli */}
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? 'bg-amber-500 border-amber-500' : 'border-2 border-white/30'
                        }`}>
                          {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                        </div>

                        {/* Ürün bilgileri */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{urun.productName}</p>
                          <p className="text-white/50 text-xs">{urun.stockCode} • Mevcut: {urun.quantity} adet</p>
                        </div>

                        {/* Miktar girişi */}
                        {isSelected && (
                          <div
                            className="flex items-center gap-1.5 flex-shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.max(1, (prev[urun.id!] || 1) - 1) }))}
                              className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-sm flex items-center justify-center transition-all"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={urun.quantity}
                              value={selectedItems[urun.id!] || 1}
                              onChange={e => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.min(urun.quantity, Math.max(1, Number(e.target.value))) }))}
                              className="w-14 text-center px-1 py-1 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <button
                              onClick={() => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.min(urun.quantity, (prev[urun.id!] || 1) + 1) }))}
                              className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-sm flex items-center justify-center transition-all"
                            >
                              +
                            </button>
                            <span className="text-white/40 text-xs">/ {urun.quantity}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Seçili özet */}
              {Object.keys(selectedItems).length > 0 && (
                <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                  <p className="text-amber-300 text-xs font-semibold mb-1">Seçilen Ürünler ({Object.keys(selectedItems).length} çeşit)</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedItems).map(([id, qty]) => {
                      const urun = anaDepoUrunler.find(u => u.id === id);
                      return urun ? (
                        <span key={id} className="px-2 py-0.5 bg-amber-500/20 rounded-full text-amber-200 text-xs">
                          {urun.productName} <span className="font-bold">×{qty}</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Not */}
              <div>
                <label className="block text-white/70 text-sm mb-1">Not (isteğe bağlı)</label>
                <textarea
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  rows={2}
                  placeholder="Transfer ile ilgili not..."
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm resize-none"
                />
              </div>
            </div>

            {/* Alt butonlar */}
            <div className="p-5 border-t border-white/20 flex gap-3 justify-end">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">İptal</button>
              <button
                onClick={handleTransferSave}
                disabled={transferSaving || Object.keys(selectedItems).length === 0}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl text-white font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {transferSaving ? (
                  <><div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>Kaydediliyor...</>
                ) : (
                  <><span>🚚</span>Transfer Planla</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepoPanel;
