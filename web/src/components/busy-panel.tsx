import { Spinner } from "@/components/ui/spinner";

export function BusyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Spinner className="size-5" />
      {text}
    </div>
  );
}
