"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSetting, useUpdateSetting } from '@/lib/hooks/use-settings';
import { toast } from 'sonner';

const DEFAULT_AI_PROMPT = `You are Ines, the owner of Puppy Yoga Retreat in Peyia, Cyprus. You help guests with booking inquiries, event information, and general questions about the retreat. You are warm, welcoming, and knowledgeable about yoga, wellness, and the rescued puppies. Respond in the guest's language (English or German).`;

export function EmailAiTab() {
  const signatureQuery = useSetting('email_signature');
  const aiPromptQuery = useSetting('ai_system_prompt');
  const updateSetting = useUpdateSetting();

  const [signature, setSignature] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');

  useEffect(() => {
    if (signatureQuery.data?.data?.value) {
      const val = signatureQuery.data.data.value as { text: string };
      setSignature(val.text ?? '');
    }
  }, [signatureQuery.data]);

  useEffect(() => {
    if (aiPromptQuery.data?.data?.value) {
      const val = aiPromptQuery.data.data.value as { prompt: string };
      setAiPrompt(val.prompt ?? '');
    } else if (!aiPromptQuery.isLoading && aiPromptQuery.isError) {
      setAiPrompt(DEFAULT_AI_PROMPT);
    }
  }, [aiPromptQuery.data, aiPromptQuery.isLoading, aiPromptQuery.isError]);

  const saveSignature = async () => {
    try {
      await updateSetting.mutateAsync({
        key: 'email_signature',
        value: { text: signature },
      });
      toast.success('Email signature saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const saveAiPrompt = async () => {
    try {
      await updateSetting.mutateAsync({
        key: 'ai_system_prompt',
        value: { prompt: aiPrompt },
      });
      toast.success('AI system prompt saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (signatureQuery.isLoading && aiPromptQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Signature</CardTitle>
          <CardDescription>
            Appended to all outgoing emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="signature">Signature</Label>
            <Textarea
              id="signature"
              rows={4}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Warm regards,&#10;Ines&#10;Puppy Yoga Retreat, Peyia"
            />
          </div>
          {signature && (
            <div className="rounded border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
              {signature}
            </div>
          )}
          <Button onClick={saveSignature} disabled={updateSetting.isPending}>
            Save Signature
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI System Prompt</CardTitle>
          <CardDescription>
            Controls how the AI drafts messages. Available variables: guest name, booking details, event info
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ai-prompt">System Prompt</Label>
            <Textarea
              id="ai-prompt"
              rows={8}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveAiPrompt} disabled={updateSetting.isPending}>
              Save Prompt
            </Button>
            <Button
              variant="outline"
              onClick={() => setAiPrompt(DEFAULT_AI_PROMPT)}
            >
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
