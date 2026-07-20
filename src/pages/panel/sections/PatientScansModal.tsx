import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-toastify';
import { db, storage } from '../../../firebase/config';
import FileUpload from '../../../components/UI/FileUpload';
import { nowISO } from '../../../utils/dateUtils';
import { parseLabReportPdf } from '../../../utils/biyokimyaPdfExtract';
import type { LabParseResult } from '../../../utils/biyokimyaPdfParser';

interface Patient {
  id: string;
  fullName: string;
  optionalScans?: {
    meridianScan?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    thermalScan?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    toxicityScan?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    biyokimya?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    radyoloji?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    patoloji?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    epikriz?: { enabled?: boolean; fileUrl?: string; fileUrls?: string[] };
    [key: string]: any;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  doctorProfile?: any;
  onUpdated?: () => void;
}

type ScanKey = 'meridianScan' | 'thermalScan' | 'toxicityScan' | 'biyokimya' | 'radyoloji' | 'patoloji' | 'epikriz';

const SCAN_TYPES: Array<{ key: ScanKey; label: string; icon: string; storagePrefix: string }> = [
  { key: 'meridianScan', label: 'Meridyen Tarama', icon: '🔬', storagePrefix: 'meridian' },
  { key: 'thermalScan', label: 'Termal Tarama (IRIS-XP)', icon: '🌡️', storagePrefix: 'thermal' },
  { key: 'toxicityScan', label: 'Toksisite Ölçümü', icon: '⚗️', storagePrefix: 'toxicity' },
  { key: 'biyokimya', label: 'Biyokimya', icon: '🧪', storagePrefix: 'biyokimya' },
  { key: 'radyoloji', label: 'Radyolojik Görüntüleme', icon: '🩻', storagePrefix: 'radyoloji' },
  { key: 'patoloji', label: 'Patoloji', icon: '🔭', storagePrefix: 'patoloji' },
  { key: 'epikriz', label: 'Epikriz', icon: '📋', storagePrefix: 'epikriz' },
];

const PatientScansModal: React.FC<Props> = ({ isOpen, onClose, patient, doctorProfile, onUpdated }) => {
  const [newFiles, setNewFiles] = useState<Record<ScanKey, File[]>>({
    meridianScan: [], thermalScan: [], toxicityScan: [], biyokimya: [],
    radyoloji: [], patoloji: [], epikriz: [],
  });
  const [biyokimyaParsedResults, setBiyokimyaParsedResults] = useState<Map<File, LabParseResult & { valid: true }>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setNewFiles({ meridianScan: [], thermalScan: [], toxicityScan: [], biyokimya: [], radyoloji: [], patoloji: [], epikriz: [] });
      setBiyokimyaParsedResults(new Map());
    }
  }, [isOpen]);

  if (!isOpen || !patient) return null;

  const addFile = (key: ScanKey, file: File) => {
    setNewFiles(prev => ({ ...prev, [key]: [...prev[key], file] }));
  };

  const removeFile = (key: ScanKey, idx: number) => {
    setNewFiles(prev => {
      const updated = prev[key].filter((_, i) => i !== idx);
      return { ...prev, [key]: updated };
    });
  };

  const validateBiyokimya = async (file: File): Promise<string | null> => {
    const result = await parseLabReportPdf(file);
    if (!result.valid) return result.error;
    setBiyokimyaParsedResults(prev => new Map(prev).set(file, result));
    return null;
  };

  const getSavedUrls = (key: ScanKey): string[] => {
    const scan = patient.optionalScans?.[key] as any;
    if (!scan) return [];
    return scan.fileUrls?.filter((u: string) => u && u !== 'pending') ||
      (scan.fileUrl && scan.fileUrl !== 'pending' ? [scan.fileUrl] : []);
  };

  const handleSave = async () => {
    const hasAnyNew = SCAN_TYPES.some(s => newFiles[s.key].length > 0);
    if (!hasAnyNew) { toast.info('Yüklenecek yeni dosya seçilmedi.'); return; }

    setSaving(true);
    try {
      const updatedScans: any = { ...(patient.optionalScans || {}) };

      for (const scanType of SCAN_TYPES) {
        const files = newFiles[scanType.key];
        if (files.length === 0) continue;

        const existing = getSavedUrls(scanType.key);
        const newUrls: string[] = [];

        for (const file of files) {
          const storageRef = ref(storage, `scans/${patient.id}/${scanType.storagePrefix}_${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          newUrls.push(url);

          // Biyokimya için lab report kaydet
          if (scanType.key === 'biyokimya') {
            const parsedResult = biyokimyaParsedResults.get(file);
            if (parsedResult) {
              const sanitizedTests = JSON.parse(JSON.stringify(parsedResult.tests));
              await addDoc(collection(db, 'patients', patient.id, 'labReports'), {
                reportDate: parsedResult.reportDate,
                uploadedAt: nowISO(),
                uploadedBy: doctorProfile?.fullName || '',
                fileUrl: url,
                fileName: file.name,
                tests: sanitizedTests,
              });
            }
          }
        }

        const allUrls = [...existing, ...newUrls];
        updatedScans[scanType.key] = {
          ...(updatedScans[scanType.key] || {}),
          enabled: true,
          fileUrl: allUrls[0] || '',
          fileUrls: allUrls,
        };
      }

      await updateDoc(doc(db, 'patients', patient.id), {
        optionalScans: updatedScans,
        updatedAt: nowISO(),
      });

      toast.success('Dosyalar başarıyla yüklendi.');
      onUpdated?.();
      onClose();
    } catch (e) {
      console.error('Dosya yükleme hatası:', e);
      toast.error('Dosya yüklenirken hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const totalNew = SCAN_TYPES.reduce((sum, s) => sum + newFiles[s.key].length, 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                📎 Tarama Dosyaları Yükle
              </h2>
              <p className="text-gray-500 text-sm mt-0.5">{patient.fullName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold p-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          {SCAN_TYPES.map(scanType => {
            const savedUrls = getSavedUrls(scanType.key);
            const pending = newFiles[scanType.key];

            return (
              <div key={scanType.key} className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{scanType.icon}</span>
                  <span className="font-semibold text-gray-800 text-sm">{scanType.label}</span>
                  {savedUrls.length > 0 && (
                    <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      {savedUrls.length} kayıtlı
                    </span>
                  )}
                </div>

                {/* Kayıtlı dosyalar */}
                {savedUrls.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {savedUrls.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg text-xs">
                        <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="flex-1 text-gray-600 truncate">Kayıtlı Dosya {idx + 1}</span>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex-shrink-0">
                          Görüntüle
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Yeni seçilen dosyalar */}
                {pending.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs mb-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1 text-blue-700 truncate">{file.name}</span>
                    <button onClick={() => removeFile(scanType.key, idx)} className="text-red-400 hover:text-red-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Yeni dosya ekle */}
                <FileUpload
                  onFileUpload={(file) => addFile(scanType.key, file)}
                  onFileRemove={() => {}}
                  uploadedFileUrl=""
                  fileName=""
                  {...(scanType.key === 'biyokimya' ? { validateFile: validateBiyokimya } : {})}
                />
                {scanType.key === 'biyokimya' && (
                  <p className="text-xs text-gray-400 mt-1">Yalnızca Ahenk Laboratuvarı biyokimya rapor formatındaki PDF dosyaları kabul edilir.</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 font-medium transition-all">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || totalNew === 0}
            className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Yükleniyor...</>
            ) : (
              <>📤 {totalNew > 0 ? `${totalNew} Dosyayı Yükle` : 'Dosya Seçilmedi'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientScansModal;
