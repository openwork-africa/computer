import { useState } from "react";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  steps: number;
  onNote: (text: string) => void;
  onFinish: (name: string) => void;
  onDiscard: () => void;
};

/** Shown while recording: the step count, a note for the agent (why, not only what), and Finish with a name. */
export function RecordingBar({ steps, onNote, onFinish, onDiscard }: Props) {
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-3 shadow-(--shadow-card)"
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return;
        onNote(note.trim());
        setNote("");
      }}
    >
      <span className="flex items-center gap-2 text-sm whitespace-nowrap">
        <StatusDot status="recording" />
        Recording · {steps} step{steps === 1 ? "" : "s"}
      </span>
      <Input data-size="default" className="min-w-40 flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell the agent why, e.g. only this week's jobs" aria-label="Note" />
      <Button type="submit" size="sm" variant="outline">
        Add note
      </Button>
      <Input data-size="default" className="w-44" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it, e.g. Read new jobs" aria-label="Recording name" />
      <Button type="button" size="sm" onClick={() => onFinish(name.trim())}>
        Finish
      </Button>
      <Button type="button" size="sm" variant="destructive" onClick={onDiscard}>
        Discard
      </Button>
    </form>
  );
}
