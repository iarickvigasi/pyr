'use client';

import { use } from 'react';
import { GuestDetail } from '@/components/features/guests/guest-detail';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GuestDetail id={id} />;
}
