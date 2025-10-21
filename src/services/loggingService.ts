import { db } from '../firebase/config';
import { collection, addDoc, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';

export interface UserLog {
  id?: string;
  userId: string;
  userEmail: string;
  action: 'login' | 'logout' | 'page_visit' | 'navigation';
  page?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId: string;
  details?: Record<string, any>;
}

export interface PageVisitLog {
  id?: string;
  userId: string;
  userEmail: string;
  page: string;
  pageTitle: string;
  timestamp: Date;
  sessionId: string;
  duration?: number; // milliseconds
  referrer?: string;
}

export interface SessionLog {
  id?: string;
  userId: string;
  userEmail: string;
  loginTime: Date;
  logoutTime?: Date;
  sessionId: string;
  totalPagesVisited: number;
  totalDuration: number; // milliseconds
  lastActivity: Date;
}

class LoggingService {
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentSessionId(): string {
    const sessionId = sessionStorage.getItem('user_session_id');
    if (!sessionId) {
      const newSessionId = this.generateSessionId();
      sessionStorage.setItem('user_session_id', newSessionId);
      return newSessionId;
    }
    return sessionId;
  }

  async logUserAction(
    userId: string,
    userEmail: string,
    action: 'login' | 'logout' | 'page_visit' | 'navigation',
    page?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const logData: UserLog = {
        userId,
        userEmail,
        action,
        page: page || '',
        timestamp: new Date(),
        sessionId: this.getCurrentSessionId(),
        userAgent: navigator.userAgent,
        details: details || {}
      };

      await addDoc(collection(db, 'userLogs'), {
        ...logData,
        timestamp: Timestamp.fromDate(logData.timestamp)
      });
    } catch (error) {
      // Log yazma hatası
    }
  }

  async logPageVisit(
    userId: string,
    userEmail: string,
    page: string,
    pageTitle: string,
    duration?: number,
    referrer?: string
  ): Promise<void> {
    try {
      const logData: PageVisitLog = {
        userId,
        userEmail,
        page,
        pageTitle,
        timestamp: new Date(),
        sessionId: this.getCurrentSessionId(),
        duration: duration || 0,
        referrer: referrer || ''
      };


      await addDoc(collection(db, 'pageVisitLogs'), {
        ...logData,
        timestamp: Timestamp.fromDate(logData.timestamp)
      });

    } catch (error) {
      // Sayfa ziyaret log yazma hatası
    }
  }

  async logSessionStart(userId: string, userEmail: string): Promise<string> {
    try {
      const sessionId = this.getCurrentSessionId();
      const sessionData: SessionLog = {
        userId,
        userEmail,
        loginTime: new Date(),
        sessionId,
        totalPagesVisited: 0,
        totalDuration: 0,
        lastActivity: new Date()
      };

      await addDoc(collection(db, 'sessionLogs'), {
        ...sessionData,
        loginTime: Timestamp.fromDate(sessionData.loginTime),
        lastActivity: Timestamp.fromDate(sessionData.lastActivity)
      });

      return sessionId;
    } catch (error) {
      return '';
    }
  }

  async logSessionEnd(userId: string): Promise<void> {
    try {
      const sessionId = this.getCurrentSessionId();
      const sessionLogsRef = collection(db, 'sessionLogs');
      const q = query(
        sessionLogsRef,
        where('userId', '==', userId),
        where('sessionId', '==', sessionId),
        where('logoutTime', '==', null),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        await addDoc(collection(db, 'sessionLogs'), {
          ...sessionDoc.data(),
          logoutTime: Timestamp.fromDate(new Date())
        });
      }

      // Session storage'ı temizle
      sessionStorage.removeItem('user_session_id');
    } catch (error) {
      // Oturum sonlandırma log hatası
    }
  }

  async getUserLogs(userId: string, limitCount: number = 50): Promise<UserLog[]> {
    try {
      
      const logsRef = collection(db, 'userLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      } as UserLog)).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return logs;
    } catch (error) {
      return [];
    }
  }

  async getPageVisitLogs(userId: string, limitCount: number = 50): Promise<PageVisitLog[]> {
    try {
      const logsRef = collection(db, 'pageVisitLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      } as PageVisitLog)).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      return [];
    }
  }

  async getSessionLogs(userId: string, limitCount: number = 20): Promise<SessionLog[]> {
    try {
      const logsRef = collection(db, 'sessionLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        loginTime: doc.data().loginTime.toDate(),
        logoutTime: doc.data().logoutTime?.toDate(),
        lastActivity: doc.data().lastActivity.toDate()
      } as SessionLog)).sort((a, b) => b.loginTime.getTime() - a.loginTime.getTime());
    } catch (error) {
      return [];
    }
  }

  async getPageVisitStats(userId: string, days: number = 7): Promise<Record<string, number>> {
    try {
      const logsRef = collection(db, 'pageVisitLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        limit(100) // Son 100 kayıt
      );

      const querySnapshot = await getDocs(q);
      const pageStats: Record<string, number> = {};
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const page = data.page;
        const timestamp = data.timestamp.toDate();
        
        if (timestamp >= cutoffDate) {
          pageStats[page] = (pageStats[page] || 0) + 1;
        }
      });

      return pageStats;
    } catch (error) {
      return {};
    }
  }

  async getDailyActivityStats(userId: string, days: number = 7): Promise<Record<string, number>> {
    try {
      const logsRef = collection(db, 'userLogs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        limit(100) // Son 100 kayıt
      );

      const querySnapshot = await getDocs(q);
      const dailyStats: Record<string, number> = {};
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const timestamp = data.timestamp.toDate();
        
        if (timestamp >= cutoffDate) {
          const date = timestamp.toISOString().split('T')[0];
          dailyStats[date] = (dailyStats[date] || 0) + 1;
        }
      });

      return dailyStats;
    } catch (error) {
      return {};
    }
  }
}

export const loggingService = new LoggingService();
