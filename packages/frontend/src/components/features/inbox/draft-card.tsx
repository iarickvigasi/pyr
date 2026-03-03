'use client';

import { useState } from 'react';
import { Sparkles, Check, X, Edit2, AlertTriangle, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCostMicrocents } from '@/lib/format';
import type { AiDraft } from '@/lib/hooks/use-conversations';

interface DraftCardProps {
  draft: AiDraft;
  onApprove: (payload: { draftId: string; content: string; originalContent: string }) => void;
  onReject: (draftId: string) => void;
  onRegenerate?: (draftId: string) => void;
  isRegenerating?: boolean;
  showRegenerate?: boolean;
  isPending?: boolean;
  isGenerating?: boolean;
}

const DESTRUCTIVE_FLAGS = new Set(['complaint', 'cancellation']);

function capitalizeFlag(flag: string): string {
  return flag.charAt(0).toUpperCase() + flag.slice(1);
}

export function DraftCard({
  draft,
  onApprove,
  onReject,
  onRegenerate,
  isRegenerating,
  showRegenerate,
  isPending,
  isGenerating,
}: DraftCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);

  const handleApproveClick = (): void => {
    const content = isEditing ? editedContent : draft.content;
    onApprove({
      draftId: draft.id,
      content,
      originalContent: draft.content,
    });
    setIsEditing(false);
  };

  const handleEdit = (): void => {
    setIsEditing(true);
  };

  const handleCancel = (): void => {
    setEditedContent(draft.content);
    setIsEditing(false);
  };

  const hasDetailedTokens = draft.inputTokens > 0;
  const hasFlags = draft.flags && draft.flags.length > 0;
  const isRejected = draft.status === 'rejected';
  const isFailed = draft.status === 'failed';

  // Generating state: show spinner while AI is composing
  if (isGenerating) {
    return (
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">Generating AI draft...</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The AI is composing a reply. This usually takes 10-30 seconds.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Failed draft: show error card with retry
  if (isFailed) {
    return (
      <Card className="border-2 border-destructive/40 bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Draft generation failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The AI was unable to generate a response. You can retry or compose a manual reply.
              </p>
            </div>
            {onRegenerate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRegenerate(draft.id)}
                disabled={isRegenerating}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Retrying...' : 'Retry'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Rejected draft: show grayed-out with regenerate option
  if (isRejected) {
    return (
      <Card className="border border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">AI Draft</span>
              <Badge variant="secondary" className="text-xs">Rejected</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="prose prose-sm max-w-none opacity-50">
            <p className="whitespace-pre-wrap text-sm line-through">{draft.content}</p>
          </div>
          {showRegenerate && onRegenerate && (
            <div className="pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRegenerate(draft.id)}
                disabled={isRegenerating}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Generating...' : 'Generate new draft'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Approved/edited drafts: show as completed (non-interactive)
  if (draft.status === 'approved' || draft.status === 'edited') {
    return (
      <Card className="border border-green-200 bg-green-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">
              {draft.status === 'edited' ? 'Edited & Sent' : 'Approved & Sent'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.content}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pending draft: full interactive card
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
            Approve fills the composer. Use Send below to actually send.
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
                  onClick={handleApproveClick}
                  disabled={isPending || !editedContent.trim()}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject(draft.id)}
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
                  onClick={handleApproveClick}
                  disabled={isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
