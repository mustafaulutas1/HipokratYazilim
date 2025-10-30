# Force Logout All Users - Implementation Guide

## Overview
This implementation allows you to sign out **ALL authenticated users** from all their devices, **including users who are offline** at the time of the force logout.

## How It Works

### Two-Layer Approach

#### Layer 1: Real-time Logout (Active Users)
- Monitors the `system/forceLogout` Firestore document in real-time
- Users actively using the app are immediately logged out
- Works within seconds of triggering the force logout

#### Layer 2: Deferred Logout (Offline Users)
- Stores user login time in localStorage
- On next app initialization, checks if force logout occurred after their login
- Users who were offline are logged out when they return
- **This ensures 100% coverage of all users**

### 1. Force Logout Service (`src/services/forceLogoutService.ts`)
- Creates a Firestore document at `system/forceLogout` with timestamp and version
- Incremental version numbering to track multiple force logout events
- Stores login times in localStorage for persistence across sessions
- Provides both real-time and initialization checks

### 2. Auth Context Integration (`src/context/AuthContext.tsx`)
- **On Login**: Stores user's login timestamp in localStorage
- **On Init**: Checks if force logout occurred after user's last login
- **Real-time**: Monitors for force logout events during active session
- **On Logout**: Clears all stored session data

### 3. UI Button (`src/pages/Landingpage.tsx`)
- Fixed button at the top-right of the landing page
- Triggers the force logout when clicked
- Shows loading state during the operation
- Requires confirmation before executing

## Firebase Setup Required

### Firestore Security Rules
Add this to your Firestore security rules to allow the force logout system:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ... your existing rules ...
    
    // System collection for force logout
    match /system/{document} {
      // Allow all authenticated users to read
      allow read: if request.auth != null;
      
      // Only allow admins or specific users to write
      // Option 1: Allow any authenticated user (less secure)
      allow write: if request.auth != null;
      
      // Option 2: Only allow specific admin emails (more secure)
      // allow write: if request.auth != null && 
      //   request.auth.token.email in ['admin@example.com', 'another-admin@example.com'];
      
      // Option 3: Check if user has admin role in their profile
      // allow write: if request.auth != null && 
      //   get(/databases/$(database)/documents/doctors/$(request.auth.uid)).data.userType == 'admin';
    }
  }
}
```

Choose one of the write permission options based on your security requirements.

## Usage

### Triggering Force Logout
1. Navigate to the landing page
2. Click the "🚪 Sign Out All Users" button at the top-right
3. Confirm the action in the dialog
4. All authenticated users will be immediately logged out

### Programmatic Usage
You can also trigger force logout programmatically:

```typescript
import { forceLogoutService } from '../services/forceLogoutService';

// Trigger force logout
await forceLogoutService.triggerForceLogout(
  'admin@example.com',  // Who triggered it
  'Security update'      // Reason
);
```

## Security Considerations

1. **Access Control**: Update Firestore rules to restrict who can trigger force logout
2. **Logging**: All force logout events are logged with timestamp, trigger user, and reason
3. **Session Tracking**: Each user's session start time is tracked to prevent false positives
4. **Real-time Monitoring**: Uses Firestore real-time listeners for immediate response

## Behavior Details

### When Force Logout is Triggered:
- ✅ Users **actively online** will be signed out **immediately** (within seconds)
- ✅ Users **offline** will be signed out **when they next open the app**
- ✅ Users will be signed out across **all devices** (browser, mobile, etc.)
- ✅ Session storage and local storage are cleared
- ✅ User action logs are recorded
- ✅ Works even if users close browser and come back days later
- ❌ Users who login **after** the trigger are NOT affected (fresh sessions)

### Technical Flow:

**Scenario 1: User is Online**
1. Admin clicks "Sign Out All Users"
2. Firestore document updated
3. Real-time listener detects change
4. User logged out immediately
5. Redirect to login page

**Scenario 2: User is Offline**
1. Admin clicks "Sign Out All Users" (user offline)
2. Firestore document updated
3. User comes back hours/days later
4. App initializes, checks force logout timestamp
5. Compares with user's stored login time
6. If login was before force logout → user logged out
7. Redirect to login page

### User Experience:
- **Active users**: Immediately redirected to login page
- **Offline users**: Logged out on next app open
- Session data is completely cleared
- No error messages shown (silent logout)
- Users can login again immediately after
- Previous login timestamp is cleared on logout

## Testing

### Test the Implementation:

#### Test 1: Active Users (Real-time Logout)
1. Open the app in multiple browsers/tabs
2. Login with different accounts in each
3. Keep all tabs open and active
4. Click "Sign Out All Users" in one tab
5. ✅ Verify all tabs are logged out within seconds

#### Test 2: Offline Users (Deferred Logout)
1. Login to the app in a browser
2. Note the time or leave the browser tab open
3. Close the browser completely (or go offline)
4. From another device/browser, login as admin
5. Click "Sign Out All Users"
6. Wait a few seconds for Firestore to update
7. Go back to the first browser and open the app
8. ✅ Verify user is immediately logged out on initialization

#### Test 3: Multiple Force Logout Events
1. Login with several users
2. Trigger force logout (version 1)
3. Login with new users
4. Trigger force logout again (version 2)
5. ✅ Verify version increments correctly
6. ✅ Verify old users stay logged out
7. ✅ Verify new users are logged out

#### Test 4: Cross-Device
1. Login on desktop browser
2. Login on mobile browser (same user)
3. Close mobile browser
4. Trigger force logout from desktop
5. ✅ Desktop logs out immediately
6. Reopen mobile browser
7. ✅ Mobile logs out on initialization

### Check Firestore:
- Navigate to Firebase Console > Firestore
- Check the `system/forceLogout` document
- Verify timestamp updates when triggered
- Verify version increments with each trigger

### Check localStorage:
- Open browser DevTools > Application > Local Storage
- Look for `userLoginTime` key
- Verify it stores userId and loginTime
- Verify it's cleared on logout

## Troubleshooting

### Active Users Not Logging Out:
- Check Firestore security rules allow read access to `system/forceLogout`
- Verify the document exists in Firestore
- Check browser console for errors
- Ensure real-time listeners are active
- Check network tab for Firestore connections

### Offline Users Not Logging Out:
- Open browser DevTools > Application > Local Storage
- Verify `userLoginTime` exists with correct userId
- Check browser console on app initialization
- Verify force logout timestamp is after login timestamp
- Clear cache and try again

### Button Not Working:
- Check Firestore security rules allow write access
- Verify Firebase connection in console
- Check for JavaScript errors in console
- Ensure user has proper permissions
- Verify Firestore document path is correct

### Users Can Still Access After Force Logout:
- Check if they logged in AFTER force logout (fresh session)
- Verify localStorage wasn't manually cleared
- Check if `shouldLogoutOnInit` is being called
- Verify timestamp comparison logic
- Check Firestore document version increments

### localStorage Not Persisting:
- Check browser privacy settings
- Verify not in incognito/private mode
- Check if localStorage is enabled
- Verify domain is consistent (no subdomain issues)

## Alternative Approaches

If you need more control, consider:

1. **Firebase Admin SDK**: Revoke refresh tokens server-side
2. **Custom Claims**: Update user claims to mark sessions as invalid
3. **Database Triggers**: Use Cloud Functions to automate the process
4. **Session IDs**: Track and invalidate specific session IDs

## Production Recommendations

1. **Move the button to an admin-only page/panel** - Not on public landing page
2. **Implement role-based access control** - Only specific admins can trigger
3. **Add audit logging** for all force logout events with who/when/why
4. **Send notifications to users** when they're forcibly logged out (optional)
5. **Add confirmation dialog** with reason input (already has basic confirm)
6. **Implement a whitelist** for critical admin accounts (if needed)
7. **Add rate limiting** to prevent accidental multiple triggers
8. **Monitor localStorage size** - clear old data periodically
9. **Add analytics** to track force logout effectiveness
10. **Document the process** for your team's standard operating procedures

## Data Storage

### Firestore Document Structure:
```
system/forceLogout
{
  timestamp: Timestamp,
  triggeredBy: "admin@example.com",
  reason: "Security update",
  version: 5
}
```

### localStorage Structure:
```javascript
// User login time
userLoginTime: {
  userId: "abc123",
  loginTime: 1698745200000
}

// Force logout check (optional, for caching)
lastForceLogoutCheck: {
  timestamp: 1698745200000,
  version: 5
}
```

## Notes

- ✅ **Works for ALL users** - both online and offline
- ✅ **Persists across page reloads** - uses localStorage
- ✅ **No server required** - fully client-side implementation
- ✅ **Version tracking** - incremental version numbers
- ⚠️ **Client-side reliance** - users can clear localStorage (then they'd need to login again anyway)
- ⚠️ **Browser-specific** - localStorage is per-browser/device
- 💡 **Consider server-side** for enterprise environments (Firebase Admin SDK + Cloud Functions)
- 💡 **The button is on landing page for demo** - move to admin panel in production

## Limitations & Considerations

1. **localStorage can be cleared** - Users clearing browser data will bypass the check, but they'll need to login again anyway
2. **Cross-browser** - Login time is browser-specific, so users need to be logged out on each browser separately (this is actually desired behavior)
3. **Race conditions** - Very rare edge case if user logs in exactly when force logout is triggered
4. **No server enforcement** - This is client-side only. For maximum security, consider Firebase Admin SDK

## Alternative Server-Side Approach

For enterprise requirements, consider implementing with Firebase Cloud Functions:

```javascript
// Cloud Function to revoke all refresh tokens
admin.auth().getUsers().then(userRecords => {
  userRecords.users.forEach(user => {
    admin.auth().revokeRefreshTokens(user.uid);
  });
});
```

This requires Firebase Blaze plan and backend infrastructure.
