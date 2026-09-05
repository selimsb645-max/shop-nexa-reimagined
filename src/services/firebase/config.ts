import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase web config — these are PUBLIC values (safe to ship in client code).
 * Firebase security is enforced via Security Rules, not by hiding these keys.
 * https://firebase.google.com/docs/web/setup#config-object
 */
const firebaseConfig = {
  apiKey: "AIzaSyCjPujDgUn2c1aLKWLMXTsV3rNM3Q2J1wQ",
  authDomain: "studio-6202246915-3b319.firebaseapp.com",
  projectId: "studio-6202246915-3b319",
  storageBucket: "studio-6202246915-3b319.firebasestorage.app",
  messagingSenderId: "763885455427",
  appId: "1:763885455427:web:3bf184751c119a1760ecf6",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

export function getApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Add your Firebase web config to a .env file (see .env.example).",
    );
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    if (typeof window !== "undefined") {
      setPersistence(authInstance, browserLocalPersistence).catch(() => {});
    }
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getApp());
  return dbInstance;
}

export function getStorageBucket(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(getApp());
  return storageInstance;
}

export const googleProvider = new GoogleAuthProvider();
