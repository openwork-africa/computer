import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = React.ComponentProps<typeof Button> & { hint: string };

/** A button that says what it does when hovered. */
export function ActionButton({ hint, ...props }: Props) {
  return (
    <Tooltip openDelay={400}>
      <TooltipTrigger asChild>
        <Button size="sm" variant="outline" {...props} />
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
