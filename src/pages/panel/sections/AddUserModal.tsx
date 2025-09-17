import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import type { Role } from '../../../types/Role';
import PhoneInput from '../../../components/UI/PhoneInput';
import { toast } from 'react-toastify';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: () => void;
  doctorProfile?: any;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded, doctorProfile }) => {
  const { registerClinicUser } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'doctor',
    phone: '',
    clinicId: doctorProfile?.clinicId || 'default-clinic'
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch available roles
  const fetchRoles = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      // First get default roles
      const defaultRolesRef = collection(db, 'roles');
      const defaultQuery = query(defaultRolesRef, where('clinicId', '==', 'default'));
      const defaultSnapshot = await getDocs(defaultQuery);
      
      // Then get clinic-specific roles
      const clinicRolesRef = collection(db, 'roles');
      const clinicQuery = query(clinicRolesRef, where('clinicId', '==', doctorProfile.clinicId));
      const clinicSnapshot = await getDocs(clinicQuery);
      
      const rolesData: Role[] = [];
      
      // Add default roles
      defaultSnapshot.forEach((doc) => {
        rolesData.push({
          id: doc.id,
          ...doc.data()
        } as Role);
      });
      
      // Add clinic-specific roles
      clinicSnapshot.forEach((doc) => {
        rolesData.push({
          id: doc.id,
          ...doc.data()
        } as Role);
      });
      
      // Sort: default roles first, then by display name
      rolesData.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
      
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
      // Fallback to basic roles if fetch fails
      const fallbackRoles: Role[] = [
        {
          id: 'fallback-doctor',
          name: 'doctor',
          displayName: 'Doktor',
          description: 'Tıbbi muayene ve tedavi',
          permissions: ['dashboard', 'patients', 'appointments', 'treatment-protocols'],
          isDefault: true,
          clinicId: 'default',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'fallback-nurse',
          name: 'nurse',
          displayName: 'Hemşire',
          description: 'Hasta bakımı ve destek',
          permissions: ['dashboard', 'patients', 'appointments'],
          isDefault: true,
          clinicId: 'default',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'fallback-desk',
          name: 'desk',
          displayName: 'Resepsiyon',
          description: 'Hasta karşılama ve randevu yönetimi',
          permissions: ['dashboard', 'patients', 'appointments'],
          isDefault: true,
          clinicId: 'default',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      setRoles(fallbackRoles);
    }
  };

  // Update clinicId when doctorProfile changes and fetch roles
  useEffect(() => {
    if (doctorProfile?.clinicId) {
      setFormData(prev => ({
        ...prev,
        clinicId: doctorProfile.clinicId
      }));
      fetchRoles();
    }
  }, [doctorProfile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Ad soyad gereklidir';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email adresi gereklidir';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Geçerli bir email adresi giriniz';
    }

    if (!formData.password) {
      newErrors.password = 'Şifre gereklidir';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Şifre en az 6 karakter olmalıdır';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Telefon numarası gereklidir';
    } else if (!/^\+\d{6,15}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Telefon numarası + ile başlamalı ve 6-15 haneli olmalıdır (E.164)';
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
      // Uniqueness check via auth helper already exists in registerClinicUser,
      // but we also guard against duplicates in Firestore collections for safety
      const emailToCheck = formData.email.trim().toLowerCase();
      const { collection, getDocs, query, where } = await import('firebase/firestore');
      const { db } = await import('../../../firebase/config');
      const [patientsSnap, clinicUsersSnap, doctorsSnap] = await Promise.all([
        getDocs(query(collection(db, 'patients'), where('email', '==', emailToCheck))),
        getDocs(query(collection(db, 'clinicUsers'), where('email', '==', emailToCheck))),
        getDocs(query(collection(db, 'doctors'), where('email', '==', emailToCheck)))
      ]);

      if (!patientsSnap.empty || !clinicUsersSnap.empty || !doctorsSnap.empty) {
        setErrors((prev) => ({ ...prev, email: 'Bu email ile kayıt zaten mevcut' }));
        toast.error('Bu email ile kayıt zaten mevcut');
        setLoading(false);
        return;
      }

      // Create Firebase Auth user and Firestore document
      await registerClinicUser({ ...formData, email: emailToCheck });
      
      // Reset form
      setFormData({
        fullName: '',
        email: '',
        password: '',
        role: 'doctor',
        phone: '',
        clinicId: doctorProfile?.clinicId || 'default-clinic'
      });
      
      setErrors({});
      onUserAdded();
      onClose();
      
      alert('Kullanıcı başarıyla eklendi! Kullanıcı artık doktor girişi ile sisteme giriş yapabilir.');
    } catch (error: any) {
      console.error('Error adding user:', error);
      const errorMessage = error?.message || 'Kullanıcı eklenirken bir hata oluştu. Lütfen tekrar deneyin.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (fieldName: string, e164Value: string) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: e164Value
    }));
    if (errors[fieldName]) {
      setErrors(prev => ({
        ...prev,
        [fieldName]: ''
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">Yeni Kullanıcı Ekle</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 bg-white">
          {/* Basic Information */}
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
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Şifre *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="En az 6 karakter"
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password}</p>
              )}
            </div>

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
                Rol *
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Rol Seçin</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.displayName}
                    {role.isDefault && ' (Varsayılan)'}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p className="text-red-500 text-sm mt-1">{errors.role}</p>
              )}
            </div>
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
              {loading ? 'Ekleniyor...' : 'Kullanıcı Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;