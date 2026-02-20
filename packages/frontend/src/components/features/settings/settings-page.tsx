"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoomsTab } from './rooms-tab';
import { SeasonsTab } from './seasons-tab';
import { EmailAiTab } from './email-ai-tab';
import { FaqTab } from './faq-tab';
import { BusinessHoursTab } from './business-hours-tab';
import { NotificationsTab } from './notifications-tab';
import { CaldavTab } from './caldav-tab';
import { SyncStatusBanner } from './sync-status-banner';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SyncStatusBanner />
      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="seasons">Seasons</TabsTrigger>
          <TabsTrigger value="email-ai">Email & AI</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="hours">Business Hours</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms" className="mt-6">
          <RoomsTab />
        </TabsContent>
        <TabsContent value="seasons" className="mt-6">
          <SeasonsTab />
        </TabsContent>
        <TabsContent value="email-ai" className="mt-6">
          <EmailAiTab />
        </TabsContent>
        <TabsContent value="faq" className="mt-6">
          <FaqTab />
        </TabsContent>
        <TabsContent value="calendar" className="mt-6">
          <CaldavTab />
        </TabsContent>
        <TabsContent value="hours" className="mt-6">
          <BusinessHoursTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
