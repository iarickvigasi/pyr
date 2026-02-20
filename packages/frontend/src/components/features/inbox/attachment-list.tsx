'use client';

import { FileText, File, Download, Paperclip } from 'lucide-react';
import type { MessageAttachment } from '@/lib/hooks/use-conversations';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AttachmentListProps {
  attachments: MessageAttachment[];
  conversationId: string;
  messageId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentUrl(conversationId: string, messageId: string, attachmentId: string): string {
  return `${API_BASE}/api/v1/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`;
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isPdfType(contentType: string): boolean {
  return contentType === 'application/pdf';
}

export function AttachmentList({ attachments, conversationId, messageId }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        <span>{attachments.length} attachment{attachments.length > 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {attachments.map((attachment) => {
          const url = getAttachmentUrl(conversationId, messageId, attachment.id);
          const isImage = isImageType(attachment.contentType);
          const isPdf = isPdfType(attachment.contentType);

          return (
            <div
              key={attachment.id}
              className="flex items-center gap-3 rounded-md border p-2 bg-muted/20"
            >
              {isImage ? (
                <img
                  src={url}
                  alt={attachment.filename}
                  className="h-12 w-12 rounded object-cover shrink-0"
                />
              ) : isPdf ? (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-red-50 shrink-0">
                  <FileText className="h-6 w-6 text-red-500" />
                </div>
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-muted shrink-0">
                  <File className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </p>
              </div>

              <a
                href={url}
                download={attachment.filename}
                className="shrink-0 rounded-md p-1.5 hover:bg-muted transition-colors"
                title={`Download ${attachment.filename}`}
              >
                <Download className="h-4 w-4 text-muted-foreground" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
