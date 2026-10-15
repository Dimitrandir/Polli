// The AI assistant: chat that answers from the salon's articles and offers free times.

import { request, type Booking, type ClientDetails } from "./api";

export type ProposalItem = {
  service_id: number;
  service: string;
  specialist_id: number;
  specialist: string;
  start: string;
  end: string;
  price: string;
};

/** A time the assistant offered. It becomes a booking only after the visitor confirms it. */
export type Proposal = {
  id: string;
  start: string;
  date: string;
  weekday: string;
  time: string;
  end: string;
  total_price: string;
  items: ProposalItem[];
  note: string;
  booking: Booking | null;
};

export type ChatMessage = { role: "user" | "assistant"; text: string; proposals?: Proposal[] };
export type Conversation = { id: string; messages: ChatMessage[] };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const assistantApi = {
  status: () => request<{ enabled: boolean }>("/assistant"),
  conversation: (id: string) => request<Conversation>(`/assistant/conversations/${id}`),
  send: (conversation: string | null, message: string) =>
    request<Conversation>("/assistant/chat", json("POST", { conversation, message })),
  confirm: (proposal: string, client: ClientDetails, consent: boolean) =>
    request<Proposal>(`/assistant/proposals/${proposal}/confirm`, json("POST", { client, consent })),
};
