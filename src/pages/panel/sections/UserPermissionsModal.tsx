import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { AVAILABLE_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, getUserPermissions } from '../../../constants/permissions';

interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'doctor' | 'nurse' | 'assistant';
  specialization?: string;
  department?: string;
  phone: string;
  isActive: boolean;
  clinicId: string;
  permissions?: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionsUpdated: () => void;
  user: User | null;
}

const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({ 
  isOpen, 
  onClose, 
  onPermissionsUpdated, 
  user 
}) => {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);

  useEffect(() => {
    if (user) {
      const currentPermissions = getUserPermissions(user.role, user.permissions);
      setSelectedPermissions(currentPermissions);
      setUseCustomPermissions(Boolean(user.permissions && user.permissions.length > 0));
    }
  }, [user]);

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions(prev => {
      if (prev.includes(permissionId)) {
        return prev.filter(id => id !== permissionId);
      } else {
        return [...prev, permissionId];
      }
    });
  };

  const handleUseCustomToggle = () => {
    const newUseCustom = !useCustomPermissions;
    setUseCustomPermissions(newUseCustom);
    
    if (!newUseCustom && user) {
      // Reset to default role permissions
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS[user.role] || ['dashboard']);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    setLoading(true);
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (useCustomPermissions) {
        updateData.permissions = selectedPermissions;
      } else {
        // Remove custom permissions to use default role permissions
        updateData.permissions = null;
      }

      const userRef = doc(db, 'clinicUsers', user.id);
      await updateDoc(userRef, updateData);
      
      onPermissionsUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating user permissions:', error);
      alert('Kullanıcı yetkileri güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[user.role] || ['dashboard'];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Kullanıcı Yetkileri</h2>
              <p className="text-gray-600 mt-1">{user.fullName} - {user.role}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-xl font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 bg-white">
          {/* Permission Type Selection */}
          <div className="bg-gray-50 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="useCustomPermissions"
                checked={useCustomPermissions}
                onChange={handleUseCustomToggle}
                className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="useCustomPermissions" className="text-lg font-semibold text-gray-700">
                Özel Yetkiler Kullan
              </label>
            </div>
            <p className="text-sm text-gray-600">
              {useCustomPermissions 
                ? 'Bu kullanıcı için özel yetkiler belirleniyor. Aşağıdaki seçeneklerden istediğinizi seçebilirsiniz.'
                : `Bu kullanıcı "${user.role}" rolünün varsayılan yetkilerini kullanıyor.`
              }
            </p>
          </div>

          {/* Default Role Permissions Display */}
          {!useCustomPermissions && (
            <div className="bg-blue-50 p-4 rounded-xl">
              <h3 className="font-semibold text-blue-800 mb-3">Varsayılan Roller ({user.role})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {defaultPermissions.map(permissionId => {
                  const permission = AVAILABLE_PERMISSIONS.find(p => p.id === permissionId);
                  return permission ? (
                    <div key={permission.id} className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <span className="text-2xl">{permission.icon}</span>
                      <div>
                        <div className="font-semibold text-gray-800">{permission.name}</div>
                        <div className="text-sm text-gray-600">{permission.description}</div>
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Custom Permissions Selection */}
          {useCustomPermissions && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4">Özel Yetkiler Seçin</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {AVAILABLE_PERMISSIONS.map(permission => (
                  <div key={permission.id} className="relative">
                    <input
                      type="checkbox"
                      id={`permission-${permission.id}`}
                      checked={selectedPermissions.includes(permission.id)}
                      onChange={() => handlePermissionToggle(permission.id)}
                      className="absolute top-3 left-3 w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label
                      htmlFor={`permission-${permission.id}`}
                      className={`flex items-center gap-3 p-4 pl-12 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedPermissions.includes(permission.id)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-25'
                      }`}
                    >
                      <span className="text-2xl">{permission.icon}</span>
                      <div>
                        <div className="font-semibold text-gray-800">{permission.name}</div>
                        <div className="text-sm text-gray-600">{permission.description}</div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              {loading ? 'Güncelleniyor...' : 'Yetkileri Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserPermissionsModal;