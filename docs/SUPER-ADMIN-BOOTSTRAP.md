# Super Admin Bootstrap Procedure

## Overview

This document describes the secure, one-time, manual procedure to set
the first (and only intended) Super Admin account on the Aventa Shop /
Shop Nexa Firebase/Firestore system.

## Prerequisites

1. A Firebase project with Authentication and Firestore enabled.
2. At least one authenticated user (via Google Sign-In or email/password)
   who should become the Super Admin.
3. The user's **Firebase Auth UID** (NOT the email — we never hard-code emails).
4. Firebase project Owner or Editor role (to perform Console operations).

## Security Principles

- **No email is hard-coded** in source code or rules.
- **No public API endpoint or UI button** exists to perform this operation.
- **No client-side code** can self-promote to Super Admin.
- **Firestore Security Rules** (Step 6) prevent privilege escalation:
  - `users/{uid}` create: cannot self-assign `adminRole` at signup.
  - `users/{uid}` self-update: cannot change `adminRole` field.
  - `users/{uid}` admin-update: only `isSuperAdmin()` can modify other users.
  - `users/{uid}` delete: only `isSuperAdmin()` can delete users.
  - `settings/{id}` write: only `isSuperAdmin()` can edit global settings.
  - `sellers/{uid}` delete: only `isSuperAdmin()` can delete sellers.
- **Service-account credentials** are NEVER stored in client code or
  committed to the repository. They are provided via environment
  variables only when running the server-side script.

---

## Method 1: Firebase Console (Recommended — No Scripts)

This is the simplest and most secure method. No code execution required.

### Step 1: Get the User's Firebase Auth UID

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Select your project (Aventa Shop / Shop Nexa).
3. Navigate to **Authentication** → **Users**.
4. Find the user who should become the Super Admin.
5. Copy their **User UID** (the long alphanumeric string, e.g., `abc123XYZ456...`).

### Step 2: Open the Firestore User Document

1. Navigate to **Firestore Database** → **Data**.
2. Open the `users` collection.
3. Find (or create) the document with the same UID as the Auth user.
   - If the document already exists (from Google Sign-In), open it.
   - If it does NOT exist, create a new document with the UID as the Document ID.

### Step 3: Set the Required Fields

Add or update the following fields on the user document:

| Field        | Value          | Type    |
|--------------|----------------|---------|
| `role`       | `admin`        | String  |
| `adminRole`  | `super_admin`  | String  |
| `blocked`    | `false`        | Boolean |

### Step 4: Verify

After saving, the user should:
1. Sign out and sign back in to the Admin Panel.
2. The Dashboard will show "Super Admin Status: ✓ You are a Super Admin".
3. SuperAdminGate components will now show super-admin-only content.

---

## Method 2: Server-Side Script (For Automation)

Use this method if you prefer command-line operations.

### Prerequisites

```bash
npm install firebase-admin
```

### Steps

1. **Download the Service Account Key**:
   - Firebase Console → Project Settings → Service Accounts →
     Generate New Private Key → Save the JSON file securely.
   - **NEVER commit this file to git.** Add it to `.gitignore`.

2. **Run the Bootstrap Script**:

```bash
# Set the service account as an environment variable
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Run the script with the target UID
node scripts/bootstrap-super-admin.js <FIREBASE_AUTH_UID>
```

3. **Confirm the Operation**:
   The script will:
   - Verify the UID exists in Firebase Auth.
   - Print the user's email for visual verification.
   - Ask you to type `CONFIRM <email>` to proceed.
   - Write the Super Admin fields to Firestore.
   - Verify the written data.

4. **Clean Up**:
   - Unset the environment variable: `unset FIREBASE_SERVICE_ACCOUNT`
   - Delete the service account JSON file if no longer needed.

### Script Safety Features

- Requires explicit UID as command-line argument (no email guessing).
- Verifies UID exists in Firebase Auth before writing.
- Prints user email for visual confirmation.
- Requires interactive `CONFIRM <email>` string before writing.
- Does NOT accept email as input (only UID).
- Does NOT batch-process multiple UIDs.
- Is NOT deployed as an API endpoint or Cloud Function.
- Is NOT imported by any client-side code.

---

## Post-Bootstrap Verification

After completing the bootstrap, verify the following:

### Admin Panel

1. The user signs in to the Admin Panel.
2. The Dashboard shows:
   - Admin Profile: role = "admin", adminRole = "super_admin"
   - Super Admin Status: ✓ You are a Super Admin
   - SuperAdminGate demo: Super Admin Control Panel visible
3. All permission checks pass (30 permissions for super_admin).

### Firestore Rules

1. The user can write to `settings/{id}` (isSuperAdmin check passes).
2. The user can update other users' profiles (isSuperAdmin check passes).
3. The user can delete users and sellers (isSuperAdmin check passes).
4. Other admin roles (admin, finance_admin, etc.) CANNOT perform these operations.
5. Blocked admins CANNOT perform any admin operations.

### Self-Promotion Prevention

1. A regular customer signs in and tries to update their own document
   with `adminRole: "super_admin"` → DENIED by Firestore rules.
2. A seller tries to set `role: "admin"` on their own document → DENIED.
3. A regular admin tries to update another user's `adminRole` → DENIED
   (only isSuperAdmin can modify other users).

---

## Important Notes

- This is a **one-time** procedure. Once the Super Admin is bootstrapped,
  they can perform all super-admin operations through the Admin Panel.
- **Do NOT** create a public route, API endpoint, or UI button for this.
- **Do NOT** store the service account credential in client code.
- **Do NOT** hard-code any email address in source code.
- The Super Admin identity is determined **solely** by the Firestore
  `users/{uid}` document's `adminRole` field — no other mechanism.
- To revoke Super Admin access, set `blocked: true` on the user document
  via Firebase Console. The `isSuperAdmin()` rule checks this field.
- To change a Super Admin to a different admin role, update the
  `adminRole` field via Firebase Console (the existing Super Admin
  can also do this through server-side operations, but there is no
  UI for this in the current Admin Panel).
