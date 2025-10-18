import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PageTracker: React.FC = () => {
  const location = useLocation();
  const { logPageVisit, user } = useAuth();

  useEffect(() => {
    if (location.pathname) {
      const pageTitle = document.title || location.pathname;
      
      // Panel içindeki sayfa değişikliklerini loglama (AdminPanel zaten yapıyor)
      if (location.pathname.startsWith('/panel/')) {
        return;
      }
      logPageVisit(location.pathname, pageTitle);
    }
  }, [location.pathname, logPageVisit, user]);

  return null; // Bu bileşen sadece takip için, UI render etmez
};

export default PageTracker;
