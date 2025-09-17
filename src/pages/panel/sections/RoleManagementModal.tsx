import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { AVAILABLE_PERMISSIONS } from '../../../constants/permissions';
import { DEFAULT_ROLES } from '../../../types/Role';
import type { Role } from '../../../types/Role';
import { updateRolesWithAssistantPanel } from '../../../services/updateRoles';

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorProfile?: any;
}

const RoleManagementModal: React.FC<RoleManagementModalProps> = ({ 
  isOpen, 
  onClose, 
  doctorProfile 
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    permissions: [] as string[]
  });

  // Fetch roles from Firestore
  const fetchRoles = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      setLoading(true);
      
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
      
      // Sort: default roles first, then by creation date (newest first)
      rolesData.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize default roles if they don't exist
  const initializeDefaultRoles = async () => {
    if (!doctorProfile?.clinicId) return;
    
    try {
      const defaultRolesRef = collection(db, 'roles');
      const q = query(defaultRolesRef, where('clinicId', '==', 'default'));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log('Initializing default roles...');
        // Add default roles one by one
        for (const defaultRole of DEFAULT_ROLES) {
          try {
            await addDoc(collection(db, 'roles'), {
              ...defaultRole,
              clinicId: 'default',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            console.log(`Added default role: ${defaultRole.displayName}`);
          } catch (roleError) {
            console.error(`Error adding role ${defaultRole.name}:`, roleError);
          }
        }
        console.log('Default roles initialization completed');
      }
    } catch (error) {
      console.error('Error initializing default roles:', error);
    }
  };

  useEffect(() => {
    if (isOpen && doctorProfile?.clinicId) {
      initializeDefaultRoles().then(() => {
        fetchRoles();
      });
    }
  }, [isOpen, doctorProfile]);

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorProfile?.clinicId || !formData.name.trim()) return;

    try {
      setLoading(true);
      const roleData = {
        name: formData.name.toLowerCase().replace(/\s+/g, '_'),
        displayName: formData.displayName.trim(),
        description: formData.description.trim(),
        permissions: formData.permissions,
        isDefault: false,
        clinicId: doctorProfile.clinicId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'roles'), roleData);
      
      setFormData({ name: '', displayName: '', description: '', permissions: [] });
      setShowAddForm(false);
      fetchRoles();
    } catch (error) {
      console.error('Error adding role:', error);
      alert('Rol eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    try {
      setLoading(true);
      const roleRef = doc(db, 'roles', editingRole.id);
      await updateDoc(roleRef, {
        displayName: formData.displayName.trim(),
        description: formData.description.trim(),
        permissions: formData.permissions,
        updatedAt: new Date().toISOString()
      });

      setEditingRole(null);
      setFormData({ name: '', displayName: '', description: '', permissions: [] });
      fetchRoles();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Rol güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Bu rolü silmek istediğinizden emin misiniz?')) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'roles', roleId));
      fetchRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      alert('Rol silinirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: [...role.permissions]
    });
    setShowAddForm(true);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(id => id !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const resetForm = () => {
    setFormData({ name: '', displayName: '', description: '', permissions: [] });
    setEditingRole(null);
    setShowAddForm(false);
  };

  // Handle updating roles with assistant-panel permission
  const handleUpdateRoles = async () => {
    try {
      setLoading(true);
      console.log('🔄 Starting role update...');
      await updateRolesWithAssistantPanel();
      alert('Roller başarıyla güncellendi! Sayfa yenilenecek.');
      fetchRoles(); // Refresh the roles list
      window.location.reload(); // Reload to get updated permissions
    } catch (error) {
      console.error('❌ Role update error:', error);
      alert('Rolleri güncellerken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Rol Yönetimi</h2>
              <p className="text-white/80">Klinik rolleri ve yetkilerini yönetin</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Roles List */}
          <div className="w-1/2 p-6 border-r border-gray-200 flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-800">Mevcut Roller</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUpdateRoles}
                  disabled={loading}
                  className="px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                  title="ZORUNLU: Rolleri güncelle ve Asistan Ekranı'nı etkinleştir - Asistan ekranı gözükmüyorsa bu butona tıklayın"
                >
                  🔧 Rolleri Güncelle
                </button>
                {/* Temporarily hidden - can be re-enabled by removing the false condition */}
                {false && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                  >
                    ➕ Yeni Rol
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-800">{role.displayName}</h4>
                          {role.isDefault && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Varsayılan
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {role.permissions.length} yetki
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRole(role)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          Düzenle
                        </button>
                        {!role.isDefault && (
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          <div className="w-1/2 p-6 bg-gray-50 overflow-y-auto">
            {showAddForm ? (
              <form onSubmit={editingRole ? handleUpdateRole : handleAddRole} className="space-y-4">
                <div className="flex items-center justify-between bg-white rounded-lg p-3 border-l-4 border-purple-500">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {editingRole ? '✏️ Rol Düzenle' : '➕ Yeni Rol Ekle'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {editingRole ? 'Mevcut rolü düzenleyin' : 'Klinik için özel bir rol oluşturun'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {!editingRole && (
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📋 Rol Adı (Sistem İçin)
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                      placeholder="ornek_rol (küçük harf, alt çizgi kullanın)"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Bu ad sistem içinde kullanılır ve değiştirilemez.
                    </p>
                  </div>
                )}

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ✨ Görünen Ad
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Örnek: Baş Hemşire"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Kullanıcılara gösterilecek rol adı.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📝 Açıklama
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-20 resize-none"
                    placeholder="Bu rolün sorumluluklarını ve görevlerini açıklayın..."
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Rolün ne işle meşgul olduğunu açıklayın.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <span className="flex items-center gap-2">
                      🔐 Yetkiler 
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-semibold">
                        {formData.permissions.length} seçildi
                      </span>
                    </span>
                  </label>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 max-h-80 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-2">
                      {AVAILABLE_PERMISSIONS.map((permission) => (
                        <label
                          key={permission.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            formData.permissions.includes(permission.id)
                              ? 'bg-purple-50 border-purple-200 border'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(permission.id)}
                            onChange={() => handlePermissionToggle(permission.id)}
                            className="text-purple-600 focus:ring-purple-500 w-4 h-4"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{permission.icon}</span>
                              <span className="font-medium text-gray-800">{permission.name}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{permission.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Bu rolü kullanan personel sadece seçilen yetki alanlarına erişebilir.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading || !formData.displayName.trim()}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    {loading ? 'Kaydediliyor...' : (editingRole ? 'Güncelle' : 'Rol Ekle')}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center text-gray-500">
                {/* Welcome Card */}
                <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-dashed border-gray-200 max-w-md">
                  <div className="text-6xl mb-4">🏷️</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-3">Rol Yönetimi</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Klinik personeli için özel roller oluşturun veya mevcut rolleri düzenleyin.
                  </p>
                  
                  <div className="space-y-3 text-sm text-left">
                    <div className="flex items-start gap-3">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span>Sol taraftaki <strong>"Yeni Rol"</strong> butonuna tıklayarak yeni rol ekleyin</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-blue-500 mt-0.5">✓</span>
                      <span>Mevcut rollerin <strong>"Düzenle"</strong> butonuna tıklayarak değiştirin</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-purple-500 mt-0.5">✓</span>
                      <span>Her rol için özel yetkiler belirleyin</span>
                    </div>
                  </div>
                </div>
                
                {/* Quick Stats */}
                <div className="mt-6 text-sm text-gray-500">
                  <p>Toplam {roles.length} rol tanımlanmış</p>
                  <p>{roles.filter(r => r.isDefault).length} varsayılan, {roles.filter(r => !r.isDefault).length} özel rol</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleManagementModal;
