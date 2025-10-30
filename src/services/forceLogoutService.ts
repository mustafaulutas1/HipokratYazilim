import { db } from '../firebase/config';
import { doc, setDoc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';

const FORCE_LOGOUT_DOC = 'system/forceLogout';
const FORCE_LOGOUT_STORAGE_KEY = 'lastForceLogoutCheck';

export interface ForceLogoutData {
  timestamp: Timestamp;
  triggeredBy?: string;
  reason?: string;
  version: number; // Incremental version to track force logouts
}

/**
 * Service to manage force logout of all users
 */
export const forceLogoutService = {
  /**
   * Trigger force logout for all users
   */
  async triggerForceLogout(triggeredBy?: string, reason?: string): Promise<void> {
    try {
      const forceLogoutRef = doc(db, FORCE_LOGOUT_DOC);
      
      // Get current version or start at 1
      const currentDoc = await getDoc(forceLogoutRef);
      const currentVersion = currentDoc.exists() ? (currentDoc.data().version || 0) : 0;
      
      const data: ForceLogoutData = {
        timestamp: Timestamp.now(),
        triggeredBy,
        reason,
        version: currentVersion + 1
      };
      
      await setDoc(forceLogoutRef, data);
      
      // Also store in localStorage to check on next load
      localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, JSON.stringify({
        timestamp: Date.now(),
        version: data.version
      }));
      
      console.log('✅ Force logout triggered successfully, version:', data.version);
    } catch (error) {
      console.error('❌ Error triggering force logout:', error);
      throw error;
    }
  },

  /**
   * Get the last force logout timestamp
   */
  async getLastForceLogout(): Promise<ForceLogoutData | null> {
    try {
      const forceLogoutRef = doc(db, FORCE_LOGOUT_DOC);
      const docSnap = await getDoc(forceLogoutRef);
      
      if (docSnap.exists()) {
        return docSnap.data() as ForceLogoutData;
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting force logout data:', error);
      return null;
    }
  },

  /**
   * Listen to force logout changes
   * Returns unsubscribe function
   */
  onForceLogoutChange(callback: (data: ForceLogoutData | null) => void): () => void {
    const forceLogoutRef = doc(db, FORCE_LOGOUT_DOC);
    
    const unsubscribe = onSnapshot(
      forceLogoutRef,
      (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data() as ForceLogoutData);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('❌ Error listening to force logout:', error);
        callback(null);
      }
    );

    return unsubscribe;
  },

  /**
   * Check if user should be logged out based on their session start time
   */
  shouldLogout(sessionStartTime: number | null, forceLogoutTime: Timestamp | null): boolean {
    if (!forceLogoutTime || !sessionStartTime) {
      return false;
    }

    const forceLogoutMillis = forceLogoutTime.toMillis();
    
    // If force logout was triggered after user's session started, logout the user
    return forceLogoutMillis > sessionStartTime;
  },

  /**
   * Check if user should be logged out on app initialization
   * This catches users who were offline when force logout was triggered
   */
  async shouldLogoutOnInit(userSessionStartTime: number): Promise<boolean> {
    try {
      const lastLogout = await this.getLastForceLogout();
      
      if (!lastLogout) {
        return false;
      }

      const forceLogoutMillis = lastLogout.timestamp.toMillis();
      
      // If force logout happened after this user's session started, they should be logged out
      return forceLogoutMillis > userSessionStartTime;
    } catch (error) {
      console.error('❌ Error checking force logout on init:', error);
      return false;
    }
  },

  /**
   * Store user's login time in localStorage
   * This persists across page reloads
   */
  storeUserLoginTime(userId: string): void {
    const loginData = {
      userId,
      loginTime: Date.now()
    };
    localStorage.setItem('userLoginTime', JSON.stringify(loginData));
  },

  /**
   * Get user's login time from localStorage
   */
  getUserLoginTime(userId: string): number | null {
    try {
      const stored = localStorage.getItem('userLoginTime');
      if (!stored) return null;

      const data = JSON.parse(stored);
      if (data.userId === userId) {
        return data.loginTime;
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting user login time:', error);
      return null;
    }
  },

  /**
   * Clear user's login time from localStorage
   */
  clearUserLoginTime(): void {
    localStorage.removeItem('userLoginTime');
  }
};
