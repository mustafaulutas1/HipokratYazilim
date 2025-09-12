import React, { useState, useEffect } from "react";
import menu from '../../assets/menu.svg'
import close from '../../assets/close.svg'
import { rtmLogo } from '../../assets'
import { navLinks } from '../../constants'
import styles from '../../style'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const Navbar = () => {
  const [toggle, setToggle] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleNavClick = (sectionId: string) => {
    // Eğer ana sayfada değilsek, önce ana sayfaya git
    if (window.location.pathname !== '/') {
      navigate('/home');
      // Ana sayfa yüklendikten sonra scroll yap
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // Ana sayfadaysak direkt scroll yap
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        try {
          console.log("🔍 Navbar: Fetching profile for user:", user.uid);
          
          // Check all three collections and use the one with more complete data
          let patientRef = doc(db, "patients", user.uid);
          let doctorRef = doc(db, "doctors", user.uid);
          let clinicUserRef = doc(db, "clinicUsers", user.uid);
          
          const [patientSnap, doctorSnap, clinicUserSnap] = await Promise.all([
            getDoc(patientRef),
            getDoc(doctorRef),
            getDoc(clinicUserRef)
          ]);
          
          let patientData = null;
          let doctorData = null;
          let clinicUserData = null;
          
          if (patientSnap.exists()) {
            patientData = patientSnap.data();
            console.log("📋 Navbar: Found patient profile:", patientData);
          }
          
          if (doctorSnap.exists()) {
            doctorData = doctorSnap.data();
            console.log("👨‍⚕️ Navbar: Found doctor profile:", doctorData);
          }
          
          if (clinicUserSnap.exists()) {
            clinicUserData = clinicUserSnap.data();
            console.log("🏥 Navbar: Found clinic user profile:", clinicUserData);
          }
          
          // Prefer the profile with more complete data (has fullName)
          if (clinicUserData?.fullName) {
            console.log("✅ Navbar: Using clinic user profile (has fullName)");
            setUserProfile(clinicUserData);
          } else if (doctorData?.fullName && !patientData?.fullName) {
            console.log("✅ Navbar: Using doctor profile (has fullName)");
            setUserProfile(doctorData);
          } else if (patientData?.fullName && !doctorData?.fullName) {
            console.log("✅ Navbar: Using patient profile (has fullName)");
            setUserProfile(patientData);
          } else if (clinicUserData) {
            console.log("✅ Navbar: Using clinic user profile (default)");
            setUserProfile(clinicUserData);
          } else if (doctorData) {
            console.log("✅ Navbar: Using doctor profile (default)");
            setUserProfile(doctorData);
          } else if (patientData) {
            console.log("✅ Navbar: Using patient profile (default)");
            setUserProfile(patientData);
          } else {
            console.log("⚠️ Navbar: No profile found for user");
            setUserProfile(null);
          }
        } catch (error) {
          console.error("❌ Navbar: Profil çekme hatası:", error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
    };
    fetchUserProfile();
  }, [user]);

  const getUserDisplay = () => {
    if (!user) return null;
    
    console.log("🎯 Navbar: getUserDisplay called with profile:", userProfile);
    
    if (userProfile?.fullName) {
      console.log("✅ Navbar: Using fullName:", userProfile.fullName);
      return userProfile.fullName;
    }
    if (userProfile?.email) {
      console.log("📧 Navbar: Using email:", userProfile.email.split('@')[0]);
      return userProfile.email.split('@')[0];
    }
    console.log("👤 Navbar: Using fallback: Hesabım");
    return 'Hesabım';
  };

  const hasClinicAccess = () => {
    // Check if user has clinic/panel access
    // This includes anyone who is either a doctor or clinic user
    if (!userProfile) return false;
    
    // Check if user has any of the clinic roles (including new dynamic roles)
    const clinicRoles = ['admin', 'doctor', 'nurse', 'assistant', 'desk', 'anamnez', 'accounting', 'pharmacy', 'treatment'];
    
    return userProfile?.userType === 'doctor' || 
           userProfile?.specialization ||
           clinicRoles.includes(userProfile?.userType) ||
           clinicRoles.includes(userProfile?.role) ||
           userProfile?.clinicId; // Anyone with a clinicId should have access
  };

  return (
    <nav className={`w-full flex py-0 justify-between items-center navbar ${styles.boxWidth}`}>
      <div className="flex items-center">
        <img 
          src={rtmLogo} 
          alt="RTM Logo" 
          className="w-50 h-50 mr-4"
        />
        <div>
          <h2 className="text-xl font-bold text-white">RTM Klinik</h2>
          <p className="text-sm text-white/70">RTM Platform</p>
        </div>
      </div>

      <ul className='list-none sm:flex hidden justify-end items-center flex-1'>
        {navLinks.map((nav, i) => (
          <li 
            key={nav.id}
            className={`font-inter font-medium cursor-pointer text-[16px] ${i === navLinks.length - 1 ? 'mr-0' : 'mr-10'} text-white hover:text-cyan-400 transition-colors duration-300`}
            onClick={() => handleNavClick(nav.id)}
          >
            <span className="nav-link">
              {nav.title}
            </span>
          </li>        
        ))}
      </ul>

      <div className='flex items-center gap-4 ml-6'>
        {!user ? (
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2 rounded-xl font-inter font-semibold text-base bg-white/10 text-white border border-cyan-400/40 shadow hover:bg-cyan-500/20 hover:text-cyan-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
          >
            Giriş Yap
          </button>
        ) : (
          <>
            {hasClinicAccess() && (
              <button
                onClick={() => navigate('/panel')}
                className="px-5 py-2 rounded-xl font-inter font-semibold text-base bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-400 cursor-pointer"
              >
                Platform
              </button>
            )}
            <div className="px-5 py-2 rounded-xl font-inter font-semibold text-base bg-white/10 text-white border border-cyan-400/40 shadow flex items-center gap-2 cursor-pointer hover:bg-cyan-500/20 transition-all duration-200" onClick={() => navigate(hasClinicAccess() ? '/doctor-register' : '/profile')}>
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
              Merhaba, {getUserDisplay()}
            </div>
          </>
        )}
      </div>

      <div className='sm:hidden flex flex-1 justify-end items-center'>
        <img
          src={toggle ? close : menu}
          alt='menu'
          className='w-[28px] h-[28px] object-contain cursor-pointer filter invert'
          onClick={() => setToggle((previous) => !previous)}
        />
        <div className={`${toggle ? 'flex' : 'hidden'} p-6 bg-slate-900/95 backdrop-blur-sm border border-white/20 shadow-xl absolute top-20 right-0 mx-4 my-2 min-w-[200px] rounded-xl sidebar`}>
          <ul className='list-none flex flex-col justify-end items-start flex-1'>
            {navLinks.map((nav, i) => (
              <li 
                key={nav.id}
                className={`font-inter font-medium cursor-pointer text-[16px] ${i === navLinks.length - 1 ? 'mb-0' : 'mb-4'} text-white hover:text-cyan-400 transition-colors duration-300`}
                onClick={() => {
                  handleNavClick(nav.id);
                  setToggle(false);
                }}
              >
                <span className="nav-link">
                  {nav.title}
                </span>
              </li>        
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
