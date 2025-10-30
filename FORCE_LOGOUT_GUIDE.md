# Force Logout All Users - Implementation Guide

## Overview
This implementation allows you to sign out all authenticated users from all their devices with a single button click.

## How It Works

### 1. Force Logout Service (`src/services/forceLogoutService.ts`)
- Creates a Firestore document at `system/forceLogout` with a timestamp
- All clients listen to this document for changes
- When the timestamp is updated, clients check if they should logout

### 2. Auth Context Integration (`src/context/AuthContext.tsx`)
- Monitors the `system/forceLogout` document in real-time
- Compares the force logout timestamp with the user's session start time
- Automatically logs out users if force logout was triggered after their session started
- Tracks session start time in component state

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
- ✅ Users logged in **before** the trigger will be signed out
- ✅ Users will be signed out across **all devices**
- ✅ Session storage and local storage are cleared
- ✅ User action logs are recorded
- ❌ Users who login **after** the trigger are NOT affected

### User Experience:
- Users are immediately redirected to the login page
- Session data is cleared
- No error messages are shown (silent logout)
- Users can login again immediately after

## Testing

### Test the Implementation:
1. Open the app in multiple browsers/tabs
2. Login with different accounts
3. Click "Sign Out All Users"
4. Verify all sessions are terminated
5. Verify new logins work correctly

### Check Firestore:
- Navigate to Firebase Console > Firestore
- Check the `system/forceLogout` document
- Verify timestamp updates when triggered

## Troubleshooting

### Users Not Logging Out:
- Check Firestore security rules allow read access
- Verify the `system/forceLogout` document exists
- Check browser console for errors
- Ensure real-time listeners are active

### Button Not Working:
- Check Firestore security rules allow write access
- Verify Firebase connection
- Check browser console for errors
- Ensure user has proper permissions

## Alternative Approaches

If you need more control, consider:

1. **Firebase Admin SDK**: Revoke refresh tokens server-side
2. **Custom Claims**: Update user claims to mark sessions as invalid
3. **Database Triggers**: Use Cloud Functions to automate the process
4. **Session IDs**: Track and invalidate specific session IDs

## Production Recommendations

1. Move the button to an admin-only page/panel
2. Implement role-based access control
3. Add audit logging for all force logout events
4. Send notifications to users when they're logged out
5. Add a "grace period" before forcing logout
6. Implement a whitelist for critical admin accounts

## Notes

- This is a client-side implementation that relies on active connections
- Users who are offline won't be logged out until they reconnect
- Consider server-side implementation for maximum security
- The button is currently on the landing page for demo purposes - move it to an appropriate admin area
