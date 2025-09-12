import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Update existing roles to add the new doctor-panel permission
export const updateRolesWithDoctorPanel = async () => {
  try {
    console.log('🔄 Starting role update process...');
    
    // Get all default roles that should have doctor-panel permission
    const rolesToUpdate = ['admin', 'doctor'];
    
    for (const roleName of rolesToUpdate) {
      // Query for default roles (clinicId: 'default')
      const rolesRef = collection(db, 'roles');
      const q = query(
        rolesRef,
        where('name', '==', roleName),
        where('clinicId', '==', 'default')
      );
      
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach(async (roleDoc) => {
        const roleData = roleDoc.data();
        const currentPermissions = roleData.permissions || [];
        
        // Check if doctor-panel is already in permissions
        if (!currentPermissions.includes('doctor-panel')) {
          const updatedPermissions = [...currentPermissions, 'doctor-panel'];
          
          console.log(`📝 Updating ${roleName} role permissions:`, {
            before: currentPermissions,
            after: updatedPermissions
          });
          
          // Update the role document
          await updateDoc(doc(db, 'roles', roleDoc.id), {
            permissions: updatedPermissions,
            updatedAt: new Date().toISOString()
          });
          
          console.log(`✅ Successfully updated ${roleName} role`);
        } else {
          console.log(`ℹ️ ${roleName} role already has doctor-panel permission`);
        }
      });
    }
    
    console.log('🎉 Role update process completed!');
    return true;
  } catch (error) {
    console.error('❌ Error updating roles:', error);
    throw error;
  }
};

// Utility function to check current role permissions
export const checkRolePermissions = async (roleName: string) => {
  try {
    const rolesRef = collection(db, 'roles');
    const q = query(
      rolesRef,
      where('name', '==', roleName),
      where('clinicId', '==', 'default')
    );
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const roleDoc = querySnapshot.docs[0];
      const roleData = roleDoc.data();
      console.log(`🔍 Current permissions for ${roleName}:`, roleData.permissions);
      return roleData.permissions;
    } else {
      console.log(`❌ Role ${roleName} not found`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error checking role permissions:', error);
    throw error;
  }
};
