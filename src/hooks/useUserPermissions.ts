import { useState, useEffect } from 'react';
import { getRolePermissions } from '../services/roleService';
import { getUserPermissions } from '../constants/permissions';

export const useUserPermissions = (userRole: string | undefined, clinicId: string | undefined, customPermissions?: string[]) => {
  const [permissions, setPermissions] = useState<string[]>(['dashboard']);
  const [loading, setLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!userRole) {
        setPermissions(['dashboard']);
        setLoading(false);
        return;
      }

      // Security check: clinicId is required for all operations
      if (!clinicId) {
        console.error('❌ Security: No clinicId provided for user permissions');
        setSecurityError('Güvenlik hatası: Klinik bilgisi bulunamadı');
        setPermissions(['dashboard']); // Minimal permissions
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setSecurityError(null);
        
        // If user has custom permissions, use those
        if (customPermissions && customPermissions.length > 0) {
          console.log('🔐 Using custom permissions for user:', customPermissions);
          // Filter out dashboard for doctor role
          const filteredPermissions = userRole === 'doctor' 
            ? customPermissions.filter(p => p !== 'dashboard')
            : customPermissions;
          setPermissions(filteredPermissions);
        } else if (clinicId) {
          // Try to get permissions from dynamic role system
          try {
            const rolePermissions = await getRolePermissions(userRole, clinicId);
            if (rolePermissions && rolePermissions.length > 0) {
              console.log('🔐 Got dynamic permissions for role', userRole, ':', rolePermissions);
              // Filter out dashboard for doctor role
              const filteredPermissions = userRole === 'doctor' 
                ? rolePermissions.filter(p => p !== 'dashboard')
                : rolePermissions;
              setPermissions(filteredPermissions);
            } else {
              console.warn('⚠️ Dynamic role found but no permissions, using static fallback');
              const staticPermissions = getUserPermissions(userRole);
              console.log('🔐 Using static permissions for role', userRole, ':', staticPermissions);
              setPermissions(staticPermissions);
            }
          } catch (roleError) {
            console.warn('⚠️ Could not fetch dynamic role permissions, using static fallback:', roleError);
            // Fallback to static permissions
            const staticPermissions = getUserPermissions(userRole);
            console.log('🔐 Using static permissions for role', userRole, ':', staticPermissions);
            setPermissions(staticPermissions);
          }
        } else {
          // No clinicId, use static permissions
          const staticPermissions = getUserPermissions(userRole);
          console.log('🔐 Using static permissions (no clinicId) for role', userRole, ':', staticPermissions);
          setPermissions(staticPermissions);
        }
      } catch (error) {
        console.error('❌ Error fetching user permissions:', error);
        // Final fallback
        const fallbackPermissions = getUserPermissions(userRole);
        console.log('🔐 Using fallback permissions for role', userRole, ':', fallbackPermissions);
        // Filter out dashboard for doctor role even in fallback
        const filteredFallback = userRole === 'doctor' 
          ? fallbackPermissions.filter(p => p !== 'dashboard')
          : fallbackPermissions;
        setPermissions(filteredFallback);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [userRole, clinicId, customPermissions]);

  return { permissions, loading, securityError };
};
