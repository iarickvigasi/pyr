"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
        <span className="text-sm text-muted-foreground">Koda is thinking</span>
        <span className="flex gap-0.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_infinite]"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_infinite]"
            style={{ animationDelay: '200ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_infinite]"
            style={{ animationDelay: '400ms' }}
          />
        </span>
      </div>
    </div>
  );
}
