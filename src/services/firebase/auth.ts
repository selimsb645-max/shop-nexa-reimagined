import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword as fbUpdatePassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "./config";

/**
 * Resolves once Firebase has hydrated the auth state with a signed-in user.
 * Prevents redirecting before AuthContext's onAuthStateChanged has fired.
 */
export function waitForAuthUser(timeoutMs = 8000): Promise<User> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("Timed out waiting for authentication"));
    }, timeoutMs);
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        if (u) {
          clearTimeout(timer);
          unsub();
          resolve(u);
        }
      },
      (err) => {
        clearTimeout(timer);
        unsub();
        reject(err);
      },
    );
  });
}
import { ensureUserProfile, updateUserProfile } from "./firestore";

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await fbUpdateProfile(cred.user, { displayName });
  await ensureUserProfile(cred.user);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email, {
    url:
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : "https://aventa-shop.com/reset-password",
  });
}

/**
 * Verify a Firebase password-reset action code and return the email address
 * it was issued for. Throws if the code is invalid, expired, or already used.
 */
export async function verifyResetCode(code: string): Promise<string> {
  const auth = getFirebaseAuth();
  return await verifyPasswordResetCode(auth, code);
}

/**
 * Complete the password reset by confirming a new password with Firebase.
 * Throws on failure (e.g. weak password or invalid code).
 */
export async function completePasswordReset(code: string, newPassword: string): Promise<void> {
  const auth = getFirebaseAuth();
  await confirmPasswordReset(auth, code, newPassword);
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (uid) {
    const { removeCurrentSession } = await import("./sessions");
    await removeCurrentSession(uid).catch(() => {});
  }
  await fbSignOut(auth);
}

export async function resendVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function setDisplayName(user: User, displayName: string): Promise<void> {
  await fbUpdateProfile(user, { displayName });
  await updateUserProfile(user.uid, { displayName });
}

export async function setPhotoURL(user: User, photoURL: string): Promise<void> {
  await fbUpdateProfile(user, { photoURL });
  await updateUserProfile(user.uid, { photoURL });
}

/**
 * Change the signed-in user's password. Requires recent-login re-authentication
 * with the current password; Firebase rejects weak passwords (< 6 chars).
 */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const credential = EmailAuthProvider.credential(user.email ?? "", currentPassword);
  await reauthenticateWithCredential(user, credential);
  await fbUpdatePassword(user, newPassword);
}
