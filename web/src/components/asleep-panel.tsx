import { MoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** The computer in the window is saved: resume it, or start another. */
export function AsleepPanel({ label, onResume, onNew }: { label: string; onResume: () => void; onNew: () => void }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MoonIcon />
        </EmptyMedia>
        <EmptyTitle>{label} is saved</EmptyTitle>
        <EmptyDescription>Shut down and still signed in. Resume brings its tabs back.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="outline" onClick={onNew}>
          New computer
        </Button>
      </EmptyContent>
    </Empty>
  );
}
