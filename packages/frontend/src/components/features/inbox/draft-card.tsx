'use client';

import { useState } from 'react';
import { Sparkles, Check, X, Edit2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCostMicrocents } from '@/lib/format';
import type { AiDraft } from '@/lib/hooks/use-conversations';

interface DraftCardProps {
  draft: AiDraft;
  onApprove: (content: string) => void;
  onReject: () => void;
  isPending?: boolean;
}

const DESTRUCTIVE_FLAGS = new Set(['complaint', 'cancellation']);

function capitalizeFlag(flag: string): string {
  return flag.charAt(0).toUpperCase() + flag.slice(1);
}

export function DraftCard({ draft, onApprove, onReject, isPending }: DraftCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);

  const handleApprove = () => {
    onApprove(isEditing ? editedContent : draft.content);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedContent(draft.content);
    setIsEditing(false);
  };

  const hasDetailedTokens = draft.inputTokens > 0;
  const hasFlags = draft.flags && draft.flags.length > 0;

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI-Generated Draft</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {draft.model}
            </Badge>
            {draft.provider && draft.provider !== draft.model && (
              <Badge variant="outline" className="text-xs">
                {draft.provider}
              </Badge>
            )}
            {draft.costEur > 0 && (
              <Badge variant="secondary" className="text-xs">
                {formatCostMicrocents(draft.costEur)}
              </Badge>
            )}
            {hasDetailedTokens ? (
              <Badge variant="secondary" className="text-xs">
                {draft.inputTokens}in / {draft.outputTokens}out
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {draft.tokensUsed} tokens
              </Badge>
            )}
            {draft.cacheReadTokens > 0 && (
              <Badge variant="outline" className="text-xs">
                cache hit
              </Badge>
            )}
            {draft.durationMs > 0 && (
              <span className="text-xs text-muted-foreground">
                {(draft.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        {hasFlags && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            {draft.flags.map((flag) => (
              <Badge
                key={flag}
                variant={DESTRUCTIVE_FLAGS.has(flag) ? 'destructive' : 'outline'}
                className={
                  DESTRUCTIVE_FLAGS.has(flag)
                    ? 'text-xs'
                    : 'text-xs text-amber-600 border-amber-300'
                }
              >
                {capitalizeFlag(flag)}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              Sensitive -- review carefully
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[150px] resize-none font-mono text-sm"
            placeholder="Edit the AI-generated message..."
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-sm">{draft.content}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Review and approve this message before sending
          </p>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={isPending || !editedContent.trim()}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {isPending ? 'Sending...' : 'Approve & Send'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onReject}
                  disabled={isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEdit}
                  disabled={isPending}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {isPending ? 'Sending...' : 'Approve & Send'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
