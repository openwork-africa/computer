import { useState } from "react";
import { api, type Computer, type Stream } from "@/lib/api";
import { toast } from "@/components/ui/toast";

/** The computer in the window. A running one has a stream to draw; a saved one waits for Resume. */
export type Current = { id: string; label: string; asleep: boolean; stream?: Stream };

const failed = (error: unknown): undefined => {
  toast.create({ type: "error", title: error instanceof Error ? error.message : String(error) });
};

/** The computer in the window and what is being done to it. Every action shows its progress and reports failures. */
export function useSession(onChange: () => void) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [busy, setBusy] = useState("");

  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try {
      await task();
    } catch (error) {
      failed(error);
    } finally {
      setBusy("");
      onChange();
    }
  };

  return {
    current,
    busy,
    clear: () => setCurrent(null),
    start: (label: string) =>
      run("Starting Firefox…", async () => {
        const { id, stream } = await api.create(label);
        setCurrent({ id, label: label || "Firefox", asleep: false, stream });
      }),
    open: (c: Pick<Computer, "id" | "label">) =>
      run("Resuming…", async () => {
        const { stream } = await api.computer(c.id).resume();
        setCurrent({ id: c.id, label: c.label, asleep: false, stream });
      }),
    save: () =>
      current &&
      run("Saving: closing Firefox and shutting down…", async () => {
        await api.computer(current.id).save(current.label);
        setCurrent({ ...current, asleep: true, stream: undefined });
      }),
    remove: (c: Pick<Computer, "id">) =>
      run("Deleting…", async () => {
        await api.computer(c.id).stop();
        if (current?.id === c.id) setCurrent(null);
        toast.create({ type: "success", title: "Deleted. Its sign-ins stay in its profile folder." });
      }),
    lost: () => current && setCurrent({ ...current, asleep: true, stream: undefined }),
    failed,
  };
}
