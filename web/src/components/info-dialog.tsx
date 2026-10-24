import { InfoIcon } from "lucide-react";
import type * as React from "react";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import type { Computer, Recording } from "@/lib/api";

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

type Props = {
  computers: Computer[];
  recordings: Recording[];
  currentId?: string;
  onOpen: (c: Computer) => void;
  onStop: (c: Computer) => void;
};

/** Saved computers, recordings, and how it works, behind one button. */
export function InfoDialog({ computers, recordings, currentId, onOpen, onStop }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Computers, recordings and how it works">
          <InfoIcon />
          {computers.length > 0 && <Badge variant="secondary">{computers.length}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Computers</DialogTitle>
          <DialogDescription>Each keeps its own Firefox profile on this Mac.</DialogDescription>
        </DialogHeader>

        <Section title="Saved computers" empty="None yet.">
          {computers.map((c) => (
            <Item key={c.id} size="xs" title={c.id}>
              <StatusDot status={c.state === "running" ? "running" : c.state === "stopped" ? "asleep" : "none"} />
              <ItemContent>
                <ItemTitle>{c.label}</ItemTitle>
                <ItemDescription>
                  {c.state === "stopped" ? "asleep" : c.state} · {c.savedAt ? `saved ${when(c.savedAt)}` : "not saved yet"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {c.id !== currentId && c.state !== "gone" && (
                  <Button size="xs" variant="outline" onClick={() => onOpen(c)}>
                    {c.state === "running" ? "Show" : "Resume"}
                  </Button>
                )}
                <Button size="xs" variant="destructive" onClick={() => onStop(c)}>
                  Delete
                </Button>
              </ItemActions>
            </Item>
          ))}
        </Section>

        <Section title="Recordings" empty="None yet. Press Record, do a task, then Finish.">
          {recordings.map((r) => (
            <Item key={r.dir} size="xs" title={r.dir}>
              <ItemContent>
                <ItemTitle>{r.name}</ItemTitle>
                <ItemDescription>
                  {r.steps} steps · {when(r.endedAt)} · recordings/{r.dir}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </Section>

        <Separator />
        <ul className="grid gap-1.5 text-xs text-muted-foreground">
          <li>Sites see your own IP, so fewer sign-in checks. Up to 2 GB of memory while it runs; none while saved.</li>
          <li>Save shuts it down and keeps sign-ins and tabs. Delete removes the VM; its profile folder stays.</li>
          <li>
            <Kbd>⌘C</Kbd> <Kbd>⌘V</Kbd> <Kbd>⌘A</Kbd> work in the screen; copy and paste go both ways.
          </li>
          <li>Recordings never keep passwords. Agents drive it with the SDK: <code>bun computer help</code>.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="grid gap-1">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children.length ? <ItemGroup>{children}</ItemGroup> : <p className="text-xs text-muted-foreground">{empty}</p>}
    </section>
  );
}
