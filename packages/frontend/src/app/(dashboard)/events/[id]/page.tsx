"use client";

import { use } from 'react';
import { EventDetail } from '@/components/features/events/event-detail';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EventDetail id={id} />;
}
