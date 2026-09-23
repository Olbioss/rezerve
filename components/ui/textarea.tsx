import type * as React from "react";

import { cn } from "@/lib/utils";

/** Underline-only like Input, growing with its content. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-20 w-full min-w-0 resize-none rounded-none border-0 border-input border-b bg-transparent px-1 py-2 font-normal text-base text-foreground leading-relaxed transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-[0.9375rem]",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
