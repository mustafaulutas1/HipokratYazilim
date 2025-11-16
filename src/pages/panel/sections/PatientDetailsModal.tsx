import React, { useState } from 'react';

interface TreatmentOptions {
  protocol?: string;
  notes?: string;
  protocolId?: string;
  protocolName?: string;
  isCustomized?: boolean;
  originalProtocolId?: string;
  selectedProtocol?: any;
  customizedProtocol?: any;
  selectedMainApplications?: string[];
}

interface Patient {
  id: string;
  fullName: string;
  tcNo: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  emergencyPhone: string;
  fatherName: string;
  birthPlace: string;
  registeredProvince: string;
  registrationDate?: string;
  country?: string;
  residenceCity?: string;
  visitReason: string;
  createdAt: string;
  updatedAt: string;
  treatmentOptions?: TreatmentOptions;
  treatmentStartedAt?: string;
  status?: string;
}

interface PatientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
}

const PatientDetailsModal: React.FC<PatientDetailsModalProps> = ({ isOpen, onClose, patient }) => {
  const [activeTab, setActiveTab] = useState('personal');

  if (!isOpen || !patient) return null;

  // Calculate age from birth date
  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const tabs = [
    { id: 'personal', label: 'Kişisel Bilgi', icon: '👤' },
    { id: 'contact', label: 'İletişim', icon: '📞' },
    { id: 'medical', label: 'Tıbbi Bilgi', icon: '🏥' },
    { id: 'treatment', label: 'Tedavi Bilgileri', icon: '💊' },
    { id: 'address', label: 'Adres', icon: '📍' },
    { id: 'notes', label: 'Notlar', icon: '📝' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
             <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white text-2xl font-bold">
                  {patient.fullName.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-800">{patient.fullName}</h2>
                <p className="text-gray-600">Hasta No: {patient.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-2xl font-bold p-2 hover:bg-gray-100 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200">
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Cinsiyet:</span>
                <span className="font-semibold text-gray-800">{patient.gender}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Yaş:</span>
                <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">TC No:</span>
                <span className="font-semibold text-gray-800">{patient.tcNo}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Doğum Tarihi:</span>
                <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Ülke:</span>
                <span className="font-semibold text-gray-800">
                  {patient.country || 'Türkiye'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">İkamet İli:</span>
                <span className="font-semibold text-gray-800">
                  {patient.residenceCity || '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Durum:</span>
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  Kayıtlı
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

                 {/* Content */}
         <div className="flex-1 overflow-y-auto min-h-0">
           <div className="p-6">
            {/* Personal Information Tab */}
            {activeTab === 'personal' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👤 Temel Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ad Soyad:</span>
                        <span className="font-semibold text-gray-800">{patient.fullName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">TC Kimlik No:</span>
                        <span className="font-semibold text-gray-800">{patient.tcNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      👨‍👩‍👧‍👦 Aile Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Baba Adı:</span>
                        <span className="font-semibold text-gray-800">{patient.fatherName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Yeri:</span>
                        <span className="font-semibold text-gray-800">{patient.birthPlace}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıtlı İl:</span>
                        <span className="font-semibold text-gray-800">{patient.registeredProvince}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 İkamet Bilgileri
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ülke:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.country || 'Türkiye'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">İkamet İli:</span>
                      <span className="font-semibold text-gray-800">
                        {patient.residenceCity || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Son Güncelleme:</span>
                      <span className="font-semibold text-gray-800">{formatDate(patient.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Information Tab */}
            {activeTab === 'contact' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📞 İletişim Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Telefon</label>
                      <p className="font-semibold text-gray-800">{patient.phone}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Email</label>
                      <p className="font-semibold text-gray-800">{patient.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Acil Telefon</label>
                      <p className="font-semibold text-gray-800">
                        {patient.emergencyPhone || 'Belirtilmemiş'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Medical Information Tab */}
            {activeTab === 'medical' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      🏥 Tıbbi Bilgiler
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yaş:</span>
                        <span className="font-semibold text-gray-800">{calculateAge(patient.birthDate)} yaş</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cinsiyet:</span>
                        <span className="font-semibold text-gray-800">{patient.gender}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Doğum Tarihi:</span>
                        <span className="font-semibold text-gray-800">{formatDate(patient.birthDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      📋 Ziyaret Bilgileri
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                        <p className="font-semibold text-gray-800">
                          {patient.visitReason || 'Belirtilmemiş'}
                        </p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kayıt Tarihi:</span>
                        <span className="font-semibold text-gray-800">
                          {formatDate(patient.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Treatment Information Tab */}
            {activeTab === 'treatment' && (
              <div className="space-y-6">
                {patient.treatmentOptions ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        💊 Tedavi Protokolü
                      </h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-gray-600">Protokol Adı</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.protocolName || 'Belirtilmemiş'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">Protokol Tipi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.treatmentOptions.isCustomized ? (
                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                                  🎨 Özelleştirilmiş
                                </span>
                              ) : (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  📋 Standart
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {patient.treatmentStartedAt && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Başlangıç Tarihi</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {formatDate(patient.treatmentStartedAt)}
                            </p>
                          </div>
                        )}

                        {patient.status && (
                          <div>
                            <label className="text-sm text-gray-600">Tedavi Durumu</label>
                            <p className="font-semibold text-gray-800 mt-1">
                              {patient.status === 'treatment_decided' && (
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                  📋 Tedavi Belirlendi
                                </span>
                              )}
                              {patient.status === 'in_treatment' && (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  🏥 Tedavide
                                </span>
                              )}
                              {patient.status === 'treatment_completed' && (
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                  ✅ Tamamlandı
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected Protocol Details */}
                    {patient.treatmentOptions.selectedProtocol && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📊 Protokol Detayları
                        </h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm text-gray-600">Tanı Sistemi</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.diagnosisSystem || 'Belirtilmemiş'}
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-gray-600">Yaş Grubu</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.ageGroup || 'Belirtilmemiş'}
                              </p>
                            </div>
                          </div>

                          {patient.treatmentOptions.selectedProtocol.frequency && (
                            <div>
                              <label className="text-sm text-gray-600">Tedavi Sıklığı</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.frequency}
                              </p>
                            </div>
                          )}

                          {patient.treatmentOptions.selectedProtocol.control && (
                            <div>
                              <label className="text-sm text-gray-600">Kontrol</label>
                              <p className="font-semibold text-gray-800 mt-1">
                                {patient.treatmentOptions.selectedProtocol.control}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Treatment Sequence */}
                    {patient.treatmentOptions.selectedProtocol?.treatmentSequence && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          🔄 Tedavi Sırası
                        </h3>
                        <div className="space-y-3">
                          {patient.treatmentOptions.selectedProtocol.treatmentSequence.map((item: any, index: number) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {item.order}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                                    {item.phase}
                                  </span>
                                </div>
                                <p className="font-semibold text-gray-800">{item.treatment}</p>
                                {item.dosage && (
                                  <p className="text-sm text-gray-600 mt-1">Doz: {item.dosage}</p>
                                )}
                                {item.description && (
                                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Main Applications */}
                    {patient.treatmentOptions.selectedMainApplications && patient.treatmentOptions.selectedMainApplications.length > 0 && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          ✅ Seçilen Ana Uygulamalar
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {patient.treatmentOptions.selectedMainApplications.map((app, index) => (
                            <span 
                              key={index}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Treatment Notes */}
                    {patient.treatmentOptions.notes && (
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          📝 Tedavi Notları
                        </h3>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {patient.treatmentOptions.notes}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">💊</div>
                    <h3 className="text-gray-900 text-xl font-semibold mb-2">Henüz Tedavi Başlatılmamış</h3>
                    <p className="text-gray-600">
                      Bu hasta için henüz bir tedavi protokolü belirlenmemiş.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Address Information Tab */}
            {activeTab === 'address' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📍 Adres Bilgileri
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Tam Adres</label>
                      <p className="font-semibold text-gray-800 mt-1">{patient.address}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">Kayıtlı İl</label>
                        <p className="font-semibold text-gray-800">{patient.registeredProvince}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Doğum Yeri</label>
                        <p className="font-semibold text-gray-800">{patient.birthPlace}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

             {/* Notes Tab */}
             {activeTab === 'notes' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📝 Hasta Notları
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Ziyaret Nedeni</label>
                      <p className="font-semibold text-gray-800 mt-1">
                        {patient.visitReason || 'Not eklenmemiş'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Genel Notlar</label>
                      <textarea
                        className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        rows={4}
                        placeholder="Hasta hakkında notlar ekleyin..."
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📋 Not Geçmişi
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <p className="text-sm text-gray-800">Hasta kaydı oluşturuldu</p>
                        <span className="text-xs text-gray-500">{formatDate(patient.createdAt)}</span>
                      </div>
                    </div>
                    {patient.updatedAt !== patient.createdAt && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <p className="text-sm text-gray-800">Hasta bilgileri güncellendi</p>
                          <span className="text-xs text-gray-500">{formatDate(patient.updatedAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Son güncelleme: {formatDate(patient.updatedAt)}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-700 font-medium transition-all duration-200"
              >
                Kapat
              </button>
              <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-all duration-200">
                Yazdır
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDetailsModal;
