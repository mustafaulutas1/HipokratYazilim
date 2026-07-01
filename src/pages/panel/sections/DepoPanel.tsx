import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { loadTurkishPdfFont } from '../../../utils/pdfFont';

interface DepoPanelProps {
  doctorProfile?: {
    clinicId: string;
    fullName: string;
    role?: string;
    userType?: string;
    uid?: string;
  } | null;
}

type DepoCategory = 'kirtasiye' | 'teknik' | 'temizlik' | 'sarf';

// Ana depo kategorileri. "sarf" mevcut tüketim-türü akışını (İşlem/Genel Bazlı)
// korur; "teknik" kat deposuna transfer edilmez; "temizlik" ve "kirtasiye"
// asistan rolünün sorumluluğundadır.
const DEPO_CATEGORIES: { key: DepoCategory; label: string; icon: string; accent: string }[] = [
  { key: 'kirtasiye', label: 'Kırtasiye', icon: '✏️', accent: 'sky' },
  { key: 'teknik', label: 'Teknik Depo', icon: '🔧', accent: 'slate' },
  { key: 'temizlik', label: 'Temizlik Deposu', icon: '🧹', accent: 'teal' },
  { key: 'sarf', label: 'Sarf Malzeme', icon: '💉', accent: 'rose' },
];
// Asistan rolünün depoda görebileceği kategoriler
const ASISTAN_CATEGORIES: DepoCategory[] = ['temizlik', 'kirtasiye'];

interface DepoUrun {
  id?: string;
  productName: string;
  stockCode?: string; // Eski kayıtlarla uyumluluk için tutulur; arayüzde gösterilmez
  companyName?: string;
  cost: number;
  purchaseDate: string;
  quantity: number;
  minStockLevel?: number; // Kritik stok seviyesi — bu değere düşünce alarm verilir
  consumptionType?: 'islem-bazli' | 'genel-bazli';
  category?: DepoCategory;
  clinicId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface Firma {
  id?: string;
  name: string;
  clinicId: string;
  createdBy: string;
  createdAt: string;
}

interface KayitliUrun {
  id?: string;
  name: string;
  category?: DepoCategory;
  minStockLevel?: number;
  clinicId: string;
  createdBy: string;
  createdAt: string;
}

interface TransferItem {
  productId: string;
  productName: string;
  stockCode?: string;
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
  appliedApplications?: string[];
  items: { productId: string; productName: string; plannedQty: number; usedQty: number }[];
  clinicId: string;
  date: string;
  createdAt: string;
}

interface MedicalApp {
  id: string;
  name: string;
  description?: string;
  clinicId?: string;
}

interface EslestirmeMaterial {
  productId: string;
  productName: string;
  stockCode?: string;
  defaultQuantity: number;
}

interface EslestirmeDoc {
  id?: string;
  clinicId: string;
  applicationName: string;
  materials: EslestirmeMaterial[];
  updatedAt: string;
}

interface MalzemeTalebiItem {
  productId: string;
  productName: string;
  stockCode?: string;
  requestedQty: number;
  approvedQty?: number;
}

interface MalzemeTalebi {
  id?: string;
  clinicId: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  items: MalzemeTalebiItem[];
  notes?: string;
  respondedBy?: string;
  respondedAt?: string;
  responseNotes?: string;
}

const emptyUrun = (): Omit<DepoUrun, 'id' | 'clinicId' | 'createdBy' | 'createdAt'> => ({
  productName: '',
  companyName: '',
  cost: 0,
  purchaseDate: new Date().toISOString().split('T')[0],
  quantity: 0,
  minStockLevel: 0,
  consumptionType: undefined,
  category: undefined,
});

const todayDate = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0, 5);

const DepoPanel: React.FC<DepoPanelProps> = ({ doctorProfile }) => {
  // Depo Yönetimi ekranına erişebilen herkes tüm sekmeleri görebilir ve ürün
  // ekleme/transfer/talep gibi işlemleri yapabilir. Tek rol bazlı kısıtlama:
  // bir malzeme talebini yalnızca admin ve depo yöneticisi (depocu)
  // onaylayabilir/reddedebilir.
  const userRole = doctorProfile?.role || doctorProfile?.userType || '';
  const isAdmin = userRole === 'admin';
  const isDepoyonetici = userRole === 'depoyonetici';
  // Malzeme talebine yanıt verme (onayla/reddet) yetkisi.
  const canRespondTalep = isAdmin || isDepoyonetici;
  const isNurse = false;
  const canManage = true;

  // Tüm roller (asistan dahil) depodaki tüm kategorileri görür.
  const isAsistan = false;
  const visibleCategories = DEPO_CATEGORIES;

  const [activeTab, setActiveTab] = useState<'ana-depo' | 'kat-deposu' | 'eslestirme' | 'malzeme-talebi'>('ana-depo');
  const [katActiveTab, setKatActiveTab] = useState<'stok' | 'kullanim'>('stok');
  const [anaDepoInfoTab, setAnaDepoInfoTab] = useState<'transfer' | 'eklemeler' | 'talepler'>('transfer');

  // Malzeme Eşleştirme state
  const [medicalApps, setMedicalApps] = useState<MedicalApp[]>([]);
  const [eslestirmeler, setEslestirmeler] = useState<EslestirmeDoc[]>([]);
  const [eslestirmeSelectedApp, setEslestirmeSelectedApp] = useState<MedicalApp | null>(null);
  const [eslestirmeQtys, setEslestirmeQtys] = useState<Record<string, number>>({});
  const [eslestirmeSaving, setEslestirmeSaving] = useState(false);
  const [eslestirmeAppSearch, setEslestirmeAppSearch] = useState('');
  const [eslestirmeMalzemeSearch, setEslestirmeMalzemeSearch] = useState('');
  const [talepMalzemeSearch, setTalepMalzemeSearch] = useState('');

  // Malzeme Talebi state
  const [malzemeTalepleri, setMalzemeTalepleri] = useState<MalzemeTalebi[]>([]);
  const [talepQtys, setTalepQtys] = useState<Record<string, number>>({});
  const [talepNotes, setTalepNotes] = useState('');
  const [talepSaving, setTalepSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondQtys, setRespondQtys] = useState<Record<string, number>>({});
  const [respondNotes, setRespondNotes] = useState('');
  const [respondSaving, setRespondSaving] = useState(false);

  // Firma Yönetimi state
  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [newFirmaName, setNewFirmaName] = useState('');
  const [firmaSaving, setFirmaSaving] = useState(false);
  const [showFirmaModal, setShowFirmaModal] = useState(false);

  // Ürün Yönetimi state
  const [kayitliUrunler, setKayitliUrunler] = useState<KayitliUrun[]>([]);
  const [newUrunName, setNewUrunName] = useState('');
  const [newUrunCategory, setNewUrunCategory] = useState<DepoCategory | undefined>(undefined);
  const [newUrunMinStock, setNewUrunMinStock] = useState<number>(0);
  const [urunSaving, setUrunSaving] = useState(false);
  const [showUrunModal, setShowUrunModal] = useState(false);

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

  // Düşük stok bildirimi (sayfaya her girişte yeniden gösterilir; kullanıcı kapatabilir).
  const [lowStockToastDismissed, setLowStockToastDismissed] = useState(false);

  // Transfer
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [transferDate, setTransferDate] = useState(todayDate());
  const [transferTime, setTransferTime] = useState(nowTime());
  const [transferNotes, setTransferNotes] = useState('');
  const [completingTransferId, setCompletingTransferId] = useState<string | null>(null);
  const [transferProductTab, setTransferProductTab] = useState<string | null>(null);
  const [transferSearch, setTransferSearch] = useState('');
  const processingIds = useRef<Set<string>>(new Set());

  // Stok listesi ürün arama (Ana Depo / Kat Deposu ayrı) ve kategori aç/kapa durumu
  const [anaDepoSearch, setAnaDepoSearch] = useState('');
  const [katDepoSearch, setKatDepoSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  // Kalıcı düşük stok banner'ı varsayılan kapalı (liste çok uzayabiliyor).
  const [lowStockBannerOpen, setLowStockBannerOpen] = useState(false);

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

    const unsubApps = onSnapshot(collection(db, 'medicalApplications'), snap => {
      setMedicalApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as MedicalApp)));
    });
    const eslQ = query(collection(db, 'tedaviMalzemeEslestirme'), where('clinicId', '==', doctorProfile.clinicId));
    const unsubEsl = onSnapshot(eslQ, snap => {
      setEslestirmeler(snap.docs.map(d => ({ id: d.id, ...d.data() } as EslestirmeDoc)));
    });
    const talepQ = query(collection(db, 'malzemeTalepleri'), where('clinicId', '==', doctorProfile.clinicId));
    const unsubTalep = onSnapshot(talepQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as MalzemeTalebi));
      list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setMalzemeTalepleri(list);
    });
    const firmaQ = query(collection(db, 'depoFirmalar'), where('clinicId', '==', doctorProfile.clinicId));
    const unsubFirma = onSnapshot(firmaQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Firma));
      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setFirmalar(list);
    });
    const urunQ = query(collection(db, 'depoKayitliUrunler'), where('clinicId', '==', doctorProfile.clinicId));
    const unsubUrun = onSnapshot(urunQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as KayitliUrun));
      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setKayitliUrunler(list);
    });

    return () => { unsubAna(); unsubKat(); unsubTrf(); unsubKull(); unsubApps(); unsubEsl(); unsubTalep(); unsubFirma(); unsubUrun(); };
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
    setFormData({ productName: urun.productName, companyName: (urun as any).companyName || '', cost: urun.cost, purchaseDate: urun.purchaseDate, quantity: urun.quantity, minStockLevel: urun.minStockLevel ?? 0, consumptionType: urun.consumptionType, category: urun.category });
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!doctorProfile?.clinicId) return;
    if (!formData.productName.trim()) { alert('Ürün adı zorunludur.'); return; }
    // Kategori hem ana hem kat deposu için zorunlu; böylece kat deposunda elle
    // eklenen ürünler "Diğer (Kategorisiz)" altına düşmez.
    if (!formData.category) { alert('Kategori zorunludur. Lütfen bir depo kategorisi seçin.'); return; }
    // Tüketim türü yalnızca Sarf Malzeme kategorisi için zorunlu (mevcut işlem/genel akışı korunur).
    if (formData.category === 'sarf' && !formData.consumptionType) { alert('Sarf Malzeme için tüketim türü zorunludur. Lütfen "İşlem Bazlı Tüketim" veya "Genel Bazlı Tüketim" seçeneklerinden birini seçin.'); return; }
    setSaving(true);
    const colName = activeDepo === 'ana' ? 'anaDepoUrunler' : 'katDepoUrunler';
    // Firestore, undefined alan değerlerini kabul etmez; tanımsız alanları temizle.
    const payload: Record<string, any> = { ...formData };
    Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });
    try {
      if (editingUrun?.id) {
        // Eski kayıtlarda stok kodu yoksa düzenlerken otomatik atınır.
        if (!editingUrun.stockCode) payload.stockCode = generateStockCode();
        await updateDoc(doc(db, colName, editingUrun.id), { ...payload, updatedAt: new Date().toISOString() });
      } else {
        // Aynı ürün adı + firma adı + kategori kombinasyonu zaten varsa
        // yeni kart açmak yerine mevcut kartın üzerine ekle.
        const mevcut = (activeDepo === 'ana' ? anaDepoUrunler : katDepoUrunler).find(u =>
          u.productName.trim().toLocaleLowerCase('tr') === formData.productName.trim().toLocaleLowerCase('tr') &&
          (u.companyName || '').trim().toLocaleLowerCase('tr') === (formData.companyName || '').trim().toLocaleLowerCase('tr') &&
          (u.category || '') === (formData.category || '')
        );
        if (mevcut?.id) {
          // Mevcut kartı güncelle: adet üzerine ekle, maliyet ve kritik stok seviyesini güncelle
          await updateDoc(doc(db, colName, mevcut.id), {
            quantity: mevcut.quantity + (formData.quantity || 0),
            cost: formData.cost,
            minStockLevel: formData.minStockLevel,
            purchaseDate: formData.purchaseDate,
            ...(formData.consumptionType ? { consumptionType: formData.consumptionType } : {}),
            updatedAt: new Date().toISOString(),
          });
        } else {
          // Gerçekten yeni ürün — otomatik artan stok kodu ata.
          await addDoc(collection(db, colName), { ...payload, stockCode: generateStockCode(), clinicId: doctorProfile.clinicId, createdBy: doctorProfile.fullName, createdAt: new Date().toISOString() });
        }
      }
      setShowAddModal(false);
    } catch (e) { console.error(e); alert('Kayıt sırasında hata oluştu.'); }
    finally { setSaving(false); }
  };

  // Firma Yönetimi — firma ekle / sil
  const handleAddFirma = async () => {
    if (!doctorProfile?.clinicId) return;
    const name = newFirmaName.trim();
    if (!name) { alert('Firma adı zorunludur.'); return; }
    if (firmalar.some(f => f.name.toLowerCase() === name.toLowerCase())) { alert('Bu firma zaten kayıtlı.'); return; }
    setFirmaSaving(true);
    try {
      await addDoc(collection(db, 'depoFirmalar'), {
        name,
        clinicId: doctorProfile.clinicId,
        createdBy: doctorProfile.fullName,
        createdAt: new Date().toISOString(),
      });
      setNewFirmaName('');
    } catch (e) { console.error(e); alert('Firma eklenirken hata oluştu.'); }
    finally { setFirmaSaving(false); }
  };

  const handleDeleteFirma = async (firma: Firma) => {
    if (!firma.id) return;
    if (!confirm(`"${firma.name}" firması silinecek. Emin misiniz?`)) return;
    await deleteDoc(doc(db, 'depoFirmalar', firma.id));
  };

  // Ürün Yönetimi — ürün ekle / sil
  const handleAddUrun = async () => {
    if (!doctorProfile?.clinicId) return;
    const name = newUrunName.trim();
    if (!name) { alert('Ürün adı zorunludur.'); return; }
    if (kayitliUrunler.some(u => u.name.toLowerCase() === name.toLowerCase())) { alert('Bu ürün zaten kayıtlı.'); return; }
    setUrunSaving(true);
    try {
      await addDoc(collection(db, 'depoKayitliUrunler'), {
        name,
        ...(newUrunCategory ? { category: newUrunCategory } : {}),
        ...(newUrunMinStock > 0 ? { minStockLevel: newUrunMinStock } : {}),
        clinicId: doctorProfile.clinicId,
        createdBy: doctorProfile.fullName,
        createdAt: new Date().toISOString(),
      });
      setNewUrunName('');
      setNewUrunCategory(undefined);
      setNewUrunMinStock(0);
    } catch (e) { console.error(e); alert('Ürün eklenirken hata oluştu.'); }
    finally { setUrunSaving(false); }
  };

  const handleDeleteUrun = async (urun: KayitliUrun) => {
    if (!urun.id) return;
    if (!confirm(`"${urun.name}" ürünü silinecek. Emin misiniz?`)) return;
    await deleteDoc(doc(db, 'depoKayitliUrunler', urun.id));
  };

  // Malzeme Talebi — talep gönder
  const handleSubmitTalep = async () => {
    if (!doctorProfile?.clinicId) return;
    const items: MalzemeTalebiItem[] = Object.entries(talepQtys)
      .filter(([, qty]) => qty > 0)
      .map(([productId, requestedQty]) => {
        const urun = anaDepoUrunler.find(u => u.id === productId);
        return { productId, productName: urun?.productName || '', requestedQty };
      });
    if (items.length === 0) { alert('En az bir malzeme ve miktar seçin.'); return; }
    setTalepSaving(true);
    try {
      await addDoc(collection(db, 'malzemeTalepleri'), {
        clinicId: doctorProfile.clinicId,
        requestedBy: doctorProfile.fullName,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        items,
        notes: talepNotes.trim(),
      });
      setTalepQtys({});
      setTalepNotes('');
    } catch (e) { console.error(e); alert('Talep gönderilemedi.'); }
    finally { setTalepSaving(false); }
  };

  // Malzeme Talebi — yanıtla (onayla / kısmen onayla / reddet)
  const openRespond = (talep: MalzemeTalebi) => {
    setRespondingId(talep.id!);
    const qtys: Record<string, number> = {};
    talep.items.forEach(it => { qtys[it.productId] = it.requestedQty; });
    setRespondQtys(qtys);
    setRespondNotes('');
  };

  const handleRespondTalep = async (talep: MalzemeTalebi, action: 'approve' | 'reject') => {
    if (!doctorProfile?.clinicId || !talep.id) return;
    // Malzeme talebine yalnızca admin ve depo yöneticisi (depocu) yanıt verebilir.
    if (!canRespondTalep) { alert('Malzeme talebini yalnızca admin veya depo yöneticisi onaylayabilir/reddedebilir.'); return; }
    setRespondSaving(true);
    try {
      if (action === 'reject') {
        await updateDoc(doc(db, 'malzemeTalepleri', talep.id), {
          status: 'rejected',
          respondedBy: doctorProfile.fullName,
          respondedAt: new Date().toISOString(),
          responseNotes: respondNotes.trim(),
        });
      } else {
        // Transfer: anaDepo'dan düş, katDepo'ya ekle
        const anaSnap = await getDocs(query(collection(db, 'anaDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId)));
        const anaMevcut = anaSnap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun));
        const katSnap = await getDocs(query(collection(db, 'katDepoUrunler'), where('clinicId', '==', doctorProfile.clinicId)));
        const katMevcut = katSnap.docs.map(d => ({ id: d.id, ...d.data() } as DepoUrun));

        const approvedItems: MalzemeTalebiItem[] = [];
        for (const it of talep.items) {
          const approved = Math.max(0, respondQtys[it.productId] ?? 0);
          if (approved === 0) continue;
          const anaUrun = anaMevcut.find(u => u.id === it.productId);
          if (!anaUrun?.id) continue;
          const actual = Math.min(approved, anaUrun.quantity);
          if (actual === 0) continue;

          await updateDoc(doc(db, 'anaDepoUrunler', anaUrun.id), { quantity: anaUrun.quantity - actual, updatedAt: new Date().toISOString() });

          const existing = katMevcut.find(k => k.productName === it.productName && (k.category || '') === (anaUrun.category || ''));
          if (existing?.id) {
            await updateDoc(doc(db, 'katDepoUrunler', existing.id), {
              quantity: existing.quantity + actual,
              ...(anaUrun.consumptionType ? { consumptionType: anaUrun.consumptionType } : {}),
              ...(anaUrun.category ? { category: anaUrun.category } : {}),
              updatedAt: new Date().toISOString(),
            });
          } else {
            await addDoc(collection(db, 'katDepoUrunler'), {
              productName: it.productName,
              cost: anaUrun.cost ?? 0, purchaseDate: anaUrun.purchaseDate ?? todayDate(),
              quantity: actual,
              ...(anaUrun.consumptionType ? { consumptionType: anaUrun.consumptionType } : {}),
              ...(anaUrun.category ? { category: anaUrun.category } : {}),
              clinicId: doctorProfile.clinicId,
              createdBy: doctorProfile.fullName, createdAt: new Date().toISOString(),
            });
          }
          approvedItems.push({ ...it, approvedQty: actual });
        }

        const allFull = approvedItems.every((it, idx) => it.approvedQty === talep.items[idx]?.requestedQty);
        const status = approvedItems.length === 0 ? 'rejected' : allFull ? 'approved' : 'partial';
        await updateDoc(doc(db, 'malzemeTalepleri', talep.id), {
          status,
          items: talep.items.map(it => ({ ...it, approvedQty: approvedItems.find(a => a.productId === it.productId)?.approvedQty ?? 0 })),
          respondedBy: doctorProfile.fullName,
          respondedAt: new Date().toISOString(),
          responseNotes: respondNotes.trim(),
        });
      }
      setRespondingId(null);
    } catch (e) { console.error(e); alert('İşlem sırasında hata oluştu.'); }
    finally { setRespondSaving(false); }
  };

  const handleSelectEslestirmeApp = (app: MedicalApp) => {
    setEslestirmeSelectedApp(app);
    const existing = eslestirmeler.find(e => e.applicationName === app.name);
    const qtys: Record<string, number> = {};
    if (existing) {
      existing.materials.forEach(m => { qtys[m.productId] = m.defaultQuantity; });
    }
    setEslestirmeQtys(qtys);
  };

  const handleDeleteEslestirme = async () => {
    if (!eslestirmeSelectedApp) return;
    const existing = eslestirmeler.find(e => e.applicationName === eslestirmeSelectedApp.name);
    if (!existing?.id) return;
    if (!confirm(`"${eslestirmeSelectedApp.name}" için tüm malzeme eşleştirmesi silinecek. Emin misiniz?`)) return;
    setEslestirmeSaving(true);
    try {
      await deleteDoc(doc(db, 'tedaviMalzemeEslestirme', existing.id));
      setEslestirmeQtys({});
    } catch (e) {
      console.error(e);
      alert('Silinirken hata oluştu.');
    } finally {
      setEslestirmeSaving(false);
    }
  };

  const handleSaveEslestirme = async () => {
    if (!eslestirmeSelectedApp || !doctorProfile?.clinicId) return;
    setEslestirmeSaving(true);
    try {
      const materials: EslestirmeMaterial[] = Object.entries(eslestirmeQtys)
        .filter(([, qty]) => qty > 0)
        .map(([productId, defaultQuantity]) => {
          const urun = katDepoUrunler.find(u => u.id === productId);
          return { productId, productName: urun?.productName || '', defaultQuantity };
        });
      const existing = eslestirmeler.find(e => e.applicationName === eslestirmeSelectedApp.name);
      if (existing?.id) {
        await updateDoc(doc(db, 'tedaviMalzemeEslestirme', existing.id), { materials, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'tedaviMalzemeEslestirme'), {
          clinicId: doctorProfile.clinicId,
          applicationName: eslestirmeSelectedApp.name,
          materials,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error(e);
      alert('Kaydedilirken hata oluştu.');
    } finally {
      setEslestirmeSaving(false);
    }
  };

  // ── Rapor Export ────────────────────────────────────────────
  const clinicName = doctorProfile?.clinicId ?? 'Klinik';
  const today = new Date().toLocaleDateString('tr-TR');

  const buildPdfBase = async (title: string, subtitle: string): Promise<{ pdf: jsPDF; fontName: string }> => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let fontName = 'helvetica';
    try {
      const fontData = await loadTurkishPdfFont();
      if (fontData) {
        pdf.addFileToVFS('Roboto-Regular.ttf', fontData);
        pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        fontName = 'Roboto';
      }
    } catch { /* varsayılan font kullan */ }
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, 297, 210, 'F');
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, 297, 28, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont(fontName, 'normal');
    pdf.text(title, 14, 12);
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(subtitle, 14, 20);
    pdf.text(`Tarih: ${today}`, 283, 20, { align: 'right' });
    return { pdf, fontName };
  };

  const exportTransferPdf = async () => {
    const { pdf, fontName } = await buildPdfBase('Transfer Planları Raporu', `${clinicName} • Ana Depo — Transferler`);
    const allTransfers = [...transferler].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    autoTable(pdf, {
      startY: 34,
      head: [['Tarih & Saat', 'Ürünler', 'Durum', 'Oluşturan', 'Tamamlayan', 'Not']],
      body: allTransfers.map(t => [
        `${t.scheduledDate} ${t.scheduledTime}`,
        t.items.map(i => `${i.productName} ×${i.quantity}`).join('\n'),
        t.status === 'completed' ? 'Tamamlandı' : t.status === 'cancelled' ? 'İptal' : 'Planlandı',
        t.createdBy || '—',
        t.completedBy || '—',
        t.notes || '—',
      ]),
      styles: { font: fontName, fontSize: 8, cellPadding: 4, textColor: [226, 232, 240], fillColor: [30, 41, 59] },
      headStyles: { font: fontName, fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 1: { cellWidth: 80 } },
      tableLineColor: [51, 65, 85],
      tableLineWidth: 0.1,
    });
    pdf.save(`Transfer_Planlari_${today.replace(/\./g, '-')}.pdf`);
  };

  const downloadExcel = (wb: XLSX.WorkBook, filename: string) => {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportTransferExcel = () => {
    const allTransfers = [...transferler].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const rows = allTransfers.flatMap(t =>
      t.items.map(item => ({
        'Tarih': t.scheduledDate,
        'Saat': t.scheduledTime,
        'Ürün': item.productName,
        'Miktar': item.quantity,
        'Durum': t.status === 'completed' ? 'Tamamlandı' : t.status === 'cancelled' ? 'İptal' : 'Planlandı',
        'Oluşturan': t.createdBy || '',
        'Tamamlayan': t.completedBy || '',
        'Not': t.notes || '',
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [10,10,25,8,14,18,18,25].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transferler');
    downloadExcel(wb, `Transfer_Planlari_${today.replace(/\./g, '-')}.xlsx`);
  };

  const exportEklemelerPdf = async () => {
    const { pdf, fontName } = await buildPdfBase('Ürün Eklemeleri Raporu', `${clinicName} • Ana Depo — Ürün Eklemeleri`);
    const sorted = [...anaDepoUrunler].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    autoTable(pdf, {
      startY: 34,
      head: [['Ürün Adı', 'Firma', 'Adet', 'Maliyet (₺)', 'Alım Tarihi', 'Ekleyen']],
      body: sorted.map(u => [
        u.productName,
        u.companyName || '—',
        u.quantity,
        u.cost > 0 ? u.cost.toLocaleString('tr-TR') : '—',
        u.purchaseDate ? new Date(u.purchaseDate).toLocaleDateString('tr-TR') : '—',
        u.createdBy || '—',
      ]),
      styles: { font: fontName, fontSize: 8, cellPadding: 4, textColor: [226, 232, 240], fillColor: [30, 41, 59] },
      headStyles: { font: fontName, fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [15, 23, 42] },
      tableLineColor: [51, 65, 85],
      tableLineWidth: 0.1,
    });
    pdf.save(`Urun_Eklemeleri_${today.replace(/\./g, '-')}.pdf`);
  };

  const exportEklemelerExcel = () => {
    const sorted = [...anaDepoUrunler].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const rows = sorted.map(u => ({
      'Ürün Adı': u.productName,
      'Firma': u.companyName || '',
      'Adet': u.quantity,
      'Maliyet (₺)': u.cost > 0 ? u.cost : '',
      'Alım Tarihi': u.purchaseDate ? new Date(u.purchaseDate).toLocaleDateString('tr-TR') : '',
      'Ekleyen': u.createdBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [28, 20, 8, 14, 14, 18].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Urunler');
    downloadExcel(wb, `Urun_Eklemeleri_${today.replace(/\./g, '-')}.xlsx`);
  };

  const exportTaleplerPdf = async () => {
    const { pdf, fontName } = await buildPdfBase('Malzeme Talepleri Raporu', `${clinicName} • Ana Depo — Malzeme Talepleri`);
    const statusLabel: Record<string, string> = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi', partial: 'Kısmen Onaylandı' };
    autoTable(pdf, {
      startY: 34,
      head: [['Talep Tarihi', 'Talep Eden', 'Ürünler', 'Durum', 'Yanıtlayan', 'Not']],
      body: malzemeTalepleri.map(t => [
        new Date(t.requestedAt).toLocaleString('tr-TR'),
        t.requestedBy,
        t.items.map(i => `${i.productName} ×${i.requestedQty}${i.approvedQty !== undefined && i.approvedQty !== i.requestedQty ? ` (onaylanan: ${i.approvedQty})` : ''}`).join('\n'),
        statusLabel[t.status] || t.status,
        t.respondedBy || '—',
        t.responseNotes || t.notes || '—',
      ]),
      styles: { font: fontName, fontSize: 8, cellPadding: 4, textColor: [226, 232, 240], fillColor: [30, 41, 59] },
      headStyles: { font: fontName, fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 2: { cellWidth: 80 } },
      tableLineColor: [51, 65, 85],
      tableLineWidth: 0.1,
    });
    pdf.save(`Malzeme_Talepleri_${today.replace(/\./g, '-')}.pdf`);
  };

  const exportTaleplerExcel = () => {
    const statusLabel: Record<string, string> = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi', partial: 'Kısmen Onaylandı' };
    const rows = malzemeTalepleri.flatMap(t =>
      t.items.map(item => ({
        'Talep Tarihi': new Date(t.requestedAt).toLocaleString('tr-TR'),
        'Talep Eden': t.requestedBy,
        'Ürün': item.productName,
        'Talep Miktarı': item.requestedQty,
        'Onaylanan Miktar': item.approvedQty ?? '',
        'Durum': statusLabel[t.status] || t.status,
        'Yanıtlayan': t.respondedBy || '',
        'Yanıt Tarihi': t.respondedAt ? new Date(t.respondedAt).toLocaleString('tr-TR') : '',
        'Not': t.responseNotes || t.notes || '',
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [20, 18, 25, 14, 16, 18, 18, 20, 25].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Talepler');
    downloadExcel(wb, `Malzeme_Talepleri_${today.replace(/\./g, '-')}.xlsx`);
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
    setTransferProductTab(null);
    setTransferSearch('');
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
        return { productId: id, productName: urun.productName, quantity: qty };
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
        // Kat deposunda eşleşme aynı ad VE aynı kategoride aranır; böylece farklı
        // kategorilerdeki (sarf/temizlik/kırtasiye) aynı adlı ürünler karışmaz.
        const existing = katMevcut.find(k => k.productName === ti.productName && (k.category || '') === (anaUrun?.category || ''));
        if (existing?.id) {
          await updateDoc(doc(db, 'katDepoUrunler', existing.id), {
            quantity: existing.quantity + ti.quantity,
            ...(anaUrun?.consumptionType ? { consumptionType: anaUrun.consumptionType } : {}),
            ...(anaUrun?.category ? { category: anaUrun.category } : {}),
            updatedAt: new Date().toISOString(),
          });
        } else {
          await addDoc(collection(db, 'katDepoUrunler'), {
            productName: ti.productName,
            cost: anaUrun?.cost ?? 0,
            purchaseDate: anaUrun?.purchaseDate ?? todayDate(),
            quantity: ti.quantity,
            ...(anaUrun?.consumptionType ? { consumptionType: anaUrun.consumptionType } : {}),
            ...(anaUrun?.category ? { category: anaUrun.category } : {}),
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

  const filteredKullanim = kullanimKayitlari
    .filter(k => {
      if (isNurse) return k.nurseId === doctorProfile?.uid;
      if (filterNurse) return k.nurseName.toLowerCase().includes(filterNurse.toLowerCase());
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const toAscii = (str: string) =>
    str
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ı/g, 'i').replace(/İ/g, 'I');

  const downloadKullanimPDF = () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('tr-TR');

    // ── Header band ──────────────────────────────────────────────────────────
    pdf.setFillColor(67, 56, 202); // indigo-700
    pdf.rect(0, 0, pageW, 22, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('KAT DEPO KULLANIM RAPORU', 14, 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Olusturma tarihi: ${today}   |   Toplam kayit: ${filteredKullanim.length}`, pageW - 14, 14, { align: 'right' });

    // ── Table ─────────────────────────────────────────────────────────────────
    const rows = filteredKullanim.map((k, idx) => [
      String(idx + 1),
      toAscii(new Date(k.createdAt).toLocaleString('tr-TR')),
      toAscii(k.nurseName),
      toAscii(k.treatmentName || '-'),
      toAscii((k.appliedApplications ?? []).join(', ') || '-'),
      toAscii(k.patientName),
      toAscii(k.items.map(i => `${i.productName} x${i.usedQty}`).join('\n')),
    ]);

    autoTable(pdf, {
      startY: 27,
      head: [['#', 'Tarih / Saat', 'Uygulayan', 'Protokol', 'Uygulanan Tedaviler', 'Hasta', 'Kullanilan Malzemeler']],
      body: rows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        valign: 'middle',
        lineColor: [220, 220, 230],
        lineWidth: 0.2,
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: [67, 56, 202],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 32 },
        2: { cellWidth: 36 },
        3: { cellWidth: 34 },
        4: { cellWidth: 48 },
        5: { cellWidth: 32 },
        6: { cellWidth: 'auto' },
      },
      didDrawPage: (data) => {
        // Footer
        const pageCount = (pdf as any).internal.getNumberOfPages();
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `Sayfa ${data.pageNumber} / ${pageCount}`,
          pageW / 2,
          pdf.internal.pageSize.getHeight() - 6,
          { align: 'center' }
        );
      },
    });

    pdf.save(`kat-depo-kullanim-raporu-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadKullanimExcel = () => {
    const wsData: (string | number)[][] = [
      ['#', 'Tarih / Saat', 'Uygulayan', 'Protokol', 'Uygulanan Tedaviler', 'Hasta', 'Kullanilan Malzemeler'],
      ...filteredKullanim.map((k, idx) => [
        idx + 1,
        new Date(k.createdAt).toLocaleString('tr-TR'),
        k.nurseName,
        k.treatmentName || '-',
        (k.appliedApplications ?? []).join(', ') || '-',
        k.patientName,
        k.items.map(i => `${i.productName} x${i.usedQty}`).join('; '),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 4 }, { wch: 22 }, { wch: 24 }, { wch: 28 }, { wch: 40 }, { wch: 22 }, { wch: 50 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kullanim Raporu');
    XLSX.writeFile(wb, `kat-depo-kullanim-raporu-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

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

  // Düşük stok alarmı: stok tükendiyse (0) ya da tanımlı kritik seviyenin altına/eşit
  // düştüyse uyarılır. Kritik seviye 0 ise (eşik tanımlanmamış) yalnızca stok bitince uyarılır.
  const isLowStock = (u: DepoUrun) =>
    u.quantity <= 0 || ((u.minStockLevel ?? 0) > 0 && u.quantity <= (u.minStockLevel ?? 0));

  // Otomatik stok kodu — mevcut "STK-####" kodlarının en yükseğinden bir fazlası.
  // Hem ana hem kat depodaki kodlara bakılarak klinik içinde benzersizlik sağlanır.
  const generateStockCode = (): string => {
    let max = 0;
    [...anaDepoUrunler, ...katDepoUrunler].forEach(u => {
      const m = /^STK-(\d+)$/.exec(u.stockCode || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `STK-${String(max + 1).padStart(4, '0')}`;
  };

  // Kat deposuna transfer edilebilen ürün grupları. "Teknik Depo" kat deposuna
  // gönderilmez. Sarf malzeme tüketim türüne göre ikiye ayrılır; kırtasiye ve
  // temizlik kendi kategorileriyle gelir. Böylece kat deposu da kategori bazında
  // ayrı kalır (haftalık sayımda karışmaz).
  const TRANSFER_GROUPS: { key: string; label: string; activeClass: string; match: (u: DepoUrun) => boolean }[] = [
    { key: 'sarf-islem', label: '⚙️ Sarf · İşlem Bazlı', activeClass: 'bg-indigo-500/20 border-indigo-400/60 text-indigo-300', match: u => u.category !== 'teknik' && u.consumptionType === 'islem-bazli' },
    { key: 'sarf-genel', label: '📦 Sarf · Genel Bazlı', activeClass: 'bg-green-500/20 border-green-400/60 text-green-300', match: u => u.category !== 'teknik' && u.consumptionType === 'genel-bazli' },
    { key: 'kirtasiye', label: '✏️ Kırtasiye', activeClass: 'bg-sky-500/20 border-sky-400/60 text-sky-300', match: u => u.category === 'kirtasiye' },
    { key: 'temizlik', label: '🧹 Temizlik', activeClass: 'bg-teal-500/20 border-teal-400/60 text-teal-300', match: u => u.category === 'temizlik' },
  ];
  const activeTransferGroup = TRANSFER_GROUPS.find(g => g.key === transferProductTab) || null;

  // İki depodaki tüm kritik ürünler (bildirim ve banner için).
  const lowStockItems = [
    ...anaDepoUrunler.filter(isLowStock).map(u => ({ ...u, _depoLabel: 'Ana Depo' })),
    ...katDepoUrunler.filter(isLowStock).map(u => ({ ...u, _depoLabel: 'Kat Deposu' })),
  ].sort((a, b) => a.quantity - b.quantity);

  // ─── Alt bileşen: Ürün tablosu ────────────────────────────────────────────
  const renderUrunRows = (items: DepoUrun[], depo: 'ana' | 'kat') => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/20 bg-white/5">
            <th className="px-4 py-3 text-left text-white/70">Stok Kodu</th>
            <th className="px-4 py-3 text-left text-white/70">Ürün Adı</th>
            <th className="px-4 py-3 text-left text-white/70">Firma Adı</th>
            <th className="px-4 py-3 text-left text-white/70">Maliyet</th>
            <th className="px-4 py-3 text-left text-white/70">Alım Tarihi</th>
            <th className="px-4 py-3 text-left text-white/70">Adet</th>
            {canManage && <th className="px-4 py-3 text-left text-white/70">İşlemler</th>}
          </tr>
        </thead>
        <tbody>
          {[...items].sort((a, b) => a.productName.localeCompare(b.productName, 'tr')).map(u => (
            <tr key={u.id} className="border-b border-white/10 hover:bg-white/5 transition-all">
              <td className="px-4 py-3 text-white/50 font-mono text-xs">{u.stockCode || '—'}</td>
              <td className="px-4 py-3 text-white font-medium">{u.productName}</td>
              <td className="px-4 py-3 text-white/70">{u.companyName || '—'}</td>
              <td className="px-4 py-3 text-white/70">{formatCurrency(u.cost)}</td>
              <td className="px-4 py-3 text-white/70">{new Date(u.purchaseDate).toLocaleDateString('tr-TR')}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    isLowStock(u)
                      ? u.quantity <= 0 ? 'bg-red-500/30 text-red-200' : 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-green-500/20 text-green-300'
                  }`}>
                    {u.quantity <= 0 ? '0 adet — TÜKENDİ' : `${u.quantity} adet`}
                  </span>
                  {isLowStock(u) && u.quantity > 0 && (
                    <span className="text-yellow-300 text-xs font-semibold" title={`Kritik seviye: ${u.minStockLevel}`}>⚠️ Kritik</span>
                  )}
                  {(u.minStockLevel ?? 0) > 0 && (
                    <span className="text-white/40 text-xs">(min {u.minStockLevel})</span>
                  )}
                </div>
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
  );

  // Tüketim türü alt-gruplaması (İşlem / Genel / Kategorisiz). Sarf Malzeme ve
  // henüz kategorilenmemiş ürünler için kullanılır; mevcut görünümü korur.
  const renderConsumptionGroups = (items: DepoUrun[], depo: 'ana' | 'kat') => {
    const islemBazli = items.filter(u => u.consumptionType === 'islem-bazli');
    const genelBazli = items.filter(u => u.consumptionType === 'genel-bazli');
    const kategorisiz = items.filter(u => !u.consumptionType);
    return (
      <>
        {islemBazli.length > 0 && (
          <div className="border-b border-white/10">
            <div className="px-4 py-2.5 bg-indigo-500/10 flex items-center gap-2">
              <span className="text-indigo-300 text-base">⚙️</span>
              <p className="text-indigo-300 font-semibold text-sm">İşlem Bazlı Tüketim</p>
              <span className="ml-auto px-2 py-0.5 bg-indigo-500/20 border border-indigo-400/40 rounded-full text-indigo-300 text-xs">{islemBazli.length} ürün</span>
            </div>
            {renderUrunRows(islemBazli, depo)}
          </div>
        )}
        {genelBazli.length > 0 && (
          <div className="border-b border-white/10">
            <div className="px-4 py-2.5 bg-green-500/10 flex items-center gap-2">
              <span className="text-green-300 text-base">📦</span>
              <p className="text-green-300 font-semibold text-sm">Genel Bazlı Tüketim</p>
              <span className="ml-auto px-2 py-0.5 bg-green-500/20 border border-green-400/40 rounded-full text-green-300 text-xs">{genelBazli.length} ürün</span>
            </div>
            {renderUrunRows(genelBazli, depo)}
          </div>
        )}
        {kategorisiz.length > 0 && (
          <div className="border-b border-white/10">
            <div className="px-4 py-2.5 bg-white/5 flex items-center gap-2">
              <span className="text-white/40 text-base">📋</span>
              <p className="text-white/40 font-semibold text-sm">Tüketim Türü Belirtilmemiş</p>
              <span className="ml-auto px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/40 text-xs">{kategorisiz.length} ürün</span>
            </div>
            {renderUrunRows(kategorisiz, depo)}
          </div>
        )}
      </>
    );
  };

  // Not: React bileşeni yerine düz render fonksiyonu olarak tanımlandı. Böylece
  // her ebeveyn render'ında yeniden mount edilmez ve arama kutusu odağı kaybolmaz.
  const renderUrunTable = (urunler: DepoUrun[], depo: 'ana' | 'kat') => {
    const search = depo === 'ana' ? anaDepoSearch : katDepoSearch;
    const setSearch = depo === 'ana' ? setAnaDepoSearch : setKatDepoSearch;
    const q = search.trim().toLocaleLowerCase('tr');
    const matches = (u: DepoUrun) =>
      !q ||
      (u.productName || '').toLocaleLowerCase('tr').includes(q) ||
      (u.stockCode || '').toLocaleLowerCase('tr').includes(q) ||
      (u.companyName || '').toLocaleLowerCase('tr').includes(q);

    const filtered = urunler.filter(matches);
    // Eski (kategorisiz) ürünler "Diğer" başlığı altında gösterilir.
    const uncategorized = filtered.filter(u => !u.category);
    // Arama aktifken tüm kategoriler otomatik açılır; eşleşen ürün görünür kalır.
    const isExpanded = (catKey: string) => !!q || !!expandedCategories[`${depo}-${catKey}`];
    const toggleCat = (catKey: string) =>
      setExpandedCategories(prev => ({ ...prev, [`${depo}-${catKey}`]: !prev[`${depo}-${catKey}`] }));

    return (
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/20 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-white font-bold text-lg">
            {depo === 'ana' ? '🏭 Ana Depo Stok Listesi' : '🏥 Kat Deposu Stok Listesi'}
          </h3>
          <div className="flex gap-2 items-center flex-wrap">
            {/* Ürün arama */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ürün ara (ad, kod, firma)..."
                className="w-56 pl-9 pr-8 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 text-xs transition-all"
                  aria-label="Aramayı temizle"
                >✕</button>
              )}
            </div>
            {depo === 'ana' && canManage && !isAsistan && (
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
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-white/50">
            <div className="text-4xl mb-3">🔍</div>
            <p>"{search}" ile eşleşen ürün bulunamadı.</p>
          </div>
        ) : (
          <>
            {/* 4 ana kategori — her biri aç/kapanabilir akordeon */}
            {visibleCategories.map(cat => {
              const items = filtered.filter(u => u.category === cat.key);
              const open = isExpanded(cat.key);
              return (
                <div key={cat.key} className="border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.key)}
                    className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 flex items-center gap-2 transition-all"
                  >
                    <span className={`text-white/50 text-sm transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-lg">{cat.icon}</span>
                    <p className="text-white font-bold text-sm">{cat.label}</p>
                    <span className="ml-auto px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/70 text-xs">{items.length} ürün</span>
                  </button>
                  {open && (
                    items.length === 0 ? (
                      <div className="p-6 text-center text-white/40 text-sm">Bu kategoride ürün yok.</div>
                    ) : cat.key === 'sarf' ? (
                      renderConsumptionGroups(items, depo)
                    ) : (
                      renderUrunRows(items, depo)
                    )
                  )}
                </div>
              );
            })}

            {/* Diğer — kategorisi olmayan eski ürünler (asistan görmez) */}
            {!isAsistan && uncategorized.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleCat('uncategorized')}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 flex items-center gap-2 transition-all"
                >
                  <span className={`text-white/50 text-sm transition-transform duration-200 ${isExpanded('uncategorized') ? 'rotate-90' : ''}`}>▶</span>
                  <span className="text-lg">📋</span>
                  <p className="text-white/60 font-bold text-sm">Diğer (Kategorisiz)</p>
                  <span className="ml-auto px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/50 text-xs">{uncategorized.length} ürün</span>
                </button>
                {isExpanded('uncategorized') && renderConsumptionGroups(uncategorized, depo)}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

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
      {/* ─── Düşük Stok Bildirimi (sayfaya girişte açılır) ─────────── */}
      {lowStockItems.length > 0 && !lowStockToastDismissed && (
        <div className="fixed top-4 right-4 z-[60] w-full max-w-sm">
          <div className="bg-slate-900 border-2 border-red-500/70 rounded-2xl shadow-2xl shadow-red-500/20 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-red-600/40 to-orange-500/30 border-b border-red-500/40">
              <span className="text-2xl animate-pulse">🚨</span>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Düşük Stok Alarmı</p>
                <p className="text-red-100/80 text-xs">{lowStockItems.length} ürün kritik seviyede veya tükendi</p>
              </div>
              <button
                onClick={() => setLowStockToastDismissed(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
              >✕</button>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-2">
              {lowStockItems.map(u => (
                <div key={`${u._depoLabel}-${u.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${u.quantity <= 0 ? 'bg-red-400' : 'bg-yellow-400'}`}></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.productName}</p>
                    <p className="text-white/50 text-xs">{u._depoLabel}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${u.quantity <= 0 ? 'bg-red-500/30 text-red-200' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {u.quantity <= 0 ? 'TÜKENDİ' : `${u.quantity} adet`}
                    {(u.minStockLevel ?? 0) > 0 ? ` / min ${u.minStockLevel}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* ─── Kalıcı Düşük Stok Banner'ı (aç/kapanabilir) ──────────── */}
      {lowStockItems.length > 0 && (
        <div className="bg-gradient-to-r from-red-500/15 to-orange-500/15 border border-red-500/40 rounded-2xl p-4">
          <button
            type="button"
            onClick={() => setLowStockBannerOpen(o => !o)}
            className="w-full flex items-center gap-3 text-left"
            aria-expanded={lowStockBannerOpen}
          >
            <span className="text-2xl animate-pulse">🚨</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-red-200 font-bold text-lg">Düşük Stok Uyarısı</h3>
              <p className="text-red-100/70 text-sm">Aşağıdaki {lowStockItems.length} ürünün stoğu kritik seviyede veya tükendi. En kısa sürede tedarik edin.</p>
            </div>
            <span className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-400/40 rounded-lg text-red-100 text-sm font-medium">
              {lowStockBannerOpen ? 'Gizle' : 'Göster'}
              <span className={`text-xs transition-transform duration-200 ${lowStockBannerOpen ? 'rotate-90' : ''}`}>▶</span>
            </span>
          </button>
          {lowStockBannerOpen && (
            <div className="flex flex-wrap gap-2 mt-3">
              {lowStockItems.map(u => (
                <span
                  key={`banner-${u._depoLabel}-${u.id}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                    u.quantity <= 0
                      ? 'bg-red-500/25 text-red-100 border-red-400/50'
                      : 'bg-yellow-500/15 text-yellow-200 border-yellow-400/40'
                  }`}
                  title={u._depoLabel}
                >
                  {u.quantity <= 0 ? '⛔' : '⚠️'} {u.productName} · {u._depoLabel}: {u.quantity <= 0 ? 'TÜKENDİ' : `${u.quantity} adet`}
                  {(u.minStockLevel ?? 0) > 0 ? ` (min ${u.minStockLevel})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ana Sekmeler */}
      <div className="flex gap-2 flex-wrap">
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
        {(
          <button
            onClick={() => setActiveTab('eslestirme')}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'eslestirme'
                ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            🔗 Malzeme Eşleştirme
          </button>
        )}
        {(
          <button
            onClick={() => setActiveTab('malzeme-talebi')}
            className={`relative px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'malzeme-talebi'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            📋 Malzeme Talebi
            {malzemeTalepleri.filter(t => t.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                {malzemeTalepleri.filter(t => t.status === 'pending').length}
              </span>
            )}
          </button>
        )}
        {canManage && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowUrunModal(true)}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border border-white/20 flex items-center gap-2"
            >
              📦 Ürün Yönetimi
              <span className="px-1.5 py-0.5 bg-white/10 rounded-full text-white/60 text-xs">{kayitliUrunler.length}</span>
            </button>
            <button
              onClick={() => setShowFirmaModal(true)}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border border-white/20 flex items-center gap-2"
            >
              🏢 Firma Yönetimi
              <span className="px-1.5 py-0.5 bg-white/10 rounded-full text-white/60 text-xs">{firmalar.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── ANA DEPO ──────────────────────────────────────────── */}
      {activeTab === 'ana-depo' && (
        <div className="space-y-6">
          {renderUrunTable(anaDepoUrunler, 'ana')}

          {/* ── Sekmeli bilgi kartı ── */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            {/* Sekme başlıkları */}
            <div className="flex items-stretch border-b border-white/20">
              <div className="flex flex-1">
                {([
                  { key: 'transfer', label: '🚚 Transfer Planları' },
                  { key: 'eklemeler', label: '📦 Ürün Eklemeleri' },
                  { key: 'talepler', label: '📋 Malzeme Talepleri' },
                ] as { key: 'transfer' | 'eklemeler' | 'talepler'; label: string }[]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setAnaDepoInfoTab(tab.key)}
                    className={`relative flex-1 px-4 py-3 text-sm font-semibold transition-all ${
                      anaDepoInfoTab === tab.key
                        ? 'bg-white/10 text-white border-b-2 border-green-400'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                    {tab.key === 'talepler' && malzemeTalepleri.filter(t => t.status === 'pending').length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-orange-500 rounded-full text-white text-xs">
                        {malzemeTalepleri.filter(t => t.status === 'pending').length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* Export butonları */}
              <div className="flex items-center gap-1.5 px-3 border-l border-white/10">
                {anaDepoInfoTab === 'transfer' && (
                  <>
                    <button onClick={exportTransferExcel} title="Excel İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 rounded-lg text-emerald-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17l1.5-2.5L11.5 17H13l-2-3 2-3h-1.5L10 13.5 8.5 11H7l2 3-2 3h1.5z"/></svg>
                      Excel
                    </button>
                    <button onClick={exportTransferPdf} title="PDF İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg text-rose-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13h1.5v3H12v-3h1.5L11.25 10 9 13zm5.5 2.5h-1v-2h1v2z"/></svg>
                      PDF
                    </button>
                  </>
                )}
                {anaDepoInfoTab === 'eklemeler' && (
                  <>
                    <button onClick={exportEklemelerExcel} title="Excel İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 rounded-lg text-emerald-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17l1.5-2.5L11.5 17H13l-2-3 2-3h-1.5L10 13.5 8.5 11H7l2 3-2 3h1.5z"/></svg>
                      Excel
                    </button>
                    <button onClick={exportEklemelerPdf} title="PDF İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg text-rose-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13h1.5v3H12v-3h1.5L11.25 10 9 13zm5.5 2.5h-1v-2h1v2z"/></svg>
                      PDF
                    </button>
                  </>
                )}
                {anaDepoInfoTab === 'talepler' && (
                  <>
                    <button onClick={exportTaleplerExcel} title="Excel İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 rounded-lg text-emerald-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17l1.5-2.5L11.5 17H13l-2-3 2-3h-1.5L10 13.5 8.5 11H7l2 3-2 3h1.5z"/></svg>
                      Excel
                    </button>
                    <button onClick={exportTaleplerPdf} title="PDF İndir"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg text-rose-300 text-xs font-semibold transition-all">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13h1.5v3H12v-3h1.5L11.25 10 9 13zm5.5 2.5h-1v-2h1v2z"/></svg>
                      PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Transfer Planları ── */}
            {anaDepoInfoTab === 'transfer' && (
              <>
                {plannedTransfers.length === 0 && completedTransfers.length === 0 ? (
                  <div className="p-10 text-center text-white/40">
                    <div className="text-4xl mb-2">🚚</div>
                    <p>Henüz transfer planı yok.</p>
                  </div>
                ) : (
                  <>
                    {plannedTransfers.length > 0 && (
                      <div className="divide-y divide-white/10">
                        {plannedTransfers.map(t => (
                          <div key={t.id} className="p-4 hover:bg-white/5 transition-all">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/50 rounded-full text-amber-300 text-xs font-semibold">Planlandı</span>
                                  <span className="text-white/70 text-sm font-medium">🗓 {formatDateTime(t.scheduledDate, t.scheduledTime)}</span>
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
                                      {item.productName}<span className="text-amber-300 font-semibold ml-1">×{item.quantity}</span>
                                    </span>
                                  ))}
                                </div>
                                {t.notes && <p className="text-white/40 text-xs mt-1">Not: {t.notes}</p>}
                                <p className="text-white/30 text-xs mt-1">Oluşturan: {t.createdBy}</p>
                              </div>
                              {canManage && (
                                <div className="flex gap-2 flex-shrink-0">
                                  <button onClick={() => executeTransfer(t)} disabled={completingTransferId === t.id}
                                    className="px-3 py-1.5 bg-blue-500/20 border border-blue-400/50 rounded-lg text-blue-300 hover:bg-blue-500/30 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1">
                                    {completingTransferId === t.id
                                      ? <><div className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full animate-spin" />İşleniyor...</>
                                      : <><span>⚡</span>Hemen Gönder</>}
                                  </button>
                                  <button onClick={() => handleCancelTransfer(t)} disabled={completingTransferId === t.id}
                                    className="px-3 py-1.5 bg-red-500/20 border border-red-400/50 rounded-lg text-red-300 hover:bg-red-500/30 text-xs transition-all disabled:opacity-50">İptal</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {completedTransfers.length > 0 && (
                      <div className={plannedTransfers.length > 0 ? 'border-t border-white/10' : ''}>
                        <div className="px-4 py-2 bg-white/5">
                          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Son Tamamlananlar</p>
                        </div>
                        <div className="divide-y divide-white/5">
                          {completedTransfers.slice(0, 5).map(t => (
                            <div key={t.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                              <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></span>
                              <div className="flex-1 min-w-0">
                                <p className="text-white/70 text-xs">{formatDateTime(t.scheduledDate, t.scheduledTime)} • {t.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}</p>
                                <p className="text-white/40 text-xs">Tamamlayan: {t.completedBy}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex-shrink-0">Tamamlandı</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Ürün Eklemeleri ── */}
            {anaDepoInfoTab === 'eklemeler' && (
              <>
                {anaDepoUrunler.length === 0 ? (
                  <div className="p-10 text-center text-white/40">
                    <div className="text-4xl mb-2">📦</div>
                    <p>Henüz ürün eklenmemiş.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/20 bg-white/5">
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Ürün Adı</th>
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Firma Adı</th>
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Adet</th>
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Maliyet</th>
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Alım Tarihi</th>
                          <th className="px-4 py-3 text-left text-white/70 font-semibold">Ekleyen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {[...anaDepoUrunler]
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map(u => (
                            <tr key={u.id} className="hover:bg-white/5 transition-all">
                              <td className="px-4 py-3 text-white font-medium">{u.productName}</td>
                              <td className="px-4 py-3 text-white/60">{u.companyName || '—'}</td>
                              <td className="px-4 py-3 text-white">{u.quantity}</td>
                              <td className="px-4 py-3 text-white/60">{u.cost > 0 ? `₺${u.cost.toLocaleString('tr-TR')}` : '—'}</td>
                              <td className="px-4 py-3 text-white/60">{u.purchaseDate ? new Date(u.purchaseDate).toLocaleDateString('tr-TR') : '—'}</td>
                              <td className="px-4 py-3 text-white/60">{u.createdBy || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── Malzeme Talepleri ── */}
            {anaDepoInfoTab === 'talepler' && (
              <>
                {malzemeTalepleri.length === 0 ? (
                  <div className="p-10 text-center text-white/40">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Henüz malzeme talebi yok.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10 max-h-[60vh] overflow-y-auto">
                    {malzemeTalepleri.map(talep => {
                      const statusMap = {
                        pending:  { label: 'Bekliyor',           cls: 'bg-amber-500/20 text-amber-300 border-amber-400/50' },
                        approved: { label: 'Onaylandı',          cls: 'bg-green-500/20 text-green-300 border-green-400/50' },
                        rejected: { label: 'Reddedildi',         cls: 'bg-red-500/20 text-red-300 border-red-400/50' },
                        partial:  { label: 'Kısmen Onaylandı',   cls: 'bg-blue-500/20 text-blue-300 border-blue-400/50' },
                      };
                      const s = statusMap[talep.status];
                      return (
                        <div key={talep.id} className="p-4 space-y-3">
                          {/* Üst bilgi + durum */}
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-white font-semibold">{talep.requestedBy}</p>
                              <p className="text-white/50 text-xs">{new Date(talep.requestedAt).toLocaleString('tr-TR')}</p>
                              {talep.notes && <p className="text-white/50 text-xs mt-0.5">Not: {talep.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 border rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
                              {talep.status === 'pending' && canRespondTalep && respondingId !== talep.id && (
                                <button onClick={() => openRespond(talep)}
                                  className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/50 rounded-lg text-orange-300 text-xs font-semibold transition-all">
                                  Yanıtla
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Malzeme listesi veya yanıt formu */}
                          {respondingId !== talep.id ? (
                            <div className="flex flex-wrap gap-2">
                              {talep.items.map((it, i) => (
                                <span key={i} className="px-2 py-1 bg-white/10 rounded-lg text-white/70 text-xs">
                                  {it.productName} <span className="text-orange-300 font-bold">×{it.requestedQty}</span>
                                  {it.approvedQty !== undefined && it.approvedQty !== it.requestedQty && (
                                    <span className="text-green-300 ml-1">(onaylanan: {it.approvedQty})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                              <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">Onaylanacak miktarları ayarlayın</p>
                              <div className="space-y-2">
                                {talep.items.map(it => (
                                  <div key={it.productId} className="flex items-center gap-3">
                                    <span className="flex-1 text-white text-sm truncate">{it.productName}</span>
                                    <span className="text-white/40 text-xs shrink-0">Talep: {it.requestedQty}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button type="button" onClick={() => setRespondQtys(p => ({ ...p, [it.productId]: Math.max(0, (p[it.productId] ?? it.requestedQty) - 1) }))}
                                        className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center">−</button>
                                      <input type="number" min={0} max={it.requestedQty}
                                        value={respondQtys[it.productId] ?? it.requestedQty}
                                        onChange={e => setRespondQtys(p => ({ ...p, [it.productId]: Math.max(0, Math.min(it.requestedQty, parseInt(e.target.value) || 0)) }))}
                                        className="w-14 text-center text-sm bg-white/10 border border-white/20 rounded px-1 py-0.5 text-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
                                      <button type="button" onClick={() => setRespondQtys(p => ({ ...p, [it.productId]: Math.min(it.requestedQty, (p[it.productId] ?? it.requestedQty) + 1) }))}
                                        className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center">+</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <input type="text" placeholder="Yanıt notu (opsiyonel)" value={respondNotes}
                                onChange={e => setRespondNotes(e.target.value)}
                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setRespondingId(null)}
                                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white/70 text-sm transition-all">İptal</button>
                                <button onClick={() => handleRespondTalep(talep, 'reject')} disabled={respondSaving}
                                  className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 rounded-xl text-red-300 text-sm font-semibold transition-all disabled:opacity-50">Reddet</button>
                                <button onClick={() => handleRespondTalep(talep, 'approve')} disabled={respondSaving}
                                  className="px-4 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 rounded-xl text-green-300 text-sm font-semibold transition-all disabled:opacity-50">
                                  {respondSaving ? 'İşleniyor...' : 'Onayla & Gönder'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Yanıt bilgisi */}
                          {talep.respondedBy && (
                            <p className="text-white/40 text-xs">
                              {talep.respondedBy} tarafından {new Date(talep.respondedAt!).toLocaleString('tr-TR')} tarihinde yanıtlandı
                              {talep.responseNotes && ` — "${talep.responseNotes}"`}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
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

          {katActiveTab === 'stok' && renderUrunTable(katDepoUrunler, 'kat')}

          {katActiveTab === 'kullanim' && (
            <div className="space-y-4">
              {(
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
                <div className="p-4 border-b border-white/20 flex items-center justify-between flex-wrap gap-3">
                  <h3 className="text-white font-bold">{isNurse ? 'Kendi Kullanım Geçmişim' : 'Tüm Kullanım Kayıtları'}</h3>
                  {filteredKullanim.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={downloadKullanimPDF}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-300 text-xs font-semibold rounded-xl transition-all"
                      >
                        📄 PDF İndir
                      </button>
                      <button
                        onClick={downloadKullanimExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-400/40 text-green-300 text-xs font-semibold rounded-xl transition-all"
                      >
                        📊 Excel İndir
                      </button>
                    </div>
                  )}
                </div>
                {filteredKullanim.length === 0 ? (
                  <div className="p-10 text-center text-white/40">
                    <div className="text-4xl mb-3">📊</div>
                    <p>Kullanım kaydı bulunamadı.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {filteredKullanim.map(k => (
                      <div key={k.id} className="p-4 hover:bg-white/5 transition-all">
                        {/* Üst satır: tarih + hasta */}
                        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                          <p className="text-white/40 text-xs">
                            {new Date(k.createdAt).toLocaleString('tr-TR')}
                            <span className="mx-2">•</span>
                            <span className="text-white/60">Hasta:</span> {k.patientName}
                          </p>
                        </div>

                        {/* Protokol + Uygulayan */}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2">
                          {k.treatmentName && (
                            <p className="text-white font-semibold text-sm">
                              📋 {k.treatmentName}
                            </p>
                          )}
                          <p className="text-indigo-300 text-xs font-medium self-center">
                            👤 Uygulayan: <span className="text-white">{k.nurseName}</span>
                          </p>
                        </div>

                        {/* Uygulanan tedaviler */}
                        {k.appliedApplications && k.appliedApplications.length > 0 && (
                          <div className="mb-2">
                            <p className="text-white/50 text-xs mb-1">Uygulanan Tedaviler:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {k.appliedApplications.map((app, i) => (
                                <span key={i} className="px-2 py-0.5 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-200 text-xs">
                                  {app}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Kullanılan malzemeler */}
                        {k.items.length > 0 && (
                          <div>
                            <p className="text-white/50 text-xs mb-1">Kullanılan Malzemeler:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {k.items.map((item, i) => (
                                <span key={i} className="px-2 py-0.5 bg-indigo-500/15 border border-indigo-400/30 rounded-lg text-white/80 text-xs">
                                  {item.productName}: <span className="text-white font-semibold">{item.usedQty} adet</span>
                                  {item.usedQty !== item.plannedQty && <span className="text-yellow-400 ml-1">(plan: {item.plannedQty})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MALZEME TALEBİ ──────────────────────────────────── */}
      {activeTab === 'malzeme-talebi' && (
        <div className="space-y-6">
          {/* Yeni Talep Formu */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/20 space-y-3">
              <div>
                <h3 className="text-white font-bold text-lg flex items-center gap-2"><span>📋</span> Yeni Malzeme Talebi</h3>
                <p className="text-white/50 text-xs mt-1">Ana depodan talep etmek istediğiniz malzemeleri ve miktarları seçin</p>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔍</span>
                <input
                  type="text"
                  value={talepMalzemeSearch}
                  onChange={e => setTalepMalzemeSearch(e.target.value)}
                  placeholder="Malzeme ara..."
                  className="w-full pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {anaDepoUrunler.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-8">Ana depoda ürün bulunmuyor.</p>
              ) : (
                [...anaDepoUrunler]
                  .sort((a, b) => a.productName.localeCompare(b.productName, 'tr'))
                  .filter(urun => urun.productName.toLowerCase().includes(talepMalzemeSearch.toLowerCase()))
                  .map(urun => {
                  const qty = talepQtys[urun.id!] || 0;
                  return (
                    <div key={urun.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${qty > 0 ? 'bg-orange-500/15 border-orange-400/50' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{urun.productName}</p>
                        <p className="text-white/40 text-xs">Stok: {urun.quantity}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setTalepQtys(p => ({ ...p, [urun.id!]: Math.max(0, (p[urun.id!] || 0) - 1) }))}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center transition-all">−</button>
                        <input type="number" min={0}
                          value={qty}
                          onChange={e => setTalepQtys(p => ({ ...p, [urun.id!]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-14 text-center text-sm bg-white/10 border border-white/20 rounded-lg px-1 py-1 text-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                        <button type="button" onClick={() => setTalepQtys(p => ({ ...p, [urun.id!]: (p[urun.id!] || 0) + 1 }))}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center transition-all">+</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-white/20 space-y-3">
              <input type="text" placeholder="Not (opsiyonel)" value={talepNotes} onChange={e => setTalepNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-xs">{Object.values(talepQtys).filter(q => q > 0).length} malzeme seçildi</p>
                <button onClick={handleSubmitTalep} disabled={talepSaving}
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all text-sm">
                  {talepSaving ? 'Gönderiliyor...' : '📤 Talep Gönder'}
                </button>
              </div>
            </div>
          </div>

          {/* Geçmiş Talepler */}
          {malzemeTalepleri.length > 0 && (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/20">
                <h3 className="text-white font-bold text-lg flex items-center gap-2"><span>🕐</span> Talep Geçmişi</h3>
              </div>
              <div className="divide-y divide-white/10 max-h-[40vh] overflow-y-auto">
                {malzemeTalepleri.map(talep => {
                  const statusMap = { pending: { label: 'Bekliyor', cls: 'bg-amber-500/20 text-amber-300 border-amber-400/50' }, approved: { label: 'Onaylandı', cls: 'bg-green-500/20 text-green-300 border-green-400/50' }, rejected: { label: 'Reddedildi', cls: 'bg-red-500/20 text-red-300 border-red-400/50' }, partial: { label: 'Kısmen Onaylandı', cls: 'bg-blue-500/20 text-blue-300 border-blue-400/50' } };
                  const s = statusMap[talep.status];
                  return (
                    <div key={talep.id} className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-white/50 text-xs">{new Date(talep.requestedAt).toLocaleString('tr-TR')}</p>
                        <span className={`px-2 py-0.5 border rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {talep.items.map((it, i) => (
                          <span key={i} className="px-2 py-1 bg-white/10 rounded-lg text-white/70 text-xs">
                            {it.productName} <span className="text-orange-300 font-bold">×{it.requestedQty}</span>
                            {it.approvedQty !== undefined && it.approvedQty !== it.requestedQty && (
                              <span className="text-green-300 ml-1">(onaylanan: {it.approvedQty})</span>
                            )}
                          </span>
                        ))}
                      </div>
                      {talep.responseNotes && <p className="text-white/40 text-xs mt-1">Yanıt: {talep.responseNotes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MALZEME EŞLEŞTİRME ──────────────────────────────── */}
      {activeTab === 'eslestirme' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sol: Tedavi Listesi */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/20 space-y-3">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <span>💉</span> Kaydedilmiş Uygulamalar
              </h3>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔍</span>
                <input
                  type="text"
                  value={eslestirmeAppSearch}
                  onChange={e => setEslestirmeAppSearch(e.target.value)}
                  placeholder="Uygulama ara..."
                  className="w-full pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>
            {medicalApps.length === 0 ? (
              <div className="p-8 text-center text-white/40">
                <div className="text-4xl mb-2">💉</div>
                <p>Henüz kaydedilmiş uygulama yok.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 max-h-[60vh] overflow-y-auto">
                {[...medicalApps]
                  .filter((app, idx, arr) => arr.findIndex(a => a.name === app.name) === idx)
                  .filter(app => app.name.toLowerCase().includes(eslestirmeAppSearch.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                  .map(app => {
                  const mapped = eslestirmeler.find(e => e.applicationName === app.name);
                  const isSelected = eslestirmeSelectedApp?.id === app.id;
                  return (
                    <button
                      key={app.id}
                      onClick={() => handleSelectEslestirmeApp(app)}
                      className={`w-full text-left px-4 py-3 transition-all flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-purple-500/20 border-l-2 border-purple-400' : 'hover:bg-white/5'
                      }`}
                    >
                      <div>
                        <p className="text-white font-medium text-sm">{app.name}</p>
                        {app.description && <p className="text-white/50 text-xs truncate max-w-xs">{app.description}</p>}
                      </div>
                      {mapped && mapped.materials.length > 0 ? (
                        <span className="shrink-0 px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/50 rounded-full text-emerald-300 text-xs">
                          {mapped.materials.length} malzeme
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/40 text-xs">
                          Atanmamış
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sağ: Malzeme Atama */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            {!eslestirmeSelectedApp ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="text-5xl mb-4 opacity-40">🔗</div>
                <p className="text-white/40">Soldaki listeden bir uygulama seçin</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-white/20 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-white font-bold text-lg">📦 {eslestirmeSelectedApp.name}</h3>
                      <p className="text-white/50 text-xs mt-1">Bu tedavide varsayılan kullanılacak kat deposu malzemeleri ve miktarları</p>
                    </div>
                    {eslestirmeler.some(e => e.applicationName === eslestirmeSelectedApp.name) && (
                      <button
                        onClick={handleDeleteEslestirme}
                        disabled={eslestirmeSaving}
                        className="shrink-0 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed text-red-300 hover:text-red-200 font-semibold rounded-xl transition-all text-xs"
                      >
                        🗑 Eşleştirmeyi Sil
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔍</span>
                    <input
                      type="text"
                      value={eslestirmeMalzemeSearch}
                      onChange={e => setEslestirmeMalzemeSearch(e.target.value)}
                      placeholder="Malzeme ara..."
                      className="w-full pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
                <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
                  {katDepoUrunler.length === 0 ? (
                    <p className="text-white/40 text-sm text-center py-8">Kat deposunda ürün bulunmuyor.</p>
                  ) : (
                    katDepoUrunler
                      .slice()
                      .sort((a, b) => a.productName.localeCompare(b.productName, 'tr'))
                      .filter(urun => urun.productName.toLowerCase().includes(eslestirmeMalzemeSearch.toLowerCase()))
                      .map(urun => {
                        const qty = eslestirmeQtys[urun.id!] || 0;
                        return (
                          <div
                            key={urun.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              qty > 0 ? 'bg-purple-500/15 border-purple-400/50' : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{urun.productName}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEslestirmeQtys(prev => ({ ...prev, [urun.id!]: Math.max(0, (prev[urun.id!] || 0) - 1) }))}
                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center transition-all"
                              >−</button>
                              <input
                                type="number"
                                min={0}
                                value={qty}
                                onChange={e => setEslestirmeQtys(prev => ({ ...prev, [urun.id!]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                className="w-14 text-center text-sm bg-white/10 border border-white/20 rounded-lg px-1 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                              />
                              <button
                                type="button"
                                onClick={() => setEslestirmeQtys(prev => ({ ...prev, [urun.id!]: (prev[urun.id!] || 0) + 1 }))}
                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center transition-all"
                              >+</button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
                <div className="p-4 border-t border-white/20 flex items-center justify-between gap-2">
                  <p className="text-white/50 text-xs">
                    {Object.values(eslestirmeQtys).filter(q => q > 0).length} malzeme seçildi
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEslestirmeQtys({})}
                      disabled={eslestirmeSaving || Object.values(eslestirmeQtys).filter(q => q > 0).length === 0}
                      className="px-4 py-2 bg-white/10 hover:bg-red-500/20 border border-white/20 hover:border-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-white/70 hover:text-red-300 font-semibold rounded-xl transition-all text-sm"
                    >
                      🔄 Sıfırla
                    </button>
                    <button
                      onClick={handleSaveEslestirme}
                      disabled={eslestirmeSaving}
                      className="px-5 py-2 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all text-sm"
                    >
                      {eslestirmeSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Ürün Yönetimi Modal ──────────────────────────────── */}
      {showUrunModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setShowUrunModal(false)}
        >
          <div
            className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/20 flex items-center gap-3 bg-gradient-to-r from-green-500/15 to-emerald-500/10">
              <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-green-500/20 text-xl">📦</span>
              <div className="flex-1">
                <h3 className="text-white font-bold text-lg leading-tight">Ürün Yönetimi</h3>
                <p className="text-white/50 text-xs">Ürün eklerken seçilecek ürün adlarını buradan yönetin</p>
              </div>
              <button onClick={() => setShowUrunModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all text-lg">✕</button>
            </div>

            <div className="p-5 border-b border-white/10">
              <label className="block text-white/70 text-sm mb-2">Yeni Ürün Ekle</label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newUrunName}
                    onChange={e => setNewUrunName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddUrun(); }}
                    placeholder="Ürün adı..."
                    className="flex-1 px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                {/* Kategori seçimi */}
                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Kategori (opsiyonel)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DEPO_CATEGORIES.map(cat => (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setNewUrunCategory(prev => prev === cat.key ? undefined : cat.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          newUrunCategory === cat.key
                            ? 'bg-green-500/20 border-green-400/60 text-white'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                        }`}
                      >
                        <span>{cat.icon}</span>{cat.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Kritik stok seviyesi */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-white/50 text-xs mb-1">Kritik Stok Seviyesi (opsiyonel)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={newUrunMinStock === 0 ? '' : newUrunMinStock}
                      onChange={e => setNewUrunMinStock(e.target.value === '' ? 0 : Number(e.target.value))}
                      placeholder="Örn. 5"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleAddUrun}
                    disabled={urunSaving || !newUrunName.trim()}
                    className="mt-5 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 whitespace-nowrap"
                  >
                    {urunSaving ? 'Ekleniyor...' : '+ Ekle'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/70 text-sm font-semibold">Kayıtlı Ürünler</p>
                <span className="px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/60 text-xs">{kayitliUrunler.length} ürün</span>
              </div>
              {kayitliUrunler.length === 0 ? (
                <div className="py-10 text-center text-white/40">
                  <div className="text-4xl mb-2">📦</div>
                  <p className="text-sm">Henüz ürün eklenmemiş.</p>
                  <p className="text-xs text-white/30 mt-1">Yukarıdan ilk ürününüzü ekleyin.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {kayitliUrunler.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
                      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-sm flex-shrink-0">
                        {u.category ? DEPO_CATEGORIES.find(c => c.key === u.category)?.icon || '📦' : '📦'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{u.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {u.category && (
                            <span className="text-white/40 text-xs">{DEPO_CATEGORIES.find(c => c.key === u.category)?.label}</span>
                          )}
                          {(u.minStockLevel ?? 0) > 0 && (
                            <span className="text-yellow-400/70 text-xs">⚠️ min {u.minStockLevel}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteUrun(u)}
                        className="px-3 py-1 bg-red-500/20 border border-red-400/40 rounded-lg text-red-300 hover:bg-red-500/30 text-xs font-semibold transition-all flex-shrink-0"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/20 flex justify-end flex-shrink-0">
              <button onClick={() => setShowUrunModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all text-sm">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Firma Yönetimi Modal ─────────────────────────────── */}
      {showFirmaModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setShowFirmaModal(false)}
        >
          <div
            className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="p-5 border-b border-white/20 flex items-center gap-3 bg-gradient-to-r from-blue-500/15 to-indigo-500/10">
              <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500/20 text-xl">🏢</span>
              <div className="flex-1">
                <h3 className="text-white font-bold text-lg leading-tight">Firma Yönetimi</h3>
                <p className="text-white/50 text-xs">Firma eklerken seçilecek firmaları buradan yönetin</p>
              </div>
              <button onClick={() => setShowFirmaModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all text-lg">✕</button>
            </div>

            {/* Yeni firma ekleme */}
            <div className="p-5 border-b border-white/10">
              <label className="block text-white/70 text-sm mb-2">Yeni Firma Ekle</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newFirmaName}
                  onChange={e => setNewFirmaName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddFirma(); }}
                  placeholder="Firma veya tedarikçi adı..."
                  className="flex-1 px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleAddFirma}
                  disabled={firmaSaving}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {firmaSaving ? 'Ekleniyor...' : '+ Ekle'}
                </button>
              </div>
            </div>

            {/* Firma listesi */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/70 text-sm font-semibold">Kayıtlı Firmalar</p>
                <span className="px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-white/60 text-xs">{firmalar.length} firma</span>
              </div>
              {firmalar.length === 0 ? (
                <div className="py-10 text-center text-white/40">
                  <div className="text-4xl mb-2">🏢</div>
                  <p className="text-sm">Henüz firma eklenmemiş.</p>
                  <p className="text-xs text-white/30 mt-1">Yukarıdan ilk firmanızı ekleyin.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {firmalar.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
                      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-sm flex-shrink-0">🏢</span>
                      <span className="flex-1 text-white text-sm font-medium truncate">{f.name}</span>
                      <button
                        onClick={() => handleDeleteFirma(f)}
                        className="px-3 py-1 bg-red-500/20 border border-red-400/40 rounded-lg text-red-300 hover:bg-red-500/30 text-xs font-semibold transition-all flex-shrink-0"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/20 flex justify-end flex-shrink-0">
              <button onClick={() => setShowFirmaModal(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all text-sm">Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Ürün Ekle/Düzenle Modal ──────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-white/20 flex items-center justify-between flex-shrink-0">
              <h3 className="text-white font-bold text-lg">
                {editingUrun ? 'Ürün Düzenle' : `Ürün Ekle — ${activeDepo === 'ana' ? 'Ana Depo' : 'Kat Deposu'}`}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all text-lg">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-white/70 text-sm mb-1">Ürün Adı *</label>
                {(() => {
                  // depoKayitliUrunler + anaDepoUrunler + katDepoUrunler'den birleşik unique liste
                  const existingNames = new Set(kayitliUrunler.map(u => u.name.trim().toLocaleLowerCase('tr')));
                  // Stok kayıtlarından gelen adları KayitliUrun formatına çevir (kategori/minStockLevel bilgisiyle)
                  const fromStockAna: KayitliUrun[] = anaDepoUrunler
                    .filter(u => !existingNames.has(u.productName.trim().toLocaleLowerCase('tr')))
                    .reduce<KayitliUrun[]>((acc, u) => {
                      if (!acc.some(a => a.name.trim().toLocaleLowerCase('tr') === u.productName.trim().toLocaleLowerCase('tr'))) {
                        existingNames.add(u.productName.trim().toLocaleLowerCase('tr'));
                        acc.push({ name: u.productName, category: u.category, minStockLevel: u.minStockLevel, clinicId: u.clinicId, createdBy: u.createdBy, createdAt: u.createdAt });
                      }
                      return acc;
                    }, []);
                  const fromStockKat: KayitliUrun[] = katDepoUrunler
                    .filter(u => !existingNames.has(u.productName.trim().toLocaleLowerCase('tr')))
                    .reduce<KayitliUrun[]>((acc, u) => {
                      if (!acc.some(a => a.name.trim().toLocaleLowerCase('tr') === u.productName.trim().toLocaleLowerCase('tr'))) {
                        existingNames.add(u.productName.trim().toLocaleLowerCase('tr'));
                        acc.push({ name: u.productName, category: u.category, minStockLevel: u.minStockLevel, clinicId: u.clinicId, createdBy: u.createdBy, createdAt: u.createdAt });
                      }
                      return acc;
                    }, []);
                  const allUrunler = [
                    ...kayitliUrunler,
                    ...fromStockAna,
                    ...fromStockKat,
                  ].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

                  return allUrunler.length > 0 ? (
                    <select
                      value={formData.productName}
                      onChange={e => {
                        const selected = allUrunler.find(u => u.name === e.target.value);
                        setFormData(prev => ({
                          ...prev,
                          productName: e.target.value,
                          ...(selected?.category ? { category: selected.category, consumptionType: selected.category === 'sarf' ? prev.consumptionType : undefined } : {}),
                          ...(selected?.minStockLevel ? { minStockLevel: selected.minStockLevel } : {}),
                        }));
                      }}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="" className="bg-slate-800">Ürün seçin...</option>
                      {kayitliUrunler.length > 0 && (
                        <optgroup label="── Ürün Yönetimi ──" className="bg-slate-800 text-white/50">
                          {kayitliUrunler.map(u => (
                            <option key={u.id} value={u.name} className="bg-slate-800">
                              {u.name}{u.category ? ` · ${DEPO_CATEGORIES.find(c => c.key === u.category)?.label || u.category}` : ''}{u.minStockLevel ? ` (min: ${u.minStockLevel})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {(fromStockAna.length > 0 || fromStockKat.length > 0) && (
                        <optgroup label="── Mevcut Stoktan ──" className="bg-slate-800 text-white/50">
                          {[...fromStockAna, ...fromStockKat].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((u, i) => (
                            <option key={`stock-${i}`} value={u.name} className="bg-slate-800">
                              {u.name}{u.category ? ` · ${DEPO_CATEGORIES.find(c => c.key === u.category)?.label || u.category}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {formData.productName && !allUrunler.some(u => u.name === formData.productName) && (
                        <option value={formData.productName} className="bg-slate-800">{formData.productName} (listede yok)</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.productName}
                      onChange={e => setFormData(prev => ({ ...prev, productName: e.target.value }))}
                      placeholder="Kelebek valfi, Ozon filtresi..."
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  );
                })()}
                {kayitliUrunler.length === 0 && anaDepoUrunler.length === 0 && katDepoUrunler.length === 0 && (
                  <p className="text-white/40 text-xs mt-1">Henüz kayıtlı ürün yok. "Ürün Yönetimi" bölümünden ürün ekleyebilirsiniz.</p>
                )}
              </div>
              {[
                { label: 'Maliyet (₺)', key: 'cost', type: 'number', placeholder: '0' },
                { label: 'Alım Tarihi', key: 'purchaseDate', type: 'date', placeholder: '' },
                { label: 'Adet', key: 'quantity', type: 'number', placeholder: '0' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-white/70 text-sm mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    inputMode={field.type === 'number' ? 'numeric' : undefined}
                    min={field.type === 'number' ? 0 : undefined}
                    value={field.type === 'number' ? ((formData as any)[field.key] === 0 ? '' : (formData as any)[field.key]) : (formData as any)[field.key]}
                    onChange={e => setFormData(prev => ({ ...prev, [field.key]: field.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value }))}
                    onWheel={field.type === 'number' ? (e => (e.target as HTMLInputElement).blur()) : undefined}
                    onFocus={field.type === 'number' ? (e => e.target.select()) : undefined}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
              <div>
                <label className="block text-white/70 text-sm mb-1">Stok Kodu</label>
                <div className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/60 font-mono text-sm flex items-center gap-2">
                  <span>🏷️</span>
                  <span>{editingUrun?.stockCode || generateStockCode()}</span>
                  <span className="ml-auto text-white/30 text-xs font-sans">Otomatik</span>
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">Firma Adı</label>
                <select
                  value={formData.companyName || ''}
                  onChange={e => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="" className="bg-slate-800">Firma seçin...</option>
                  {firmalar.map(f => (
                    <option key={f.id} value={f.name} className="bg-slate-800">{f.name}</option>
                  ))}
                  {/* Daha önce serbest metin olarak girilmiş, listede olmayan firma adını koru */}
                  {formData.companyName && !firmalar.some(f => f.name === formData.companyName) && (
                    <option value={formData.companyName} className="bg-slate-800">{formData.companyName} (listede yok)</option>
                  )}
                </select>
                {firmalar.length === 0 && (
                  <p className="text-white/40 text-xs mt-1">Henüz firma yok. Ana Depo sekmesindeki "Firma Yönetimi" bölümünden firma ekleyebilirsiniz.</p>
                )}
              </div>
              {/* Kategori — Ürün Yönetimi'nden otomatik gelir, salt okunur göster */}
              {formData.category && (
                <div>
                  <label className="block text-white/70 text-sm mb-1">Kategori</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/70 text-sm">
                    <span>{DEPO_CATEGORIES.find(c => c.key === formData.category)?.icon}</span>
                    <span>{DEPO_CATEGORIES.find(c => c.key === formData.category)?.label}</span>
                    <span className="ml-auto text-white/30 text-xs">Otomatik</span>
                  </div>
                </div>
              )}
              {(formData.category === 'sarf' || (!formData.category && editingUrun)) && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">Tüketim Türü *</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all hover:bg-white/5"
                      style={{ borderColor: formData.consumptionType === 'islem-bazli' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.15)', background: formData.consumptionType === 'islem-bazli' ? 'rgba(99,102,241,0.1)' : undefined }}>
                      <div
                        onClick={() => setFormData(prev => ({ ...prev, consumptionType: prev.consumptionType === 'islem-bazli' ? undefined : 'islem-bazli' }))}
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all cursor-pointer ${formData.consumptionType === 'islem-bazli' ? 'bg-indigo-500 border-indigo-500' : 'border-white/30'}`}
                      >
                        {formData.consumptionType === 'islem-bazli' && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div onClick={() => setFormData(prev => ({ ...prev, consumptionType: prev.consumptionType === 'islem-bazli' ? undefined : 'islem-bazli' }))}>
                        <p className="text-white text-sm font-medium">⚙️ İşlem Bazlı Tüketim</p>
                        <p className="text-white/50 text-xs">Belirli bir işlem/tedaviye bağlı tüketim</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all hover:bg-white/5"
                      style={{ borderColor: formData.consumptionType === 'genel-bazli' ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.15)', background: formData.consumptionType === 'genel-bazli' ? 'rgba(34,197,94,0.1)' : undefined }}>
                      <div
                        onClick={() => setFormData(prev => ({ ...prev, consumptionType: prev.consumptionType === 'genel-bazli' ? undefined : 'genel-bazli' }))}
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all cursor-pointer ${formData.consumptionType === 'genel-bazli' ? 'bg-green-500 border-green-500' : 'border-white/30'}`}
                      >
                        {formData.consumptionType === 'genel-bazli' && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div onClick={() => setFormData(prev => ({ ...prev, consumptionType: prev.consumptionType === 'genel-bazli' ? undefined : 'genel-bazli' }))}>
                        <p className="text-white text-sm font-medium">📦 Genel Bazlı Tüketim</p>
                        <p className="text-white/50 text-xs">Genel kullanım ve genel tüketim ürünleri</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-white/20 flex gap-3 justify-end flex-shrink-0">
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

                {/* Kategori / tüketim türü sekme butonları (Teknik Depo hariç) */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {TRANSFER_GROUPS.map(tab => {
                    const count = anaDepoUrunler.filter(tab.match).length;
                    return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => { setTransferProductTab(prev => prev === tab.key ? null : tab.key); setTransferSearch(''); }}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        transferProductTab === tab.key
                          ? tab.activeClass
                          : 'bg-white/5 border-white/15 text-white/50 hover:bg-white/10 hover:text-white/80'
                      }`}
                    >
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${transferProductTab === tab.key ? 'bg-white/20' : 'bg-white/10'}`}>{count}</span>
                    </button>
                    );
                  })}
                </div>

                {/* Ürün listesi */}
                {!activeTransferGroup ? (
                  <div className="p-6 text-center text-white/40 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-sm">Yukarıdan bir ürün grubu seçin</p>
                  </div>
                ) : (
                  <>
                    {/* Arama */}
                    <div className="relative mb-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔍</span>
                      <input
                        type="text"
                        value={transferSearch}
                        onChange={e => setTransferSearch(e.target.value)}
                        placeholder="Ürün ara..."
                        className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {anaDepoUrunler
                        .filter(activeTransferGroup.match)
                        .filter(u => u.productName.toLowerCase().includes(transferSearch.toLowerCase()))
                        .sort((a, b) => a.productName.localeCompare(b.productName, 'tr'))
                        .map(urun => {
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
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                                isSelected ? 'bg-amber-500 border-amber-500' : 'border-2 border-white/30'
                              }`}>
                                {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium text-sm truncate">{urun.productName}</p>
                                <p className="text-white/50 text-xs">Mevcut: {urun.quantity} adet</p>
                              </div>
                              {isSelected && (
                                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.max(1, (prev[urun.id!] || 1) - 1) }))}
                                    className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-sm flex items-center justify-center transition-all">−</button>
                                  <input
                                    type="number" min={1} max={urun.quantity}
                                    value={selectedItems[urun.id!] || 1}
                                    onChange={e => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.min(urun.quantity, Math.max(1, Number(e.target.value))) }))}
                                    className="w-14 text-center px-1 py-1 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  />
                                  <button onClick={() => setSelectedItems(prev => ({ ...prev, [urun.id!]: Math.min(urun.quantity, (prev[urun.id!] || 1) + 1) }))}
                                    className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-sm flex items-center justify-center transition-all">+</button>
                                  <span className="text-white/40 text-xs">/ {urun.quantity}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {anaDepoUrunler.filter(activeTransferGroup.match).filter(u =>
                        u.productName.toLowerCase().includes(transferSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="p-6 text-center text-white/40 text-sm">
                          {transferSearch ? 'Arama sonucu bulunamadı.' : 'Bu kategoride ürün yok.'}
                        </div>
                      )}
                    </div>
                  </>
                )}
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
