'use client';

export default function QueuesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Queue Monitor</h1>
        <p className="text-muted-foreground">
          Monitor background job queues, view failed jobs, and retry or delete them.
        </p>
      </div>
      <div
        className="rounded-lg border bg-card overflow-hidden"
        style={{ height: 'calc(100vh - 12rem)' }}
      >
        <iframe
          src="/api/admin/queues"
          className="w-full h-full border-0"
          title="Queue Monitor"
        />
      </div>
    </div>
  );
}
