"use client";

/* The loading status is exposed on the SVG while preserving SVG props and refs. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

const Spinner = ({ className, ...props }: React.ComponentProps<"svg">) => (
  <Loader2Icon
    data-slot="spinner"
    role="status"
    aria-label="Loading"
    className={cn("size-4 animate-spin", className)}
    {...props}
  />
);

export { Spinner };
