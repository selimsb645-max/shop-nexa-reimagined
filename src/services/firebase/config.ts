import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  GoogleAuthProvider,
  connectAuthEmulator,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase web config — these are PUBLIC values (safe to ship in client code).
 * Firebase security is enforced via Security Rules, not by hiding these keys.
 * https://firebase.google.com/docs/web/setup#config-object
 */
const firebaseConfig = {
  apiKey: "AIzaSyCjPujDgUn2c1aLKWLMXTsV3rNM3Q2J1wQ",
  authDomain: "studio-6202246915-3b319.firebaseapp.com",
  projectId: "studio-6202246915-3b319",
  messagingSenderId: "763885455427",
  appId: "1:763885455427:web:3bf184751c119a1760ecf6",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

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
    // Dev-only: point the SDK at local Firebase emulators when explicitly
    // requested (never active in production builds unless env is set).
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
      connectAuthEmulator(authInstance, "http://localhost:9099", { disableWarnings: true });
    }
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getApp());
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
      try {
        connectFirestoreEmulator(dbInstance, "localhost", 8080);
      } catch {
        // already connected (hot reload)
      }
    }
  }
  return dbInstance;
}

export const googleProvider = new GoogleAuthProvider();
