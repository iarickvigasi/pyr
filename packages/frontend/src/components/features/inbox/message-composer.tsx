'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageComposerProps {
  value: string;
  onChange: (content: string) => void;
  onSend: (content: string) => Promise<void>;
  isPending?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  isPending,
  placeholder = 'Type your message...',
}: MessageComposerProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isPending) {
      await onSend(value);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      await handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="min-h-[80px] resize-none"
        disabled={isPending}
      />
      <Button
        type="submit"
        size="icon"
        disabled={!value.trim() || isPending}
        className="h-[80px] w-[80px]"
      >
        <Send className="h-5 w-5" />
        <span className="sr-only">Send message</span>
      </Button>
    </form>
  );
}
