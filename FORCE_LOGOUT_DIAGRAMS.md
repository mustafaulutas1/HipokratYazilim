# Force Logout Flow Diagram

## Scenario 1: Active User (Real-time Logout)

```
┌─────────────────┐
│  Admin Panel    │
│  Click Button   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Firestore: system/forceLogout  │
│  {                              │
│    timestamp: NOW               │
│    version: 5                   │
│  }                              │
└────────┬────────────────────────┘
         │ (Real-time listener)
         ▼
┌─────────────────────────────────┐
│  User's Browser (Active)        │
│  - Real-time listener fires     │
│  - Compares timestamp           │
│  - Session started before NOW?  │
│  - YES → LOGOUT!                │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Login Page     │
│  (Redirect)     │
└─────────────────┘
```

## Scenario 2: Offline User (Deferred Logout)

```
DAY 1:
┌─────────────────┐
│  User Logs In   │
│  (Chrome)       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  localStorage:                  │
│  userLoginTime: {               │
│    userId: "abc123"             │
│    loginTime: 1000              │ ← Stored
│  }                              │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  User Closes    │
│  Browser        │
└─────────────────┘

DAY 2:
┌─────────────────┐
│  Admin Panel    │
│  Click Button   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Firestore: system/forceLogout  │
│  {                              │
│    timestamp: 2000              │ ← New timestamp
│    version: 5                   │
│  }                              │
└─────────────────────────────────┘

DAY 3:
┌─────────────────┐
│  User Opens     │
│  Chrome Again   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  App Initialization             │
│  1. Read localStorage           │
│     loginTime: 1000             │
│  2. Read Firestore              │
│     forceLogout: 2000           │
│  3. Compare: 2000 > 1000?       │
│  4. YES → LOGOUT!               │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Login Page     │
│  (Redirect)     │
└─────────────────┘
```

## Timeline Visualization

```
Timeline:
─────────────────────────────────────────────────────────►

User A logs in
    │
    ▼
    1000ms
    │
    │    User B logs in
    │         │
    │         ▼
    │         1500ms
    │         │
    │         │    FORCE LOGOUT TRIGGERED
    │         │              │
    │         │              ▼
    │         │              2000ms ← Force Logout Timestamp
    │         │              │
    ├─────────┼──────────────┤
    │         │              │
    │         │              │
    ▼         ▼              ▼
User A        User B         Users C, D, E
LOGGED OUT    LOGGED OUT     (login after 2000ms)
(1000<2000)   (1500<2000)    NOT AFFECTED ✓
```

## Data Flow Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌────────────────┐        ┌──────────────────┐     │
│  │  Landing Page  │───────▶│  forceLogout     │     │
│  │  (UI Button)   │        │  Service         │     │
│  └────────────────┘        └─────────┬────────┘     │
│                                       │              │
│  ┌────────────────┐                  │              │
│  │  AuthContext   │◀─────────────────┘              │
│  │  - Session     │                                  │
│  │  - Listeners   │                                  │
│  └────────┬───────┘                                  │
│           │                                           │
└───────────┼───────────────────────────────────────────┘
            │
            │ Firebase SDK
            │
┌───────────┼───────────────────────────────────────────┐
│           │          Firebase Backend                 │
├───────────┼───────────────────────────────────────────┤
│           │                                            │
│  ┌────────▼─────────┐         ┌──────────────┐       │
│  │   Firestore      │         │  localStorage │       │
│  │  system/         │         │  (Browser)    │       │
│  │  forceLogout     │         │               │       │
│  │  {               │         │  userLoginTime│       │
│  │   timestamp,     │         │  {            │       │
│  │   version        │         │   loginTime   │       │
│  │  }               │         │  }            │       │
│  └──────────────────┘         └──────────────┘       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## State Machine

```
                    ┌─────────────┐
                    │   Logged    │
            ┌──────▶│     Out     │◀──────┐
            │       └─────────────┘       │
            │                              │
    Force   │                              │ User
    Logout  │                              │ Logs In
    Trigger │                              │
            │                              │
            │       ┌─────────────┐        │
            │       │   Logged    │        │
            └───────│     In      │────────┘
                    │             │
                    └──────┬──────┘
                           │
                           │ Store loginTime
                           │ in localStorage
                           │
                    ┌──────▼──────┐
                    │  Check on   │
                    │  Init:      │
                    │  forceLogout│
                    │  > loginTime│
                    │  ?          │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │             │
                YES │             │ NO
                    │             │
            ┌───────▼─┐       ┌───▼────┐
            │ LOGOUT  │       │ ALLOW  │
            │         │       │ ACCESS │
            └─────────┘       └────────┘
```

## Multi-Device Scenario

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  Desktop       │  │  Mobile        │  │  Tablet        │
│  Chrome        │  │  Safari        │  │  Firefox       │
│                │  │                │  │                │
│  User logged   │  │  User logged   │  │  User logged   │
│  in @ 1000ms   │  │  in @ 1200ms   │  │  in @ 1400ms   │
│                │  │                │  │                │
│  localStorage: │  │  localStorage: │  │  localStorage: │
│  {loginTime:   │  │  {loginTime:   │  │  {loginTime:   │
│   1000}        │  │   1200}        │  │   1400}        │
└───────┬────────┘  └───────┬────────┘  └───────┬────────┘
        │                   │                   │
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                    ┌───────▼────────┐
                    │ FORCE LOGOUT   │
                    │ @ 2000ms       │
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│ Desktop        │  │ Mobile         │  │ Tablet         │
│ 1000 < 2000    │  │ 1200 < 2000    │  │ 1400 < 2000    │
│ ✓ LOGGED OUT   │  │ ✓ LOGGED OUT   │  │ ✓ LOGGED OUT   │
└────────────────┘  └────────────────┘  └────────────────┘

ALL DEVICES LOGGED OUT ✓
```
