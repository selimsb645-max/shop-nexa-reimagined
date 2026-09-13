// ═══════════════════════════════════════════════════════════════
// Super Admin Bootstrap Script (Server-Side Only)
// ═══════════════════════════════════════════════════════════════
//
// PURPOSE:
//   One-time, manual procedure to set the FIRST (and only intended)
//   Super Admin account on the Firestore `users/{uid}` document.
//
//   This script uses the Firebase Admin SDK (service account) to
//   bypass Firestore Security Rules and write `role`, `adminRole`,
//   and `blocked` fields directly.
//
// SECURITY:
//   - Requires FIREBASE_SERVICE_ACCOUNT env var (JSON credential)
//   - Requires explicit UID as command-line argument
//   - Verifies the UID exists in Firebase Auth before writing
//   - Prints the user's email for visual verification
//   - Requires interactive confirmation before writing
//   - Does NOT accept email as input (prevents guessing)
//   - Does NOT batch-process multiple UIDs
//   - Does NOT deploy as an API endpoint or function
//   - Is NOT imported by any client-side code
//   - Is NOT accessible from the Admin Panel UI
//
// USAGE (Node.js + firebase-admin):
//   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
//   node scripts/bootstrap-super-admin.js <FIREBASE_UID>
//
//   OR use the Firebase Console method documented in
//   docs/SUPER-ADMIN-BOOTSTRAP.md if you don't want to run scripts.
//
// PREREQUISITES:
//   npm install firebase-admin
//
// AFTER BOOTSTRAP:
//   - The user's Firestore document will have:
//     role: "admin"
//     adminRole: "super_admin"
//     blocked: false
//   - Firestore Security Rules (isSuperAdmin) will recognize this user
//   - The Admin Panel (useIsSuperAdmin hook) will detect the role
//   - No further action needed — the role persists in Firestore
// ═══════════════════════════════════════════════════════════════

const admin = require("firebase-admin");

// ── Validate arguments ──────────────────────────────────────
const uid = process.argv[2];

if (!uid) {
  console.error("\n❌ ERROR: Firebase Auth UID is required.");
  console.error("   Usage: node scripts/bootstrap-super-admin.js <FIREBASE_UID>");
  console.error("   Example: node scripts/bootstrap-super-admin.js abc123xyz789\n");
  process.exit(1);
}

if (uid.length < 20) {
  console.error(
    "\n❌ ERROR: The UID looks too short. Firebase Auth UIDs are typically 28+ characters.",
  );
  console.error("   Please verify the UID from Firebase Console → Authentication → Users.\n");
  process.exit(1);
}

// ── Load service account ────────────────────────────────────
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountJson) {
  console.error("\n❌ ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
  console.error("   Obtain the service account JSON from:");
  console.error(
    "   Firebase Console → Project Settings → Service Accounts → Generate New Private Key\n",
  );
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error("\n❌ ERROR: FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  process.exit(1);
}

if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
  console.error(
    "\n❌ ERROR: Service account JSON is missing required fields (project_id, client_email, private_key).",
  );
  process.exit(1);
}

// ── Initialize Admin SDK ─────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Main bootstrap procedure ─────────────────────────────────
async function bootstrap() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     AVENTA SHOP — Super Admin Bootstrap Procedure    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Step 1: Verify the UID exists in Firebase Auth
  console.log("Step 1: Verifying Firebase Auth user...");
  let userRecord;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch (e) {
    console.error(`\n❌ ERROR: No Firebase Auth user found with UID: ${uid}`);
    console.error("   Verify the UID from Firebase Console → Authentication → Users.\n");
    process.exit(1);
  }

  console.log(`  ✓ User found in Firebase Auth`);
  console.log(`    UID:   ${userRecord.uid}`);
  console.log(`    Email: ${userRecord.email || "(no email)"}`);
  console.log(`    Name:  ${userRecord.displayName || "(no name)"}`);

  // Step 2: Read the existing Firestore user document
  console.log("\nStep 2: Reading existing Firestore user document...");
  const userDocRef = db.collection("users").doc(uid);
  const userDoc = await userDocRef.get();

  if (userDoc.exists) {
    const data = userDoc.data();
    console.log(`  ✓ Document exists`);
    console.log(`    Current role:      ${data.role || "(none)"}`);
    console.log(`    Current adminRole:  ${data.adminRole || "(none)"}`);
    console.log(`    Current blocked:    ${data.blocked ?? "(none)"}`);

    if (data.role === "admin" && data.adminRole === "super_admin") {
      console.log("\n⚠️  WARNING: This user is ALREADY a Super Admin.");
      console.log("   Re-running will overwrite the same values (idempotent).");
    }
  } else {
    console.log(`  ⚠ Document does NOT exist in Firestore yet.`);
    console.log(`    A new document will be created at users/${uid}.`);
  }

  // Step 3: Interactive confirmation
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  The following fields will be SET on this document:  ║");
  console.log("║                                                       ║");
  console.log('║    role:      "admin"                                 ║');
  console.log('║    adminRole:  "super_admin"                           ║');
  console.log("║    blocked:    false                                  ║");
  console.log("║                                                       ║");
  console.log("║  This grants FULL Super Admin access to this user.    ║");
  console.log("║  This action is logged in Firestore server metadata.  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Require interactive confirmation
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(`Type "CONFIRM ${userRecord.email || uid}" to proceed: `, resolve);
  });
  rl.close();

  const expected = `CONFIRM ${userRecord.email || uid}`;
  if (answer.trim() !== expected) {
    console.error("\n❌ Confirmation failed. No changes made.");
    console.error("   You must type the exact confirmation string.\n");
    process.exit(1);
  }

  // Step 4: Write to Firestore
  console.log("\nStep 3: Writing Super Admin fields to Firestore...");

  const writeData = {
    role: "admin",
    adminRole: "super_admin",
    blocked: false,
    // Preserve existing fields if document already exists
    // Only set new admin-related fields
    ...(userDoc.exists
      ? {}
      : {
          // If creating new document, set minimal required fields
          email: userRecord.email || null,
          displayName: userRecord.displayName || null,
          photoURL: userRecord.photoURL || null,
          uid: uid,
          emailVerified: userRecord.emailVerified || false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await userDocRef.set(writeData, { merge: true });

  console.log("  ✓ Super Admin fields written successfully!");
  console.log(`  ✓ Document path: users/${uid}`);
  console.log(`  ✓ role: admin`);
  console.log(`  ✓ adminRole: super_admin`);
  console.log(`  ✓ blocked: false`);

  // Step 5: Verify the write
  console.log("\nStep 4: Verifying written data...");
  const verifyDoc = await userDocRef.get();
  const verifyData = verifyDoc.data();

  if (
    verifyData.role === "admin" &&
    verifyData.adminRole === "super_admin" &&
    verifyData.blocked === false
  ) {
    console.log("  ✓ Verification PASSED — all fields correct.\n");
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║  ✅ Super Admin Bootstrap COMPLETE                    ║");
    console.log("║                                                       ║");
    console.log("║  The user can now sign in to the Admin Panel and       ║");
    console.log("║  will be recognized as a Super Admin.                 ║");
    console.log("║                                                       ║");
    console.log("║  Firestore Security Rules (isSuperAdmin) will         ║");
    console.log("║  enforce this identity server-side for all            ║");
    console.log("║  super-admin-only operations.                         ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");
  } else {
    console.error("\n❌ ERROR: Verification FAILED!");
    console.error("   Written data does not match expected values.");
    console.error(`   role: ${verifyData.role} (expected: admin)`);
    console.error(`   adminRole: ${verifyData.adminRole} (expected: super_admin)`);
    console.error(`   blocked: ${verifyData.blocked} (expected: false)\n`);
    process.exit(1);
  }

  // Clean up
  await admin.app().delete();
}

bootstrap().catch((err) => {
  console.error("\n❌ FATAL ERROR:", err.message);
  process.exit(1);
});
