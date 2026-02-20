'use client';

import { Badge } from '@/components/ui/badge';

interface ClassificationBadgeProps {
  classification: string | null;
}

const CLASSIFICATION_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  guest_inquiry: { label: 'Guest Inquiry', variant: 'default' },
  ota_notification: { label: 'OTA Notification', variant: 'outline' },
  spam_newsletter: { label: 'Spam/Newsletter', variant: 'destructive' },
  admin_system: { label: 'Admin/System', variant: 'secondary' },
};

export function ClassificationBadge({ classification }: ClassificationBadgeProps) {
  if (!classification) return null;

  const config = CLASSIFICATION_CONFIG[classification];
  if (!config) {
    return (
      <Badge variant="outline" className="text-xs">
        {classification}
      </Badge>
    );
  }

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}
