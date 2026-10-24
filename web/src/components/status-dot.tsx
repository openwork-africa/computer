import { cn } from "cn";

export type Status = "running" | "asleep" | "busy" | "recording" | "none";

const COLORS: Record<Status, string> = {
  running: "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20",
  asleep: "bg-amber-500",
  busy: "bg-sky-500 animate-pulse",
  recording: "bg-red-500 animate-pulse",
  none: "bg-muted-foreground/40",
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", COLORS[status], className)} />;
}
