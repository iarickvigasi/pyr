interface ToolSummaryProps {
  count: number;
}

export function ToolSummary({ count }: ToolSummaryProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
      <div className="h-3 w-3 rounded-full bg-green-500/20 flex items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
      </div>
      <span>Used {count} tool{count !== 1 ? 's' : ''}</span>
    </div>
  );
}
