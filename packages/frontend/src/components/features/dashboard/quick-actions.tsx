"use client";

import Link from 'next/link';
import { Plus, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild variant="outline" className="w-full justify-start gap-2">
          <Link href="/bookings?new=1">
            <Plus className="h-4 w-4" />
            New Booking
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start gap-2">
          <Link href="/events?new=1">
            <Plus className="h-4 w-4" />
            New Event
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start gap-2">
          <Link href="/inbox">
            <Mail className="h-4 w-4" />
            Check Inbox
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
