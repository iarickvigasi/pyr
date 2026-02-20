'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateConversation } from '@/lib/hooks/use-conversations';
import { toast } from 'sonner';

interface ReclassifyDropdownProps {
  conversationId: string;
  currentClassification: string | null;
}

const CLASSIFICATION_OPTIONS = [
  { value: 'guest_inquiry', label: 'Guest Inquiry' },
  { value: 'ota_notification', label: 'OTA Notification' },
  { value: 'spam_newsletter', label: 'Spam/Newsletter' },
  { value: 'admin_system', label: 'Admin/System' },
];

export function ReclassifyDropdown({ conversationId, currentClassification }: ReclassifyDropdownProps) {
  const updateConversation = useUpdateConversation(conversationId);

  const handleChange = async (value: string) => {
    if (value === currentClassification) return;

    try {
      await updateConversation.mutateAsync({ classification: value });
      toast.success('Classification updated');
    } catch {
      toast.error('Failed to update classification');
    }
  };

  return (
    <Select
      value={currentClassification ?? undefined}
      onValueChange={handleChange}
      disabled={updateConversation.isPending}
    >
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <SelectValue placeholder="Classify..." />
      </SelectTrigger>
      <SelectContent>
        {CLASSIFICATION_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
