import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
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
        ? `${window.location.origin}/login`
        : "https://shopnexa.app/login",
  });
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFirebaseAuth());
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
