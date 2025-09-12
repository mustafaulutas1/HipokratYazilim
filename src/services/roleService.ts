import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { DEFAULT_ROLES } from '../types/Role';
import type { Role } from '../types/Role';

// Initialize default roles for a clinic
export const initializeDefaultRoles = async (): Promise<void> => {
  try {
    const defaultRolesRef = collection(db, 'roles');
    const q = query(defaultRolesRef, where('clinicId', '==', 'default'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Add default roles
      for (const defaultRole of DEFAULT_ROLES) {
        await addDoc(collection(db, 'roles'), {
          ...defaultRole,
          clinicId: 'default',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      console.log('Default roles initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing default roles:', error);
    throw error;
  }
};

// Get all roles for a clinic (including default roles)
export const getRolesByClinic = async (clinicId: string): Promise<Role[]> => {
  try {
    // First get default roles
    const defaultRolesRef = collection(db, 'roles');
    const defaultQuery = query(defaultRolesRef, where('clinicId', '==', 'default'));
    const defaultSnapshot = await getDocs(defaultQuery);
    
    // Then get clinic-specific roles
    const clinicRolesRef = collection(db, 'roles');
    const clinicQuery = query(clinicRolesRef, where('clinicId', '==', clinicId));
    const clinicSnapshot = await getDocs(clinicQuery);
    
    const roles: Role[] = [];
    
    // Add default roles
    defaultSnapshot.forEach((doc) => {
      roles.push({
        id: doc.id,
        ...doc.data()
      } as Role);
    });
    
    // Add clinic-specific roles
    clinicSnapshot.forEach((doc) => {
      roles.push({
        id: doc.id,
        ...doc.data()
      } as Role);
    });
    
    // Sort: default roles first, then by display name
    roles.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    
    return roles;
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
};

// Get role by name
export const getRoleByName = async (roleName: string, clinicId: string): Promise<Role | null> => {
  try {
    // First check default roles
    const defaultRolesRef = collection(db, 'roles');
    const defaultQuery = query(
      defaultRolesRef, 
      where('name', '==', roleName),
      where('clinicId', '==', 'default')
    );
    const defaultSnapshot = await getDocs(defaultQuery);
    
    if (!defaultSnapshot.empty) {
      const doc = defaultSnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as Role;
    }
    
    // Then check clinic-specific roles
    const clinicRolesRef = collection(db, 'roles');
    const clinicQuery = query(
      clinicRolesRef, 
      where('name', '==', roleName),
      where('clinicId', '==', clinicId)
    );
    const clinicSnapshot = await getDocs(clinicQuery);
    
    if (!clinicSnapshot.empty) {
      const doc = clinicSnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as Role;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching role by name:', error);
    throw error;
  }
};

// Get permissions for a role
export const getRolePermissions = async (roleName: string, clinicId: string): Promise<string[]> => {
  try {
    const role = await getRoleByName(roleName, clinicId);
    if (role?.permissions && role.permissions.length > 0) {
      return role.permissions;
    }
    // Return null/empty to indicate no dynamic role found, let caller handle fallback
    throw new Error(`No dynamic role found for: ${roleName}`);
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    throw error; // Re-throw to let caller handle fallback
  }
};

// Check if role exists
export const roleExists = async (roleName: string, clinicId: string): Promise<boolean> => {
  try {
    const role = await getRoleByName(roleName, clinicId);
    return role !== null;
  } catch (error) {
    console.error('Error checking role existence:', error);
    return false;
  }
};
