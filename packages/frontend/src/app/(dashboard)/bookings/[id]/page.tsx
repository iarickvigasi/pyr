"use client";

import { use } from 'react';
import { BookingDetail } from '@/components/features/bookings/booking-detail';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BookingDetail id={id} />;
}
