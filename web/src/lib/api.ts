// The server's API (src/server.ts), typed. Every call throws the server's own error message.
export type ComputerState = "running" | "stopped" | "gone";
export type Computer = { id: string; label: string; port: number; createdAt: string; savedAt: string | null; state: ComputerState };
export type Stream = { ws: string; password: string };
export type Recording = { dir: string; name: string; steps: number; endedAt: string; path?: string };
export type RecordingStatus = { on: boolean; steps: number };

const call = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
};

export const api = {
  list: () => call<Computer[]>("GET", "/computers"),
  create: (label: string) => call<{ id: string; stream: Stream }>("POST", "/computers", { label }),
  recordings: () => call<Recording[]>("GET", "/recordings"),

  /** The actions on one computer. */
  computer: (id: string) => ({
    save: (label?: string) => call<Computer>("POST", `/computers/${id}/save`, { label }),
    resume: () => call<{ id: string; stream: Stream }>("POST", `/computers/${id}/resume`),
    stop: () => call<unknown>("POST", `/computers/${id}/stop`),
    paste: (text: string) => call<unknown>("POST", `/computers/${id}/paste`, { text }),
    copy: () => call<{ text: string }>("POST", `/computers/${id}/copy`),
    recording: {
      start: () => call<RecordingStatus>("POST", `/computers/${id}/recording/start`),
      status: () => call<RecordingStatus>("POST", `/computers/${id}/recording/status`),
      note: (text: string) => call<unknown>("POST", `/computers/${id}/recording/note`, { text }),
      finish: (name: string) => call<Recording>("POST", `/computers/${id}/recording/finish`, { name }),
      discard: () => call<unknown>("POST", `/computers/${id}/recording/discard`),
    },
  }),
};
