import type * as React from "react";
import { cn } from "../../lib/utils";

function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-900 outline-none transition placeholder:text-stone-400 focus-visible:border-stone-500 focus-visible:ring-2 focus-visible:ring-stone-300/60 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
