import { useEffect, useRef } from "react";
import { ClipboardPasteIcon, CopyIcon, SaveIcon, CircleDotIcon, Trash2Icon } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AsleepPanel } from "@/components/asleep-panel";
import { BusyPanel } from "@/components/busy-panel";
import { InfoDialog } from "@/components/info-dialog";
import { RecordingBar } from "@/components/recording-bar";
import { Screen } from "@/components/screen";
import { StartPanel } from "@/components/start-panel";
import { StatusDot, type Status } from "@/components/status-dot";
import { Toaster, toast } from "@/components/ui/toast";
import { useComputers } from "@/hooks/use-computers";
import { useRecording } from "@/hooks/use-recording";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

export default function App() {
  const { computers, recordings, refresh } = useComputers();
  const session = useSession(refresh);
  const { current, busy } = session;
  const recording = useRecording(current?.stream ? current.id : undefined);
  const live = !!current?.stream && !busy;

  // On load, a computer already running (the only one) is shown, as if never left.
  const shown = useRef(false);
  useEffect(() => {
    const running = computers.filter((c) => c.state === "running");
    if (shown.current || current || busy || !computers.length) return;
    shown.current = true;
    if (running.length === 1) void session.open(running[0]);
  }, [computers, current, busy, session]);

  const status: Status = busy ? "busy" : recording.on ? "recording" : live ? "running" : current?.asleep ? "asleep" : "none";
  const say = (title: string) => toast.create({ type: "info", title });

  // Your clipboard goes in as typing into the field focused in the computer; the selection there comes out to yours.
  const paste = async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text) return say("Your clipboard is empty, or this page may not read it.");
    await api.computer(current!.id).paste(text).then(() => say(`Pasted ${text.length} characters.`), session.failed);
  };
  const copy = async () => {
    const { text } = await api.computer(current!.id).copy();
    if (!text) return say("Nothing is selected in the computer.");
    await navigator.clipboard.writeText(text);
    say(`Copied ${text.length} characters.`);
  };
  const finish = async (name: string) => {
    const saved = await recording.finish(name).catch(session.failed);
    if (saved) toast.create({ type: "success", title: `Saved ${saved.steps} steps`, description: saved.path });
    void refresh();
  };

  return (
    <main className="mx-auto grid max-w-3xl gap-3 px-4 pt-7 pb-12">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-tight">
          Computer <span className="font-normal text-muted-foreground">· a browser that stays signed in</span>
        </h1>
        <InfoDialog computers={computers} recordings={recordings} currentId={current?.id} onOpen={session.open} onStop={session.remove} />
      </header>

      <section className="overflow-hidden rounded-xl border bg-card shadow-(--shadow-card)" aria-label="Computer">
        <div className="flex min-h-12 items-center gap-3 border-b bg-muted/40 py-2 pr-2 pl-4">
          <StatusDot status={status} />
          <span className="truncate text-sm font-medium">{current?.label ?? "No computer"}</span>
          <span className="text-xs text-muted-foreground">{current ? "This Mac" : ""}</span>
          {live && (
            <div className="ml-auto flex gap-1.5">
              <ActionButton hint="Types your clipboard into the focused field" onClick={paste} disabled={recording.on}>
                <ClipboardPasteIcon /> Paste
              </ActionButton>
              <ActionButton hint="Copies what is selected in the computer" onClick={() => copy().catch(session.failed)} disabled={recording.on}>
                <CopyIcon /> Copy
              </ActionButton>
              <ActionButton hint="Records what you do, for an agent to do again" onClick={() => recording.start().catch(session.failed)} disabled={recording.on}>
                <CircleDotIcon className={recording.on ? "text-red-500" : ""} /> {recording.on ? "Recording" : "Record"}
              </ActionButton>
              <ActionButton hint="Shuts it down, keeping sign-ins and tabs" variant="default" onClick={session.save} disabled={recording.on}>
                <SaveIcon /> Save
              </ActionButton>
              <ActionButton hint="Deletes this computer" variant="destructive" size="icon-sm" aria-label="Delete" onClick={() => session.remove(current!)} disabled={recording.on}>
                <Trash2Icon />
              </ActionButton>
            </div>
          )}
        </div>
        <div className="relative aspect-[1024/640] bg-background">
          {busy ? (
            <BusyPanel text={busy} />
          ) : current?.stream ? (
            <Screen stream={current.stream} onCopy={(text) => navigator.clipboard.writeText(text).catch(() => {})} onLost={session.lost} />
          ) : current?.asleep ? (
            <AsleepPanel label={current.label} onResume={() => session.open(current)} onNew={session.clear} />
          ) : (
            <StartPanel onStart={session.start} />
          )}
        </div>
      </section>

      {live && recording.on && (
        <RecordingBar steps={recording.steps} onNote={(text) => recording.note(text)?.then(() => say("Note added."), session.failed)} onFinish={finish} onDiscard={() => recording.discard().then(() => say("Recording discarded."), session.failed)} />
      )}
      <Toaster />
    </main>
  );
}
