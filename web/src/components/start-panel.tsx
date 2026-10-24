import { MonitorIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

/** No computer in the window: name one (optional) and start it. */
export function StartPanel({ onStart }: { onStart: (label: string) => void }) {
  const [label, setLabel] = useState("");
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MonitorIcon />
        </EmptyMedia>
        <EmptyTitle>Start a computer</EmptyTitle>
        <EmptyDescription>Firefox in a small Linux VM on this Mac. Sign in to any site, then Save to stay signed in.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form
          className="flex w-full max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onStart(label.trim());
            setLabel("");
          }}
        >
          <Input data-size="default" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it (optional)" aria-label="Name" autoComplete="off" />
          <Button type="submit">Start</Button>
        </form>
      </EmptyContent>
    </Empty>
  );
}
