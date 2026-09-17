// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Customer Support Chat (customer side, server core)
// ═══════════════════════════════════════════════════════════════
// Pairs with the Aventa Admin Hub /chats console (supportChats/
// {chatId} + messages subcollection, service-role REST on BOTH
// sides — client Firestore rules stay deny-all).
//
// Thread id: `chat_{uid}` — one continuous conversation per
// customer. SECURITY: every call verifies the caller's Firebase ID
// token (customer identity is the authorization — uid is derived
// server-side from the token, never accepted from the client);
// message text sanitized (control chars stripped, whitespace
// collapsed, 1000-char cap); best-effort Firestore fixed-window
// rate limits per uid; message + thread update written in ONE
// atomic commit so previews can never desync.
// ═══════════════════════════════════════════════════════════════

import {
  verifyIdToken,
  getProjectId,
  getAccessToken,
  docPath,
  batchGetDocs,
  commitWrites,
  toFsFields,
  toFsValue,
  newDocId,
  type FsValue,
} from "./firebase-admin.server";

export function sanitizeChatText(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 1000)
  );
}

function baseUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

interface Message {
  id: string;
  sender: "customer" | "admin";
  senderName: string;
  text: string;
  createdAt: number;
}

interface ThreadSummary {
  id: string;
  status: "open" | "resolved";
  unreadByCustomer: boolean;
  lastMessageAt: number;
}

/** Best-effort fixed-window rate limit (Firestore counter per key). */
async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const projectId = getProjectId();
    const token = await getAccessToken();
    const now = Date.now();
    const path = `${baseUrl(projectId)}/rateLimits/${encodeURIComponent(key)}`;
    const res = await fetch(path, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const doc = await res.json();
      const fields = doc?.fields ?? {};
      const windowStart = Number(fields.windowStart?.integerValue ?? 0);
      const count = Number(fields.count?.integerValue ?? 0);
      if (now - windowStart < windowMs) {
        if (count >= limit) return false;
        await fetch(`${path}?updateMask.fieldPaths=count`, {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            fields: { count: { integerValue: String(count + 1) } },
          }),
        });
        return true;
      }
    }
    // new window (doc missing or expired)
    await fetch(`${baseUrl(projectId)}/rateLimits?documentId=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: { windowStart: { integerValue: String(now) }, count: { integerValue: "1" } },
      }),
    });
    return true;
  } catch {
    // infra failure fails OPEN: token verification still guards every call
    return true;
  }
}

interface CustomerCtx {
  uid: string;
  chatId: string;
  projectId: string;
}

async function requireCustomer(idToken: string): Promise<CustomerCtx> {
  const { uid } = await verifyIdToken(idToken);
  if (!uid || !/^[A-Za-z0-9:_.-]+$/.test(uid)) throw new Error("chat/invalid-uid");
  return { uid, chatId: `chat_${uid}`, projectId: getProjectId() };
}

async function readThread(
  ctx: CustomerCtx,
): Promise<{ exists: boolean; fields: Record<string, unknown> }> {
  const docs = await batchGetDocs(ctx.projectId, [
    docPath(ctx.projectId, ["supportChats", ctx.chatId]),
  ]);
  const doc = docs.get(docPath(ctx.projectId, ["supportChats", ctx.chatId]));
  return doc?.exists ? { exists: true, fields: doc.data } : { exists: false, fields: {} };
}

/** Create the thread doc if missing, seeded from the customer's profile. */
async function ensureThread(ctx: CustomerCtx): Promise<void> {
  const thread = await readThread(ctx);
  if (thread.exists) return;

  // Customer profile info for the admin-side roster (best-effort)
  let displayName: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  try {
    const docs = await batchGetDocs(ctx.projectId, [docPath(ctx.projectId, ["users", ctx.uid])]);
    const u = docs.get(docPath(ctx.projectId, ["users", ctx.uid]));
    if (u?.exists) {
      displayName = (u.data.displayName as string) ?? null;
      phone = (u.data.phone as string) ?? (u.data.phoneNumber as string) ?? null;
      email = (u.data.email as string) ?? null;
    }
  } catch {
    /* profile is optional metadata */
  }

  const now = Date.now();
  await commitWrites(ctx.projectId, [
    {
      // exists precondition → concurrent widgets can't create twice
      update: {
        name: docPath(ctx.projectId, ["supportChats", ctx.chatId]),
        fields: toFsFields({
          customerUid: ctx.uid,
          customerName: displayName ?? "Customer",
          customerPhone: phone,
          customerEmail: email,
          status: "open",
          lastMessage: "",
          lastMessageAt: now,
          lastSender: "customer",
          unreadByAdmin: false,
          unreadByCustomer: false,
          createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
}

// ── Full chat fetch: summary + last 100 messages (clears unread) ─
export async function getSupportChatServer(idToken: string): Promise<{
  thread: ThreadSummary;
  messages: Message[];
}> {
  const ctx = await requireCustomer(idToken);
  if (!(await rateLimit(`supchat-read:${ctx.uid}`, 60, 60_000))) {
    throw new Error("Rate limit exceeded. Please wait a moment.");
  }
  await ensureThread(ctx);

  const token = await getAccessToken();
  const msgsRes = await fetch(
    `${baseUrl(ctx.projectId)}/supportChats/${encodeURIComponent(ctx.chatId)}/messages?pageSize=100&orderBy=createdAt&sortDirection=ASCENDING`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!msgsRes.ok) throw new Error("chat/query-failed");
  const docs =
    (
      (await msgsRes.json()) as {
        documents?: { name?: string; fields?: Record<string, unknown> }[];
      }
    ).documents ?? [];
  const messages: Message[] = docs
    .filter((d) => d.fields)
    .map((d) => {
      const f = d.fields as Record<string, FsValue>;
      return {
        id: (d.name ?? "").split("/").pop() as string,
        sender: f.sender?.stringValue === "admin" ? ("admin" as const) : ("customer" as const),
        senderName: (f.senderName?.stringValue as string) ?? "",
        text: (f.text?.stringValue as string) ?? "",
        createdAt: Number(f.createdAt?.integerValue ?? 0),
      };
    });

  const thread = await readThread(ctx);
  const unread = thread.exists
    ? thread.fields.unreadByAdmin === true || thread.fields.unreadByCustomer === true
    : false;
  // Clear the customer-side unread flag once the chat is opened.
  if (thread.exists && thread.fields.unreadByCustomer === true) {
    await fetch(
      `${baseUrl(ctx.projectId)}/supportChats/${encodeURIComponent(ctx.chatId)}?updateMask.fieldPaths=unreadByCustomer`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ fields: { unreadByCustomer: toFsValue(false) } }),
      },
    ).catch(() => undefined);
  }

  return {
    thread: {
      id: ctx.chatId,
      status: thread.fields.status === "resolved" ? "resolved" : "open",
      unreadByCustomer: unread,
      lastMessageAt: Number(thread.fields.lastMessageAt ?? 0),
    },
    messages,
  };
}

// ── Light badge poll: unread count only (closed-widget state) ──
export async function getSupportUnreadServer(idToken: string): Promise<{ count: number }> {
  const ctx = await requireCustomer(idToken);
  if (!(await rateLimit(`supchat-badge:${ctx.uid}`, 30, 60_000))) {
    return { count: 0 };
  }
  const thread = await readThread(ctx);
  const count = thread.exists && thread.fields.unreadByCustomer === true ? 1 : 0;
  return { count };
}

// ── Customer sends a message (message + thread in ONE commit) ──
export async function sendSupportMessageServer(
  idToken: string,
  text: string,
): Promise<{ ok: true }> {
  const ctx = await requireCustomer(idToken);
  if (!(await rateLimit(`supchat-send:${ctx.uid}`, 20, 60_000))) {
    throw new Error("Rate limit exceeded. একটু পরে আবার চেষ্টা করুন।");
  }
  const clean = sanitizeChatText(text);
  if (!clean) throw new Error("chat/empty-message");

  await ensureThread(ctx);

  const now = Date.now();
  const msgId = `m_${newDocId()}`;
  const projectId = ctx.projectId;

  // Customer display name for message metadata
  const thread = await readThread(ctx);
  const customerName = (thread.fields.customerName as string) ?? "Customer";

  await commitWrites(projectId, [
    {
      update: {
        name: docPath(projectId, ["supportChats", ctx.chatId, "messages", msgId]),
        fields: toFsFields({
          sender: "customer",
          senderName: customerName,
          text: clean,
          createdAt: now,
        }),
      },
    },
    {
      update: {
        name: docPath(projectId, ["supportChats", ctx.chatId]),
        fields: toFsFields({
          lastMessage: clean.slice(0, 120),
          lastMessageAt: now,
          lastSender: "customer",
          unreadByAdmin: true,
          unreadByCustomer: false,
          status: "open", // a customer message reopens a resolved thread
        }),
      },
      updateMask: {
        fieldPaths: [
          "lastMessage",
          "lastMessageAt",
          "lastSender",
          "unreadByAdmin",
          "unreadByCustomer",
          "status",
        ],
      },
    },
  ]);
  return { ok: true };
}
