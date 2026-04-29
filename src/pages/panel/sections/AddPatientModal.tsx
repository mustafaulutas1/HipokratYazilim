import React, { useState } from 'react';
import PhoneInput from '../../../components/UI/PhoneInput';
import { toast } from 'react-toastify';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { TURKIYE_CITIES } from '../../../types/TurkiyeCities';

const COUNTRIES = [
  'Türkiye', 'Afganistan', 'Almanya', 'Amerika Birleşik Devletleri', 'Arnavutluk',
  'Avustralya', 'Avusturya', 'Azerbaycan', 'Belçika', 'Bosna Hersek',
  'Bulgaristan', 'Cezayir', 'Çin', 'Danimarka', 'Fas',
  'Finlandiya', 'Fransa', 'Gürcistan', 'Hollanda', 'Irak',
  'İngiltere', 'İran', 'İspanya', 'İsveç', 'İsviçre',
  'İtalya', 'Japonya', 'Kanada', 'Katar', 'Kazakistan',
  'Kıbrıs', 'Kosova', 'Kuveyt', 'Libya', 'Lübnan',
  'Makedonya', 'Mısır', 'Moldova', 'Norveç', 'Özbekistan',
  'Pakistan', 'Polonya', 'Portekiz', 'Romanya', 'Rusya',
  'Suudi Arabistan', 'Sırbistan', 'Suriye', 'Tacikistan', 'Tunus',
  'Türkmenistan', 'Ukrayna', 'Ürdün', 'Yemen', 'Yunanistan', 'Diğer'
];

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientAdded: () => void;
  doctorProfile?: any;
}

const AddPatientModal: React.FC<AddPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientAdded,
  doctorProfile,
}) => {
  const [formData, setFormData] = useState({
    dosyaNo: '',
    fullName: '',
    isForeigner: false,
    tcNo: '',
    passportNo: '',
    nationality: '',
    phone: '',
    email: '',
    birthDate: '',
    gender: '',
    address: '',
    emergencyPhone: '',
    emergencyPhoneOwner: '',
    fatherName: '',
    birthPlace: '',
    registeredProvince: '',
    country: 'Türkiye',
    residenceCity: '',
    visitReason: '',
    education: '',
    profession: '',
    indirim_check: false,
    indirim_tipi: 'yuzde' as 'yuzde' | 'tutar',
    indirim_orani: 20,
    indirim_tutar: 0,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleForeignerToggle = () => {
    setFormData(prev => ({
      ...prev,
      isForeigner: !prev.isForeigner,
      tcNo: '',
      passportNo: '',
      nationality: '',
      country: !prev.isForeigner ? '' : 'Türkiye',
      registeredProvince: '',
      residenceCity: '',
    }));
    setErrors({});
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const target = e.target as HTMLInputElement;
    const { name } = target;
    let newValue = target.type === 'checkbox' ? target.checked : target.value;
    
    // Special handling for TC Kimlik No to ensure only numeric input
    if (name === 'tcNo') {
      // Remove any non-numeric characters
      newValue = newValue.toString().replace(/\D/g, '');
      // Limit to 11 characters
      newValue = newValue.slice(0, 11);
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handlePhoneChange = (fieldName: string, e164Value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: e164Value,
    }));
    if (errors[fieldName]) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.dosyaNo.trim()) {
      newErrors.dosyaNo = 'Hasta dosya numarası gereklidir';
    }

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Ad soyad gereklidir';
    }

    if (formData.isForeigner) {
      if (!formData.passportNo.trim()) {
        newErrors.passportNo = 'Pasaport numarası gereklidir';
      }
      if (!formData.nationality.trim()) {
        newErrors.nationality = 'Uyruk gereklidir';
      }
    } else {
      if (!formData.tcNo.trim()) {
        newErrors.tcNo = 'TC kimlik numarası gereklidir';
      } else if (formData.tcNo.length !== 11) {
        newErrors.tcNo = 'TC kimlik numarası 11 haneli olmalıdır';
      }
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Telefon numarası gereklidir';
    } else if (!/^\+\d{6,15}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Telefon numarası + ile başlamalı ve 6-15 haneli olmalıdır (E.164)';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email adresi gereklidir';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Geçerli bir email adresi giriniz';
    }

    if (!formData.birthDate) {
      newErrors.birthDate = 'Doğum tarihi gereklidir';
    }

    if (!formData.gender) {
      newErrors.gender = 'Cinsiyet seçimi gereklidir';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Adres gereklidir';
    }

    if (!formData.fatherName.trim()) {
      newErrors.fatherName = 'Baba adı gereklidir';
    }

    if (!formData.birthPlace.trim()) {
      newErrors.birthPlace = 'Doğum yeri gereklidir';
    }

    if (!formData.isForeigner && !formData.registeredProvince.trim()) {
      newErrors.registeredProvince = 'Kayıtlı il gereklidir';
    }

    if (!formData.country.trim()) {
      newErrors.country = 'Ülke gereklidir';
    }

    if (!formData.residenceCity.trim()) {
      newErrors.residenceCity = 'İkamet ili/şehri gereklidir';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Lütfen eksik alanları doldurun.');
      return;
    }

    setLoading(true);
    try {
      // Email format normalization
      const emailToCheck = formData.email.trim().toLowerCase();

      // Dosya No uniqueness check within the clinic
      const clinicId = doctorProfile?.clinicId || 'default-clinic';
      const dosyaSnap = await getDocs(query(collection(db, 'patients'), where('dosyaNo', '==', formData.dosyaNo.trim()), where('clinicId', '==', clinicId)));
      if (!dosyaSnap.empty) {
        setErrors((prev) => ({ ...prev, dosyaNo: 'Bu dosya numarası ile kayıt zaten mevcut' }));
        toast.error('Bu dosya numarası ile kayıt zaten mevcut');
        setLoading(false);
        return;
      }

      // TC No uniqueness check (only for Turkish citizens)
      if (!formData.isForeigner) {
        const tcSnap = await getDocs(query(collection(db, 'patients'), where('tcNo', '==', formData.tcNo)));
        if (!tcSnap.empty) {
          setErrors((prev) => ({ ...prev, tcNo: 'Bu TC Kimlik No ile kayıt zaten mevcut' }));
          toast.error('Bu TC Kimlik No ile kayıt zaten mevcut');
          setLoading(false);
          return;
        }
      }

      const patientData = {
        ...formData,
        email: emailToCheck,
        clinicId: doctorProfile?.clinicId || 'default-clinic',
        isAnamnezCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add patient to database
      await addDoc(collection(db, 'patients'), patientData);

      toast.success('Hasta başarıyla oluşturuldu!');

      // Reset form
      setFormData({
        dosyaNo: '',
        fullName: '',
        isForeigner: false,
        tcNo: '',
        passportNo: '',
        nationality: '',
        phone: '',
        email: '',
        birthDate: '',
        gender: '',
        address: '',
        emergencyPhone: '',
        emergencyPhoneOwner: '',
        fatherName: '',
        birthPlace: '',
        registeredProvince: '',
        country: 'Türkiye',
        residenceCity: '',
        visitReason: '',
        education: '',
        profession: '',
        indirim_check: false,
        indirim_tipi: 'yuzde' as 'yuzde' | 'tutar',
        indirim_orani: 20,
        indirim_tutar: 0,
      });

      setErrors({});
      onPatientAdded();
      onClose();
    } catch (error) {
      console.error('Error adding patient:', error);
      toast.error('Hasta eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">
              Yeni Hasta Ekle
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 bg-white">
          {/* Yabancı Uyruklu Toggle */}
          <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <button
              type="button"
              onClick={handleForeignerToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                formData.isForeigner ? 'bg-orange-500' : 'bg-gray-300'
              }`}
              aria-pressed={formData.isForeigner}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                  formData.isForeigner ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <div>
              <span className="font-semibold text-gray-800 text-sm">TC vatandaşı değil (Yabancı Uyruklu)</span>
              <p className="text-xs text-gray-500 mt-0.5">Aktif edildiğinde TC Kimlik No yerine Pasaport No ve Uyruk bilgisi alınır.</p>
            </div>
          </div>

          {/* Hasta Dosya Numarası - Full Width */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Hasta Dosya Numarası *
            </label>
            <input
              type="text"
              name="dosyaNo"
              value={formData.dosyaNo}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                errors.dosyaNo ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Hasta dosya numarası"
            />
            {errors.dosyaNo && (
              <p className="text-red-500 text-sm mt-1">{errors.dosyaNo}</p>
            )}
          </div>

          {/* Personal Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Ad Soyad *
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.fullName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Ad Soyad"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>
              )}
            </div>

            {formData.isForeigner ? (
              <>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Pasaport No *
                  </label>
                  <input
                    type="text"
                    name="passportNo"
                    value={formData.passportNo}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                      errors.passportNo ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Pasaport numarası"
                  />
                  {errors.passportNo && (
                    <p className="text-red-500 text-sm mt-1">{errors.passportNo}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Uyruk *
                  </label>
                  <input
                    type="text"
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                      errors.nationality ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Örn: Alman, Rus, İngiliz..."
                  />
                  {errors.nationality && (
                    <p className="text-red-500 text-sm mt-1">{errors.nationality}</p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  TC Kimlik No *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  name="tcNo"
                  value={formData.tcNo}
                  onChange={handleInputChange}
                  maxLength={11}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.tcNo ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="11 haneli TC kimlik numarası"
                  onKeyPress={(e) => {
                    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Tab') {
                      e.preventDefault();
                    }
                  }}
                />
                {errors.tcNo && (
                  <p className="text-red-500 text-sm mt-1">{errors.tcNo}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Telefon *
              </label>
              <PhoneInput
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                defaultCountryCode="TR"
                hasError={!!errors.phone}
                placeholder="5XX XXX XX XX"
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="ornek@email.com"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="birthDate"
                className="block text-gray-700 text-sm font-medium mb-2"
              >
                Doğum Tarihi *
              </label>
              <input
                type="date"
                name="birthDate"
                id="birthDate"
                value={formData.birthDate}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.birthDate ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.birthDate && (
                <p className="text-red-500 text-sm mt-1">{errors.birthDate}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="gender"
                className="block text-gray-700 text-sm font-medium mb-2"
              >
                Cinsiyet *
              </label>
              <select
                name="gender"
                id="gender"
                value={formData.gender}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.gender ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Cinsiyet seçiniz</option>
                <option value="Erkek">Erkek</option>
                <option value="Kadın">Kadın</option>
              </select>
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">{errors.gender}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Acil Telefon
              </label>
              <PhoneInput
                name="emergencyPhone"
                value={formData.emergencyPhone}
                onChange={handlePhoneChange}
                defaultCountryCode="TR"
                placeholder="5XX XXX XX XX"
              />
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Acil Telefon Sahibi
              </label>
              <input
                type="text"
                name="emergencyPhoneOwner"
                value={formData.emergencyPhoneOwner}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Acil telefon sahibi"
              />
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Baba Adı *
              </label>
              <input
                type="text"
                name="fatherName"
                value={formData.fatherName}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.fatherName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Baba adı"
              />
              {errors.fatherName && (
                <p className="text-red-500 text-sm mt-1">{errors.fatherName}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Doğum Yeri *
              </label>
              <input
                type="text"
                name="birthPlace"
                value={formData.birthPlace}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.birthPlace ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Doğum yeri"
              />
              {errors.birthPlace && (
                <p className="text-red-500 text-sm mt-1">{errors.birthPlace}</p>
              )}
            </div>

            {!formData.isForeigner && (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Kayıtlı İl *
                </label>
                <input
                  type="text"
                  name="registeredProvince"
                  value={formData.registeredProvince}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.registeredProvince
                      ? 'border-red-500'
                      : 'border-gray-300'
                  }`}
                  placeholder="Kayıtlı il"
                />
                {errors.registeredProvince && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.registeredProvince}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Ülke *
              </label>
              <select
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.country ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Ülke seçiniz</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.country && (
                <p className="text-red-500 text-sm mt-1">{errors.country}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                {formData.isForeigner ? 'İkamet Şehri / Bölgesi *' : 'İkamet İli *'}
              </label>
              {formData.isForeigner ? (
                <input
                  type="text"
                  name="residenceCity"
                  value={formData.residenceCity}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.residenceCity ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="İkamet ettiği şehir veya bölge"
                />
              ) : (
                <select
                  name="residenceCity"
                  value={formData.residenceCity}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.residenceCity ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">İkamet ili seçiniz</option>
                  {TURKIYE_CITIES.map((city) => (
                    <option key={city.id} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.residenceCity && (
                <p className="text-red-500 text-sm mt-1">{errors.residenceCity}</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Adres *
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              rows={3}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                errors.address ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Tam adres bilgisi"
            />
            {errors.address && (
              <p className="text-red-500 text-sm mt-1">{errors.address}</p>
            )}
          </div>

          {/* Education & Profession */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Eğitim Durumu
              </label>
              <select
                name="education"
                value={formData.education}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Seçiniz (opsiyonel)</option>
                <option value="İlkokul">İlkokul</option>
                <option value="Ortaokul">Ortaokul</option>
                <option value="Lise">Lise</option>
                <option value="Ön Lisans">Ön Lisans</option>
                <option value="Lisans">Lisans</option>
                <option value="Yüksek Lisans">Yüksek Lisans</option>
                <option value="Doktora">Doktora</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Mesleği
              </label>
              <input
                type="text"
                name="profession"
                value={formData.profession}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Mesleğinizi yazınız (opsiyonel)"
              />
            </div>
          </div>

          {/* Visit Reason */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Ziyaret Nedeni
            </label>
            <textarea
              name="visitReason"
              value={formData.visitReason}
              onChange={handleInputChange}
              rows={2}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Ziyaret nedeni (opsiyonel)"
            />
          </div>

          {/* Discount Option */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-4">
            <div className="flex items-start gap-3">
              <input
                id="indirim_check"
                name="indirim_check"
                type="checkbox"
                checked={formData.indirim_check}
                onChange={handleInputChange}
                className="mt-1 h-5 w-5 rounded border-green-300 text-green-600 focus:ring-green-500"
                aria-label="Her zaman indirim uygula"
              />
              <label htmlFor="indirim_check" className="text-sm text-green-900">
                <span className="font-semibold">
                  Her zaman indirim uygula
                </span>
                <span className="block text-green-800/80">
                  Bu seçenek aktifken hastanın işlemlerinde otomatik olarak belirlenen oranda
                  indirim işaretlenecektir.
                </span>
              </label>
            </div>

            {formData.indirim_check && (
              <div className="ml-8 space-y-4">
                {/* Discount Type Toggle */}
                <div>
                  <label className="block text-sm font-medium text-green-800 mb-2">
                    İndirim Türü
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, indirim_tipi: 'yuzde' }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        formData.indirim_tipi === 'yuzde'
                          ? 'bg-green-500 text-white'
                          : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      % Yüzde
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, indirim_tipi: 'tutar' }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        formData.indirim_tipi === 'tutar'
                          ? 'bg-green-500 text-white'
                          : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      ₺ Tutar
                    </button>
                  </div>
                </div>

                {/* Percentage Input */}
                {formData.indirim_tipi === 'yuzde' && (
                  <div>
                    <label className="block text-sm font-medium text-green-800 mb-2">
                      İndirim Oranı (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="indirim_orani"
                        value={formData.indirim_orani}
                        onChange={handleInputChange}
                        min="0"
                        max="100"
                        className="w-32 px-3 py-2 bg-white border border-green-300 rounded-lg text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="20"
                      />
                      <span className="text-sm text-green-700">%</span>
                    </div>
                  </div>
                )}

                {/* Fixed Amount Input */}
                {formData.indirim_tipi === 'tutar' && (
                  <div>
                    <label className="block text-sm font-medium text-green-800 mb-2">
                      İndirim Tutarı (TL)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="indirim_tutar"
                        value={formData.indirim_tutar}
                        onChange={handleInputChange}
                        min="0"
                        step="0.01"
                        className="w-32 px-3 py-2 bg-white border border-green-300 rounded-lg text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="100"
                      />
                      <span className="text-sm text-green-700">TL</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-gray-700 font-semibold transition-all duration-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              {loading ? 'Ekleniyor...' : 'Hasta Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPatientModal;
