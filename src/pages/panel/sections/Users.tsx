import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import AddUserModal from './AddUserModal';
import EditUserModal from './EditUserModal';
import UserPermissionsModal from './UserPermissionsModal';
import RoleManagementModal from './RoleManagementModal';

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

interface UsersProps {
  doctorProfile?: any;
}

const Users: React.FC<UsersProps> = ({ doctorProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isRoleManagementOpen, setIsRoleManagementOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserForPermissions, setSelectedUserForPermissions] =
    useState<User | null>(null);

  // Fetch users from Firestore
  const fetchUsers = async () => {
    if (!doctorProfile?.clinicId) {
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const usersRef = collection(db, 'clinicUsers');

      // Get users with clinicId filter (without orderBy to avoid compound index requirement)
      const qWithClinic = query(
        usersRef,
        where('clinicId', '==', doctorProfile.clinicId)
      );

      let querySnapshot = await getDocs(qWithClinic);
      const usersData: User[] = [];

      querySnapshot.forEach((doc) => {
        usersData.push({
          id: doc.id,
          ...doc.data(),
        } as User);
      });

      // If no users found with clinicId, also fetch users without clinicId (legacy users)
      if (usersData.length === 0) {
        const qAll = query(usersRef);
        const allSnapshot = await getDocs(qAll);

        allSnapshot.forEach((doc) => {
          const userData = doc.data();
          // Include users without clinicId or with matching clinicId
          if (!userData.clinicId || userData.clinicId === doctorProfile.clinicId) {
            usersData.push({
              id: doc.id,
              ...userData,
            } as User);
          }
        });
      }

      // Sort manually by createdAt (newest first)
      usersData.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (doctorProfile?.clinicId) {
      fetchUsers();
    }
  }, [doctorProfile?.clinicId]);

  // Auto-update legacy users when users list changes
  useEffect(() => {
    if (users.length > 0 && doctorProfile?.clinicId) {
      const hasLegacyUsers = users.some(user => !user.clinicId);
      if (hasLegacyUsers) {
        updateLegacyUsers();
      }
    }
  }, [users.length]);

  const handleUserAdded = () => {
    fetchUsers();
  };

  const handleUserUpdated = () => {
    fetchUsers();
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleManagePermissions = (user: User) => {
    setSelectedUserForPermissions(user);
    setIsPermissionsModalOpen(true);
  };

  const handlePermissionsUpdated = () => {
    fetchUsers();
  };

  // Update legacy users with clinicId
  const updateLegacyUsers = async () => {
    if (!doctorProfile?.clinicId) return;

    try {
      const usersToUpdate = users.filter(user => !user.clinicId);

      if (usersToUpdate.length === 0) {
        return;
      }

      const updatePromises = usersToUpdate.map(async (user) => {
        const userRef = doc(db, 'clinicUsers', user.id);
        return updateDoc(userRef, {
          clinicId: doctorProfile.clinicId,
          updatedAt: new Date().toISOString(),
        });
      });

      await Promise.all(updatePromises);
      alert('Kullanıcılar başarıyla güncellendi!');

      // Refresh the list
      fetchUsers();
    } catch (error) {
      console.error('Error updating legacy users:', error);
      alert('Kullanıcılar güncellenirken bir hata oluştu.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'clinicUsers', userId));
        fetchUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Kullanıcı silinirken bir hata oluştu.');
      }
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const userRef = doc(db, 'clinicUsers', userId);
      await updateDoc(userRef, {
        isActive: !currentStatus,
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      alert('Kullanıcı durumu güncellenirken bir hata oluştu.');
    }
  };

  // Filter users based on search term and role
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'doctor':
        return 'bg-blue-100 text-blue-800';
      case 'nurse':
        return 'bg-green-100 text-green-800';
      case 'assistant':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'doctor':
        return 'Doktor';
      case 'nurse':
        return 'Hemşire';
      case 'assistant':
        return 'Asistan';
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h2>
          <p className="text-white/70">Klinik personeli ve yetkilendirme</p>
        </div>
        <div className="flex items-center gap-3">
          {users.some(user => !user.clinicId) && (
            <button
              onClick={updateLegacyUsers}
              className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
              title="Eski kullanıcıları klinik ile ilişkilendir"
            >
              🔄 Kullanıcıları Güncelle
            </button>
          )}
          <button
            onClick={() => setIsRoleManagementOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
          >
            🏷️ Rol Yönetimi
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
          >
            ➕ Yeni Kullanıcı Ekle
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            title: 'Toplam Kullanıcı',
            value: users.length.toString(),
            icon: '👥',
            color: 'from-blue-500 to-cyan-500'
          },
          {
            title: 'Aktif Kullanıcı',
            value: users.filter(u => u.isActive).length.toString(),
            icon: '✅',
            color: 'from-green-500 to-emerald-500'
          },
          {
            title: 'Bu Ay Yeni',
            value: users.filter(u => {
              const createdAt = new Date(u.createdAt);
              const now = new Date();
              return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
            }).length.toString(),
            icon: '🆕',
            color: 'from-yellow-500 to-orange-500'
          },
          {
            title: 'Admin Kullanıcı',
            value: users.filter(u => u.role === 'admin').length.toString(),
            icon: '👑',
            color: 'from-purple-500 to-pink-500'
          }
        ].map((stat, index) => (
          <div key={index} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <span className="text-white text-xl">{stat.icon}</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-white/70 text-sm">{stat.title}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              aria-label="Rol filtrele"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tüm Roller</option>
              <option value="admin">Admin</option>
              <option value="doctor">Doktor</option>
              <option value="nurse">Hemşire</option>
              <option value="assistant">Asistan</option>
            </select>
          </div>
          <div className="text-white/70">
            Toplam: {filteredUsers.length} kullanıcı
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Kullanıcı
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Rol
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Bölüm
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Telefon
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Yetkiler
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  Durum
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/90">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold text-white">
                        {user.fullName}
                      </div>
                      <div className="text-sm text-white/70">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(
                        user.role
                      )}`}
                    >
                      {getRoleText(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-white">
                      {user.specialization || user.department || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-white">{user.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-white text-sm">
                      {user.permissions && user.permissions.length > 0 ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                          Özel ({user.permissions.length})
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          Varsayılan
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleUserStatus(user.id, user.isActive)}
                      className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full transition-colors ${user.isActive
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                    >
                      {user.isActive ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-300 hover:text-green-200 transition-all duration-200"
                        title="Düzenle"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleManagePermissions(user)}
                        className="p-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-300 hover:text-purple-200 transition-all duration-200"
                        title="Yetkiler"
                      >
                        🔐
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-red-200 transition-all duration-200"
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-white/70">Kullanıcı bulunamadı.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onUserAdded={handleUserAdded}
        doctorProfile={doctorProfile}
      />

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onUserUpdated={handleUserUpdated}
        user={selectedUser}
      />

      <UserPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
        onPermissionsUpdated={handlePermissionsUpdated}
        user={selectedUserForPermissions}
      />

      <RoleManagementModal
        isOpen={isRoleManagementOpen}
        onClose={() => setIsRoleManagementOpen(false)}
        doctorProfile={doctorProfile}
      />
    </div>
  );
};

export default Users;
