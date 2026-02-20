'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq } from '@/lib/hooks/use-faq';
import type { Faq } from '@/lib/hooks/use-faq';

interface FaqFormData {
  question: string;
  answer: string;
  tagsInput: string;
}

const INITIAL_FORM: FaqFormData = {
  question: '',
  answer: '',
  tagsInput: '',
};

export function FaqTab() {
  const [filterTag, setFilterTag] = useState<string>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
  const [form, setForm] = useState<FaqFormData>(INITIAL_FORM);

  const { data: faqs, isLoading } = useFaqs(filterTag);
  const createFaq = useCreateFaq();
  const updateFaq = useUpdateFaq();
  const deleteFaq = useDeleteFaq();

  const allTags = Array.from(
    new Set((faqs ?? []).flatMap((f) => f.tags))
  ).sort();

  const handleOpenCreate = (): void => {
    setEditingFaq(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (faq: Faq): void => {
    setEditingFaq(faq);
    setForm({
      question: faq.question,
      answer: faq.answer,
      tagsInput: faq.tags.join(', '),
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = (): void => {
    setIsFormOpen(false);
    setEditingFaq(null);
    setForm(INITIAL_FORM);
  };

  const parseTags = (input: string): string[] => {
    return input
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  };

  const handleSave = async (): Promise<void> => {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Question and answer are required');
      return;
    }

    const tags = parseTags(form.tagsInput);

    try {
      if (editingFaq) {
        await updateFaq.mutateAsync({
          id: editingFaq.id,
          question: form.question.trim(),
          answer: form.answer.trim(),
          tags,
        });
        toast.success('FAQ updated');
      } else {
        await createFaq.mutateAsync({
          question: form.question.trim(),
          answer: form.answer.trim(),
          tags,
        });
        toast.success('FAQ created');
      }
      handleCloseForm();
    } catch {
      toast.error(editingFaq ? 'Failed to update FAQ' : 'Failed to create FAQ');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deletingFaqId) return;
    try {
      await deleteFaq.mutateAsync(deletingFaqId);
      toast.success('FAQ deleted');
    } catch {
      toast.error('Failed to delete FAQ');
    }
    setDeletingFaqId(null);
  };

  const isSaving = createFaq.isPending || updateFaq.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">FAQ Knowledge Base</h2>
          <p className="text-sm text-muted-foreground mt-1">
            These Q&A pairs are injected into AI draft context for more accurate responses.
            FAQ entries are in English -- the AI translates for German-speaking guests.
          </p>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add FAQ
        </Button>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by tag:</span>
          <Badge
            variant={!filterTag ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterTag(undefined)}
          >
            All
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={filterTag === tag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilterTag(filterTag === tag ? undefined : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* FAQ List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !faqs || faqs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No FAQ entries yet. Add your first FAQ to improve AI draft accuracy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {faqs.map((faq) => (
            <Card key={faq.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{faq.question}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleOpenEdit(faq)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingFaqId(faq.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {faq.answer}
                </p>
                {faq.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {faq.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? 'Edit FAQ' : 'Add FAQ'}
            </DialogTitle>
            <DialogDescription>
              {editingFaq
                ? 'Update the question and answer. The AI uses these to generate more accurate drafts.'
                : 'Add a Q&A pair to improve AI draft accuracy. Write in English.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="faq-question">Question</Label>
              <Input
                id="faq-question"
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="e.g., What time is check-in?"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {form.question.length}/500
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-answer">Answer</Label>
              <Textarea
                id="faq-answer"
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                placeholder="e.g., Check-in is from 3:00 PM. We can arrange early check-in upon request."
                className="min-h-[120px] resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {form.answer.length}/5000
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-tags">Tags</Label>
              <Input
                id="faq-tags"
                value={form.tagsInput}
                onChange={(e) => setForm((f) => ({ ...f, tagsInput: e.target.value }))}
                placeholder="e.g., booking, check-in, logistics"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated tags for organizing FAQs
              </p>
              {form.tagsInput.trim() && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {parseTags(form.tagsInput).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                      <button
                        type="button"
                        className="ml-1 hover:text-destructive"
                        onClick={() => {
                          const tags = parseTags(form.tagsInput).filter((t) => t !== tag);
                          setForm((f) => ({ ...f, tagsInput: tags.join(', ') }));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.question.trim() || !form.answer.trim()}
            >
              {isSaving ? 'Saving...' : editingFaq ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingFaqId} onOpenChange={(open) => !open && setDeletingFaqId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FAQ entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this FAQ entry. The AI will no longer use it for draft generation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFaq.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
