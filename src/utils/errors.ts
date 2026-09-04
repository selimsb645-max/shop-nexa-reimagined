/**
 * Maps Firebase error codes to user-friendly messages.
 * Falls back to the raw error message if the code is not recognized.
 */

interface FirebaseErrorLike {
  code?: string;
  message?: string;
}

const ERROR_MAP: Record<string, string> = {
  // Auth errors
  "auth/invalid-email": "Invalid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user": "Sign-in popup was closed before completing.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/operation-not-allowed": "This operation is not allowed.",
  "auth/requires-recent-login": "Please sign in again before retrying this action.",
  "auth/invalid-verification-code": "Invalid verification code.",
  "auth/missing-verification-code": "Verification code is missing.",
  // Firestore errors
  "permission-denied": "You don't have permission to perform this action.",
  "not-found": "The requested resource was not found.",
  "already-exists": "This item already exists.",
  "resource-exhausted": "Resource limits exceeded. Please try again later.",
  unauthenticated: "Please sign in to continue.",
  unavailable: "Service temporarily unavailable. Please try again.",
  "deadline-exceeded": "Request timed out. Please try again.",
  // Storage errors
  "storage/object-not-found": "File not found.",
  "storage/unauthorized": "You don't have permission to access this file.",
  "storage/canceled": "Upload was cancelled.",
  "storage/unknown": "An unknown storage error occurred.",
};

export function mapFirebaseError(err: unknown): string {
  if (!err) return "An unknown error occurred.";

  const firebaseErr = err as FirebaseErrorLike;
  if (firebaseErr.code && ERROR_MAP[firebaseErr.code]) {
    return ERROR_MAP[firebaseErr.code];
  }

  if (firebaseErr.message) {
    return firebaseErr.message;
  }

  return "Something went wrong. Please try again.";
}
