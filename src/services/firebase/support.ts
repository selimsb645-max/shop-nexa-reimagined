import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { toMs } from "./timestamps";
import type { SupportTicket, TicketMessage, TicketStatus } from "@/types/customer";

function ticketsCol(uid: string) {
  return collection(getDb(), "users", uid, "tickets");
}
function ticketMsgCol(uid: string, ticketId: string) {
  return collection(getDb(), "users", uid, "tickets", ticketId, "messages");
}

function mapTicket(id: string, d: Record<string, unknown>): SupportTicket {
  return {
    id,
    subject: String(d.subject ?? ""),
    category: (d.category as SupportTicket["category"]) ?? "other",
    orderId: (d.orderId as string | null) ?? null,
    status: (d.status as TicketStatus) ?? "open",
    lastMessage: String(d.lastMessage ?? ""),
    createdAt: toMs(d.createdAt),
    updatedAt: toMs(d.updatedAt),
  };
}

export async function listTickets(uid: string): Promise<SupportTicket[]> {
  const snap = await getDocs(query(ticketsCol(uid), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => mapTicket(d.id, d.data() as Record<string, unknown>));
}

export async function listTicketMessages(uid: string, ticketId: string): Promise<TicketMessage[]> {
  const snap = await getDocs(
    query(
      ticketMsgCol(uid, ticketId),
      orderBy("createdAt", "asc"),
      limit(200),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      ticketId,
      body: String(data.body ?? ""),
      from: data.from === "support" ? "support" : "customer",
      createdAt: toMs(data.createdAt),
    } satisfies TicketMessage;
  });
}

export async function createTicket(
  uid: string,
  input: {
    subject: string;
    category: SupportTicket["category"];
    orderId: string | null;
    message: string;
  },
): Promise<string> {
  const ref = doc(ticketsCol(uid));
  await setDoc(ref, {
    subject: input.subject,
    category: input.category,
    orderId: input.orderId,
    status: "open" as TicketStatus,
    lastMessage: input.message,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await replyToTicket(uid, ref.id, input.message);
  return ref.id;
}

export async function replyToTicket(uid: string, ticketId: string, body: string): Promise<void> {
  await setDoc(doc(ticketMsgCol(uid, ticketId)), {
    body,
    from: "customer",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(getDb(), "users", uid, "tickets", ticketId), {
    lastMessage: body,
    status: "open" as TicketStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function closeTicket(uid: string, ticketId: string): Promise<void> {
  await updateDoc(doc(getDb(), "users", uid, "tickets", ticketId), {
    status: "closed" as TicketStatus,
    updatedAt: serverTimestamp(),
  });
}
