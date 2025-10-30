import { db } from '../firebase/config';
import { doc, setDoc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';

const FORCE_LOGOUT_DOC = 'system/forceLogout';

export interface ForceLogoutData {
  timestamp: Timestamp;
  triggeredBy?: string;
  reason?: string;
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
      const data: ForceLogoutData = {
        timestamp: Timestamp.now(),
        triggeredBy,
        reason
      };
      
      await setDoc(forceLogoutRef, data);
      console.log('✅ Force logout triggered successfully');
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
  }
};
