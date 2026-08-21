/**
 * Session Management Service for Shop Nexa.
 *
 * Tracks real user login sessions in Firestore. Each session records:
 * - Device/browser/OS info (parsed from userAgent)
 * - Login timestamp
 * - Last active timestamp
 * - Session ID (random UUID per browser session)
 *
 * On login, a session record is created. On activity, the lastActive field is updated.
 * On sign-out, the session is marked as revoked.
 *
 * The current device is identified by a per-browser sessionId stored in localStorage.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { getDb } from "./config";

// ---- Types ----

export interface DeviceSession {
  sessionId: string;
  uid: string;
  userAgent: string;
  browser: string;
  os: string;
  platform: string;
  deviceType: string;
  loginAt: number; // ms
  lastActiveAt: number; // ms
  isCurrent: boolean;
}

// ---- Session ID Management ----

const SESSION_ID_KEY = "shopnexa_session_id";

function generateSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "unknown";
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

// ---- UA Parsing ----

interface ParsedUA {
  browser: string;
  os: string;
  platform: string;
  deviceType: string;
}

export function parseUserAgent(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): ParsedUA {
  const result: ParsedUA = {
    browser: "Unknown",
    os: "Unknown",
    platform: "Unknown",
    deviceType: "Desktop",
  };

  if (!ua) return result;

  // Browser detection (order matters — check most specific first)
  if (/Edg\//.test(ua)) result.browser = "Microsoft Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) result.browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) result.browser = "Google Chrome";
  else if (/Firefox\//.test(ua)) result.browser = "Mozilla Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) result.browser = "Safari";
  else if (/MSIE|Trident/.test(ua)) result.browser = "Internet Explorer";

  // OS detection
  if (/Windows NT 10/.test(ua)) result.os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(ua)) result.os = "Windows 8.1";
  else if (/Windows NT 6\.1/.test(ua)) result.os = "Windows 7";
  else if (/Windows/.test(ua)) result.os = "Windows";
  else if (/Mac OS X/.test(ua)) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    result.os = match ? `macOS ${match[1].replace(/_/g, ".")}` : "macOS";
  }
  else if (/Android (\d+)/.test(ua)) {
    const match = ua.match(/Android (\d+)/);
    result.os = match ? `Android ${match[1]}` : "Android";
  }
  else if (/iPhone OS|iOS/.test(ua)) {
    const match = ua.match(/OS (\d+_?\d*)/);
    result.os = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  }
  else if (/CrOS/.test(ua)) result.os = "Chrome OS";
  else if (/Linux/.test(ua)) result.os = "Linux";

  // Platform / Device type
  if (/Mobi|Android|iPhone|iPod/.test(ua)) {
    result.deviceType = "Mobile";
    if (/iPad|Tablet/.test(ua)) result.deviceType = "Tablet";
  } else if (/iPad|Tablet/.test(ua)) {
    result.deviceType = "Tablet";
  } else {
    result.deviceType = "Desktop";
  }

  // Platform
  if (/Win/.test(ua)) result.platform = "Windows";
  else if (/Mac/.test(ua)) result.platform = "macOS";
  else if (/Android/.test(ua)) result.platform = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) result.platform = "iOS";
  else if (/Linux/.test(ua)) result.platform = "Linux";
  else if (/CrOS/.test(ua)) result.platform = "Chrome OS";

  return result;
}

// ---- Firestore Operations ----

function sessionsCollectionRef(uid: string) {
  return collection(getDb(), "users", uid, "sessions");
}

function sessionDocRef(uid: string, sessionId: string) {
  return doc(getDb(), "users", uid, "sessions", sessionId);
}

/**
 * Creates a new session record on login.
 * Called from AuthContext when user signs in.
 */
export async function createSession(uid: string): Promise<void> {
  const sessionId = getSessionId();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const parsed = parseUserAgent(ua);
  const now = Date.now();

  await setDoc(sessionDocRef(uid, sessionId), {
    sessionId,
    uid,
    userAgent: ua,
    browser: parsed.browser,
    os: parsed.os,
    platform: parsed.platform,
    deviceType: parsed.deviceType,
    loginAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Updates lastActiveAt for the current session.
 * Called periodically (e.g. on route change or every few minutes).
 */
export async function updateSessionActivity(uid: string): Promise<void> {
  const sessionId = getSessionId();
  try {
    await updateDoc(sessionDocRef(uid, sessionId), {
      lastActiveAt: serverTimestamp(),
    });
  } catch {
    // Session might not exist yet — create it
    await createSession(uid);
  }
}

/**
 * Lists all active sessions for a user.
 * Marks the current session with isCurrent = true.
 */
export async function getActiveSessions(uid: string): Promise<DeviceSession[]> {
  const sessionId = getSessionId();
  const snap = await getDocs(sessionsCollectionRef(uid));
  const sessions: DeviceSession[] = [];

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    sessions.push({
      sessionId: d.sessionId ?? docSnap.id,
      uid: d.uid ?? uid,
      userAgent: d.userAgent ?? "",
      browser: d.browser ?? "Unknown",
      os: d.os ?? "Unknown",
      platform: d.platform ?? "Unknown",
      deviceType: d.deviceType ?? "Desktop",
      loginAt: d.loginAt instanceof Timestamp ? d.loginAt.toMillis() : typeof d.loginAt === "number" ? d.loginAt : 0,
      lastActiveAt: d.lastActiveAt instanceof Timestamp ? d.lastActiveAt.toMillis() : typeof d.lastActiveAt === "number" ? d.lastActiveAt : 0,
      isCurrent: (d.sessionId ?? docSnap.id) === sessionId,
    });
  });

  // Sort: current session first, then by lastActiveAt descending
  sessions.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return b.lastActiveAt - a.lastActiveAt;
  });

  return sessions;
}

/**
 * Subscribes to real-time session updates.
 * Returns an unsubscribe function.
 */
export function subscribeToSessions(
  uid: string,
  callback: (sessions: DeviceSession[]) => void,
): () => void {
  const sessionId = getSessionId();
  const q = query(sessionsCollectionRef(uid));

  return onSnapshot(q, (snap) => {
    const sessions: DeviceSession[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      sessions.push({
        sessionId: d.sessionId ?? docSnap.id,
        uid: d.uid ?? uid,
        userAgent: d.userAgent ?? "",
        browser: d.browser ?? "Unknown",
        os: d.os ?? "Unknown",
        platform: d.platform ?? "Unknown",
        deviceType: d.deviceType ?? "Desktop",
        loginAt: d.loginAt instanceof Timestamp ? d.loginAt.toMillis() : typeof d.loginAt === "number" ? d.loginAt : 0,
        lastActiveAt: d.lastActiveAt instanceof Timestamp ? d.lastActiveAt.toMillis() : typeof d.lastActiveAt === "number" ? d.lastActiveAt : 0,
        isCurrent: (d.sessionId ?? docSnap.id) === sessionId,
      });
    });

    sessions.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return b.lastActiveAt - a.lastActiveAt;
    });

    callback(sessions);
  });
}

/**
 * Revokes (deletes) a specific session by sessionId.
 * The user on that device will need to sign in again.
 */
export async function revokeSession(uid: string, sessionId: string): Promise<void> {
  await deleteDoc(sessionDocRef(uid, sessionId));
}

/**
 * Revokes all sessions except the current one.
 */
export async function revokeAllOtherSessions(uid: string): Promise<void> {
  const currentSessionId = getSessionId();
  const snap = await getDocs(sessionsCollectionRef(uid));
  const deletes: Promise<void>[] = [];

  snap.forEach((docSnap) => {
    const sid = docSnap.data().sessionId ?? docSnap.id;
    if (sid !== currentSessionId) {
      deletes.push(deleteDoc(docSnap.ref));
    }
  });

  await Promise.all(deletes);
}

/**
 * Removes the current session (called on sign-out).
 */
export async function removeCurrentSession(uid: string): Promise<void> {
  const sessionId = getSessionId();
  try {
    await deleteDoc(sessionDocRef(uid, sessionId));
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_ID_KEY);
  }
}
