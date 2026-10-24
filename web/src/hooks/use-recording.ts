import { useEffect, useState } from "react";
import { api, type Recording } from "@/lib/api";

/** Recording what is done in one computer: its step count while on (polled), and start, note, finish, discard. */
export function useRecording(id: string | undefined) {
  const [steps, setSteps] = useState<number | null>(null); // null: not recording
  const on = steps !== null;

  // Another computer in the window is not recording as far as this page knows.
  useEffect(() => setSteps(null), [id]);

  useEffect(() => {
    if (!id || !on) return;
    const timer = setInterval(async () => {
      const status = await api.computer(id).recording.status().catch(() => null);
      if (status) setSteps(status.on ? status.steps : null);
    }, 1500);
    return () => clearInterval(timer);
  }, [id, on]);

  const actions = id ? api.computer(id).recording : null;
  return {
    on,
    steps: steps ?? 0,
    start: async () => {
      await actions?.start();
      setSteps(0);
    },
    note: (text: string) => actions?.note(text),
    finish: async (name: string): Promise<Recording | undefined> => {
      setSteps(null);
      return actions?.finish(name);
    },
    discard: async () => {
      setSteps(null);
      await actions?.discard();
    },
  };
}
