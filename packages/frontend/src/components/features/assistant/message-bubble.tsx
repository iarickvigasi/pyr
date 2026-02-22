"use client";

import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/lib/hooks/use-assistant';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

/** Detect if a link is an internal dashboard link */
function isDashboardLink(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 lg:max-w-[70%]',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {message.content ? (
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // eslint-disable-next-line -- react-markdown component override requires any for flexibility
                  a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
                    const url = href ?? '#';
                    if (isDashboardLink(url)) {
                      return (
                        <Link
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline hover:text-primary/80"
                        >
                          {children}
                        </Link>
                      );
                    }
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse border border-border text-sm" {...props}>
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
                    <th className="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium" {...props}>
                      {children}
                    </th>
                  ),
                  td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
                    <td className="border border-border px-3 py-1.5" {...props}>
                      {children}
                    </td>
                  ),
                  code: ({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) => {
                    const isBlock = className?.includes('language-');
                    if (isBlock) {
                      return (
                        <code className={cn('block rounded bg-muted p-3 font-mono text-xs', className)} {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => (
                    <pre className="overflow-x-auto rounded-lg bg-muted p-0 my-2" {...props}>
                      {children}
                    </pre>
                  ),
                }}
              >
                {message.content}
              </Markdown>
            ) : null}
          </div>
        )}
        <div
          className={cn(
            'mt-1 text-xs',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground/60',
          )}
        >
          {formatRelativeTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
