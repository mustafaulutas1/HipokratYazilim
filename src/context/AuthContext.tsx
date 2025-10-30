import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { auth, secondaryAuth } from '../firebase/config';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import type { User, UserCredential } from 'firebase/auth';
import { db } from '../firebase/config';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { loggingService } from '../services/loggingService';
import { forceLogoutService } from '../services/forceLogoutService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserCredential>;
  register: (email: string, password: string) => Promise<UserCredential>;
  registerDoctor: (email: string, password: string) => Promise<UserCredential>;
  registerClinicUser: (userData: any) => Promise<UserCredential>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logPageVisit: (page: string, pageTitle: string) => Promise<void>;
  logNavigation: (fromPage: string, toPage: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [forceLogoutChecked, setForceLogoutChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Kullanıcı giriş yaptığında log yaz (sadece yeni giriş ise)
        if (!user) {
          loggingService.logUserAction(currentUser.uid, currentUser.email || '', 'login');
          loggingService.logSessionStart(currentUser.uid, currentUser.email || '');
          
          // Get stored login time or use current time
          let loginTime = forceLogoutService.getUserLoginTime(currentUser.uid);
          if (!loginTime) {
            loginTime = Date.now();
            forceLogoutService.storeUserLoginTime(currentUser.uid);
          }
          
          setSessionStartTime(loginTime);
          
          // Check if user should be logged out (for users who were offline)
          if (!forceLogoutChecked) {
            const shouldLogout = await forceLogoutService.shouldLogoutOnInit(loginTime);
            if (shouldLogout) {
              console.log('🚨 User logged in before force logout was triggered, logging out...');
              await signOut(auth);
              forceLogoutService.clearUserLoginTime();
              setForceLogoutChecked(true);
              setLoading(false);
              return;
            }
            setForceLogoutChecked(true);
          }
        }
      } else {
        // Kullanıcı çıkış yaptığında log yaz (sadece önceki user varsa ve çıkış yapılmışsa)
        if (user) {
          // Çıkış log'u logout fonksiyonunda yazılıyor, burada tekrar yazmayalım
        }
        setSessionStartTime(null);
        setForceLogoutChecked(false);
        forceLogoutService.clearUserLoginTime();
      }
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, [user, forceLogoutChecked]);

  // Listen for force logout events
  useEffect(() => {
    if (!user || !sessionStartTime) return;

    const unsubscribe = forceLogoutService.onForceLogoutChange((forceLogoutData) => {
      if (forceLogoutData && forceLogoutService.shouldLogout(sessionStartTime, forceLogoutData.timestamp)) {
        console.log('🚨 Force logout triggered, logging out user...');
        logout().catch(console.error);
      }
    });

    return unsubscribe;
  }, [user, sessionStartTime]);

  const logout = async () => {
    try {
      if (user) {
        // Çıkış yapmadan önce log yaz (hata olsa bile çıkış yap)
        try {
          await loggingService.logUserAction(user.uid, user.email || '', 'logout');
          await loggingService.logSessionEnd(user.uid);
        } catch (logError) {
          // Log yazma hatası sessizce geçiliyor
        }
      }
      
      // Clear login time from storage
      forceLogoutService.clearUserLoginTime();
      
      // Firebase çıkış işlemi
      await signOut(auth);
      
      // Session storage'ı temizle
      sessionStorage.clear();
      localStorage.removeItem('user_session_id');
    } catch (error) {
      // Hata olsa bile session'ı temizle
      sessionStorage.clear();
      localStorage.removeItem('user_session_id');
      forceLogoutService.clearUserLoginTime();
      throw error;
    }
  };

  const login = (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const checkExistingUser = async (email: string) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        throw new Error('Bu e-posta adresi zaten kullanılıyor. Lütfen farklı bir e-posta adresi kullanın veya giriş yapın.');
      }
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User doesn't exist, which is what we want
        return;
      }
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      // Check if user already exists
      await checkExistingUser(email);
      
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Firestore'da patients koleksiyonuna yeni belge ekle
      const patientData = {
        email,
        fullName: '',
        tcNo: '',
        fatherName: '',
        address: '',
        phone: '',
        registeredProvince: '',
        registrationDate: '',
        visitReason: '',
        birthDate: '',
        gender: '',
        birthPlace: '',
        emergencyPhone: '',
        userType: 'patient',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await setDoc(doc(db, 'patients', cred.user.uid), patientData);
      return cred;
    } catch (error) {
      throw error;
    }
  };

  const registerDoctor = async (email: string, password: string) => {
    try {
      // Check if user already exists
      await checkExistingUser(email);
      
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      
      // First create a new clinic
      const clinicData = {
        name: '', // Will be filled by the doctor later
        address: '',
        phone: '',
        email: email,
        adminId: cred.user.uid,
        adminEmail: email,
        description: '',
        specialties: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const clinicDocRef = await addDoc(collection(db, 'clinics'), clinicData);
      const clinicId = clinicDocRef.id;
      
      // Create doctor profile as admin with the clinic ID
      const doctorData = {
        email,
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
        userType: 'admin', // Set as admin since this is the clinic owner
        clinicId: clinicId,
        isClinicOwner: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await setDoc(doc(db, 'doctors', cred.user.uid), doctorData);
      
      return cred;
    } catch (error) {
      throw error;
    }
  };

  const registerClinicUser = async (userData: any) => {
    try {
      // Check if user already exists
      await checkExistingUser(userData.email);
      
      // Use secondary auth instance to avoid affecting current user session
      const cred = await createUserWithEmailAndPassword(secondaryAuth, userData.email, userData.password);
      
      // Firestore'da clinicUsers koleksiyonuna yeni belge ekle
      const clinicUserData = {
        ...userData,
        userType: userData.role, // Map role to userType for consistency
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Remove password from data before saving to Firestore
      delete clinicUserData.password;
      
      await setDoc(doc(db, 'clinicUsers', cred.user.uid), clinicUserData);
      
      // Important: Sign out from secondary auth to prevent any issues
      await signOut(secondaryAuth);
      
      return cred;
    } catch (error) {
      // Make sure to sign out from secondary auth even if there's an error
      try {
        await signOut(secondaryAuth);
      } catch (signOutError) {
        // Secondary auth sign out error
      }
      throw error;
    }
  };

  const logPageVisit = async (page: string, pageTitle: string) => {
    if (user) {
      try {
        await loggingService.logPageVisit(user.uid, user.email || '', page, pageTitle);
      } catch (error) {
        // Sayfa ziyaret log hatası
      }
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user) {
      throw new Error('Kullanıcı giriş yapmamış');
    }
    
    try {
      // Önce kullanıcıyı mevcut şifre ile yeniden doğrula
      const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Şimdi şifreyi değiştir
      await updatePassword(user, newPassword);
      
       // Şifre değişikliği log'u
       await loggingService.logUserAction(user.uid, user.email || '', 'navigation', 'password_change', {
         action: 'password_change',
         timestamp: new Date().toISOString()
       });
    } catch (error: any) {
      console.error('Şifre değiştirme hatası:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      throw error;
    }
  };

  const logNavigation = async (fromPage: string, toPage: string) => {
    if (user) {
      await loggingService.logUserAction(user.uid, user.email || '', 'navigation', toPage, {
        fromPage,
        toPage
      });
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      logout, 
      login, 
      register, 
      registerDoctor, 
      registerClinicUser,
      changePassword,
      resetPassword,
      logPageVisit,
      logNavigation
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 