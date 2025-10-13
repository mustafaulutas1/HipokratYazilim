import React, { useEffect, useState } from "react";
import PhoneInput from "../components/UI/PhoneInput";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";

import { useAuth } from "../context/AuthContext";

interface DoctorProfile {
  fullName: string;
  tcNo: string;
  licenseNumber: string;
  specialization: string;
  phone: string;
  address: string;
  hospital: string;
  department: string;
  experience: string;
  education: string;
  email: string;
}

export default function DoctorRegisterPage() {
  const { user, loading, logout } = useAuth();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    console.log("🔄 DoctorRegisterPage useEffect çalıştı", { loading, user: user?.uid });

    if (!loading && user) {
      const fetchProfile = async () => {
        console.log("📥 Doktor profili çekme işlemi başladı", { userId: user.uid });
        try {
          const ref = doc(db, "doctors", user.uid);
          console.log("🔍 Firestore referansı oluşturuldu:", ref.path);

          const snap = await getDoc(ref);
          console.log("📄 Firestore sorgusu tamamlandı", { exists: snap.exists() });

          if (snap.exists()) {
            const data = snap.data() as DoctorProfile;
            setProfile(data);
            console.log("✅ Doktor profili başarıyla yüklendi:", data);
          } else {
            console.log("⚠️ Doktor profili bulunamadı, yeni profil oluşturuluyor...");
            const newProfile: DoctorProfile = {
              fullName: '',
              tcNo: '',
              licenseNumber: '',
              specialization: '',
              phone: '',
              address: '',
              hospital: '',
              department: '',
              experience: '',
              education: '',
              email: user.email || '',
            };

            await setDoc(ref, newProfile);
            setProfile(newProfile);
            console.log("✅ Yeni doktor profili oluşturuldu ve kaydedildi");
          }
        } catch (err) {
          console.error("❌ Doktor profili çekme hatası:", err);
          setFetchError(`Doktor profili çekilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        }
        setProfileLoading(false);
        console.log("🏁 Doktor profili yükleme işlemi tamamlandı");
      };
      fetchProfile();
    } else if (!loading && !user) {
      console.log("🚫 Kullanıcı giriş yapmamış, login sayfasına yönlendiriliyor");
      navigate("/login");
    }
  }, [user, loading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    console.log("📝 Input değişikliği:", { name: e.target.name, value: e.target.value });

    if (!profile) return;

    let value = e.target.value;
    const name = e.target.name;

    // Özel formatlamalar
    if (name === 'fullName') {
      value = value.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    } else if (name === 'tcNo') {
      value = value.replace(/\D/g, '').slice(0, 11);
    } else if (name === 'licenseNumber') {
      value = value.replace(/\D/g, '').slice(0, 10);
    }

    setProfile({ ...profile, [name]: value });
  };

  const handlePhoneChange = (fieldName: string, e164Value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [fieldName]: e164Value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("💾 Doktor kaydetme işlemi başladı");
    console.log("📊 Mevcut doktor profili verisi:", profile);
    console.log("👤 Kullanıcı bilgisi:", { uid: user?.uid, email: user?.email });

    setSaving(true);
    setError("");

    try {
      if (user && profile) {
        console.log("🔄 Firestore güncelleme başladı", { userId: user.uid });
        const ref = doc(db, "doctors", user.uid);

        const updateData = {
          ...profile,
          updatedAt: new Date().toISOString()
        };

        console.log("📤 Gönderilecek veri:", updateData);
        await updateDoc(ref, updateData);
        console.log("✅ Doktor profili başarıyla güncellendi");

        alert("Doktor profili başarıyla güncellendi!");
        //toast a çevir.

        // 1 saniye sonra ana sayfaya yönlendir
        setTimeout(() => {
          navigate("/");
        }, 1000);
      } else {
        console.log("❌ Kullanıcı veya doktor profili verisi eksik", { user: !!user, profile: !!profile });
        throw new Error("Kullanıcı veya doktor profili verisi eksik");
      }
    } catch (err) {
      console.error("❌ Kaydetme hatası:", err);
      setError(`Kaydetme sırasında bir hata oluştu: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
    }
    setSaving(false);
    console.log("🏁 Kaydetme işlemi tamamlandı");
  };

  const handleLogout = async () => {
    try {
      console.log("🚪 DoctorRegisterPage logout başladı");
      console.log("👤 Mevcut kullanıcı:", user?.email);
      
      await logout();
      console.log("✅ Logout başarılı, ana sayfaya yönlendiriliyor");
      
      navigate("/");
    } catch (error) {
      console.error("❌ Logout hatası:", error);
      // Even if logout fails, try to navigate to home
      navigate("/");
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <div className="text-lg font-semibold text-gray-600">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <div className="text-lg font-semibold text-red-500">{fetchError}</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <div className="text-lg font-semibold text-red-500">Doktor profili bulunamadı. Otomatik çıkış yapılıyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Enhanced Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute top-40 right-20 w-32 h-32 bg-gradient-to-br from-cyan-400/30 to-blue-400/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/4 w-36 h-36 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
        <div className="absolute bottom-40 right-1/3 w-28 h-28 bg-gradient-to-br from-green-400/30 to-cyan-400/30 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob animation-delay-6000"></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-5">
          <div className="h-full w-full bg-grid-pattern"></div>
        </div>
      </div>

      {/* Ana Container */}
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Enhanced Header */}
        <div className="relative mb-12">
          {/* Çıkış butonu - Sağ üst köşe */}
          <div className="absolute top-0 right-0 z-50">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("🔴 Çıkış butonu tıklandı!");
                handleLogout();
              }}
              className="inline-flex cursor-pointer items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm bg-red-700 hover:bg-red-800 border border-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-600 active:scale-95"
              style={{ pointerEvents: 'auto' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Çıkış Yap
            </button>
          </div>

          {/* Merkezi içerik */}
          <div className="text-center pt-8">
            <div className="relative inline-block mb-8">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 relative drop-shadow-lg">
                Doktor <span className="text-gradient bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Kaydı</span>
              </h1>

              {/* Welcome Badge - Başlığın tam altında */}
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg transform hover:scale-105 transition-all duration-300">
                <span>👨‍⚕️</span>
                <span>Doktor Kayıt Formu</span>
              </div>

              {/* Decorative elements around title */}
              <div className="absolute -top-3 -left-3 w-2 h-2 bg-blue-400 rounded-full animate-pulse opacity-60"></div>
              <div className="absolute -top-1 -right-4 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping opacity-50"></div>
              <div className="absolute -bottom-3 left-1/4 w-1 h-1 bg-purple-400 rounded-full animate-bounce opacity-70"></div>
            </div>

            <p className="text-lg text-white/90 font-medium leading-relaxed max-w-xl mx-auto drop-shadow-sm">
              Doktor bilgilerinizi girerek sisteme kayıt olun ve
              <br className="hidden sm:block" />
              hasta hizmetlerinizi yönetmeye başlayın.
            </p>
          </div>
        </div>

        {/* Premium Form Container */}
        <div className="bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl rounded-[2rem] overflow-hidden relative">
          {/* Enhanced Form background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 transform rotate-12 scale-150"></div>
            <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-to-tl from-cyan-100 to-blue-100 transform -rotate-12 scale-150"></div>
          </div>

          {/* Form Header */}
          <div className="relative z-10 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-xl">👨‍⚕️</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Doktor Bilgileri</h2>
                  <p className="text-gray-600 text-sm">Lisans ve uzmanlık bilgilerinizi girin</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Güvenli Form
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-8 md:p-12 relative z-10 font-inter">
            {/* Kişisel Bilgiler Bölümü */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">👤</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Kişisel Bilgiler
                </h2>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-blue-200 via-purple-200 to-transparent mb-8"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Ad Soyad *</label>
                  <input
                    name="fullName"
                    value={profile.fullName || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    placeholder="Adınızı ve soyadınızı giriniz"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">TC Kimlik No *</label>
                  <input
                    name="tcNo"
                    value={profile.tcNo || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    maxLength={11}
                    placeholder="11 haneli TC kimlik numaranız"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Doktor Lisans No *</label>
                  <input
                    name="licenseNumber"
                    value={profile.licenseNumber || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    maxLength={10}
                    placeholder="Doktor lisans numaranız"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Telefon *</label>
                  <PhoneInput
                    name="phone"
                    value={profile.phone || ''}
                    onChange={handlePhoneChange}
                    defaultCountryCode="TR"
                    placeholder="5XX XXX XX XX"
                  />
                </div>
              </div>
            </div>

            {/* Uzmanlık Bilgileri Bölümü */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">🏥</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Uzmanlık Bilgileri
                </h2>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-green-200 via-emerald-200 to-transparent mb-8"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Uzmanlık Alanı *</label>
                  <select
                    name="specialization"
                    value={profile.specialization || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                  >
                    <option value="">Seçiniz</option>
                    <option value="Kardiyoloji">Kardiyoloji</option>
                    <option value="Nöroloji">Nöroloji</option>
                    <option value="Ortopedi">Ortopedi</option>
                    <option value="Dahiliye">Dahiliye</option>
                    <option value="Cerrahi">Cerrahi</option>
                    <option value="Pediatri">Pediatri</option>
                    <option value="Kadın Hastalıkları">Kadın Hastalıkları</option>
                    <option value="Göz Hastalıkları">Göz Hastalıkları</option>
                    <option value="Kulak Burun Boğaz">Kulak Burun Boğaz</option>
                    <option value="Dermatoloji">Dermatoloji</option>
                    <option value="Psikiyatri">Psikiyatri</option>
                    <option value="Üroloji">Üroloji</option>
                    <option value="Gastroenteroloji">Gastroenteroloji</option>
                    <option value="Endokrinoloji">Endokrinoloji</option>
                    <option value="Göğüs Hastalıkları">Göğüs Hastalıkları</option>
                    <option value="Acil Tıp">Acil Tıp</option>
                    <option value="Radyoloji">Radyoloji</option>
                    <option value="Patoloji">Patoloji</option>
                    <option value="Anestezi">Anestezi</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Deneyim (Yıl) *</label>
                  <select
                    name="experience"
                    value={profile.experience || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                  >
                    <option value="">Seçiniz</option>
                    <option value="0-2">0-2 yıl</option>
                    <option value="3-5">3-5 yıl</option>
                    <option value="6-10">6-10 yıl</option>
                    <option value="11-15">11-15 yıl</option>
                    <option value="16-20">16-20 yıl</option>
                    <option value="20+">20+ yıl</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Hastane *</label>
                  <input
                    name="hospital"
                    value={profile.hospital || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    placeholder="Çalıştığınız hastane"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Bölüm *</label>
                  <input
                    name="department"
                    value={profile.department || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    placeholder="Çalıştığınız bölüm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Eğitim Bilgileri *</label>
                  <textarea
                    name="education"
                    value={profile.education || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    rows={3}
                    placeholder="Tıp fakültesi, uzmanlık, sertifikalar vb."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">Adres *</label>
                  <input
                    name="address"
                    value={profile.address || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    placeholder="Tam adresinizi giriniz"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-700 font-semibold mb-2 text-sm font-inter">E-posta *</label>
                  <input
                    name="email"
                    value={profile.email || ''}
                    onChange={handleChange}
                    type="email"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-base bg-white/90 backdrop-blur-sm transition-all duration-200 font-inter hover:shadow-md"
                    required
                    placeholder="ornek@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Hata mesajı */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center">
                  <div className="text-red-500 text-xl mr-3">⚠️</div>
                  <div className="text-red-700 font-medium">{error}</div>
                </div>
              </div>
            )}

            {/* Enhanced Save Button */}
            <div className="pt-8 border-t border-gray-200/50">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                  Tüm bilgiler güvenli şekilde saklanır
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-w-[200px] py-4 px-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden"
                  disabled={saving}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  {saving ? (
                    <div className="flex items-center justify-center relative z-10">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Kaydediliyor...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 relative z-10">
                      <span>💾</span>
                      Doktor Kaydını Tamamla
                    </div>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 