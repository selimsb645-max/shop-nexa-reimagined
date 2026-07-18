import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "./config";
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
