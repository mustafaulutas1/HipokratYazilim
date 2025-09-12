import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { auth, secondaryAuth } from '../firebase/config';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import type { User, UserCredential } from 'firebase/auth';
import { db } from '../firebase/config';
import { doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserCredential>;
  register: (email: string, password: string) => Promise<UserCredential>;
  registerDoctor: (email: string, password: string) => Promise<UserCredential>;
  registerClinicUser: (userData: any) => Promise<UserCredential>;
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = () => signOut(auth);

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
      console.log('Yeni hasta kaydı oluşturuldu:', cred.user.uid);
      return cred;
    } catch (error) {
      console.error('Kayıt sırasında hata oluştu:', error);
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
      
      console.log('Yeni klinik oluşturuldu:', clinicId);
      console.log('Yeni doktor admin kaydı oluşturuldu:', cred.user.uid);
      
      return cred;
    } catch (error) {
      console.error('Doktor kayıt sırasında hata oluştu:', error);
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
      
      console.log('Yeni klinik kullanıcısı kaydı oluşturuldu:', cred.user.uid);
      return cred;
    } catch (error) {
      console.error('Klinik kullanıcısı kayıt sırasında hata oluştu:', error);
      // Make sure to sign out from secondary auth even if there's an error
      try {
        await signOut(secondaryAuth);
      } catch (signOutError) {
        console.error('Secondary auth sign out error:', signOutError);
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, login, register, registerDoctor, registerClinicUser }}>
      {children}
    </AuthContext.Provider>
  );
}; 