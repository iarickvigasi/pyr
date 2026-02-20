"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

// ─── Types ──────────────────────────────────────────────────

interface CaldavConfigResponse {
  data: {
    configured: boolean;
    serverUrl: string | null;
    username: string | null;
    calendarName: string | null;
    password: string;
  };
}

interface SyncStatusResponse {
  data: {
    synced: number;
    pending: number;
    failed: number;
    lastSyncAt: string | null;
  };
}

interface TestConnectionResponse {
  data: {
    success: boolean;
    calendarName?: string;
    error?: string;
  };
}

interface ResyncResponse {
  data: {
    jobsEnqueued: number;
  };
}

// ─── Form State ─────────────────────────────────────────────

interface FormState {
  serverUrl: string;
  username: string;
  password: string;
  calendarName: string;
}

const DEFAULT_FORM: FormState = {
  serverUrl: 'https://caldav.icloud.com',
  username: '',
  password: '',
  calendarName: 'Puppy Yoga Retreat',
};

// ─── Component ──────────────────────────────────────────────

export function CaldavTab() {
  const qc = useQueryClient();

  // ─── Queries ────────────────────────────────────────────

  const configQuery = useQuery({
    queryKey: queryKeys.settings.key('caldav-config'),
    queryFn: () => api.get<CaldavConfigResponse>('/api/v1/calendar/config'),
    retry: false,
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.settings.key('caldav-status'),
    queryFn: () => api.get<SyncStatusResponse>('/api/v1/calendar/status'),
    refetchInterval: 30_000,
  });

  // ─── Mutations ──────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (config: FormState) =>
      api.post<{ data: { saved: boolean } }>('/api/v1/calendar/config', config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.key('caldav-config') });
      qc.invalidateQueries({ queryKey: queryKeys.settings.key('caldav-status') });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<TestConnectionResponse>('/api/v1/calendar/test-connection'),
  });

  const resyncMutation = useMutation({
    mutationFn: () =>
      api.post<ResyncResponse>('/api/v1/calendar/sync'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.key('caldav-status') });
    },
  });

  // ─── State ──────────────────────────────────────────────

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; calendarName?: string; error?: string } | null>(null);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    if (configQuery.data?.data?.configured) {
      const cfg = configQuery.data.data;
      setForm({
        serverUrl: cfg.serverUrl ?? 'https://caldav.icloud.com',
        username: cfg.username ?? '',
        password: '',
        calendarName: cfg.calendarName ?? 'Puppy Yoga Retreat',
      });
      setHasExistingPassword(true);
      setConnectionTested(true);
      setTestResult({ success: true });
    }
  }, [configQuery.data]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setConnectionTested(false);
    setTestResult(null);
  };

  // ─── Handlers ───────────────────────────────────────────

  const handleTestConnection = async () => {
    if (!form.username || (!form.password && !hasExistingPassword)) {
      toast.error('Please enter username and password before testing');
      return;
    }

    // Save first so the test uses the latest credentials
    try {
      if (form.password || !hasExistingPassword) {
        await saveMutation.mutateAsync(form);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save config before testing');
      return;
    }

    try {
      const result = await testMutation.mutateAsync();
      const data = result.data;
      setTestResult(data);
      setConnectionTested(data.success);

      if (data.success) {
        toast.success(`Connection successful${data.calendarName ? ` - Calendar: ${data.calendarName}` : ''}`);
      } else {
        toast.error(data.error ?? 'Connection test failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection test failed');
      setTestResult(null);
      setConnectionTested(false);
    }
  };

  const handleSave = async () => {
    if (!form.password && !hasExistingPassword) {
      toast.error('Password is required');
      return;
    }

    try {
      await saveMutation.mutateAsync(form);
      toast.success('CalDAV configuration saved');
      setHasExistingPassword(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleResync = async () => {
    try {
      const result = await resyncMutation.mutateAsync();
      toast.success(`Re-sync started: ${result.data.jobsEnqueued} jobs enqueued`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start re-sync');
    }
  };

  // ─── Derived ────────────────────────────────────────────

  const syncStatus = statusQuery.data?.data;
  const hasFailed = (syncStatus?.failed ?? 0) > 0;

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Failed Sync Warning */}
      {hasFailed && (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertTitle>{syncStatus!.failed} calendar sync{syncStatus!.failed === 1 ? '' : 's'} failed</AlertTitle>
          <AlertDescription>
            Some calendar events could not be synced to Apple Calendar. Try re-syncing below.
          </AlertDescription>
        </Alert>
      )}

      {/* CalDAV Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CalDAV Provider</CardTitle>
          <CardDescription>
            Configure Apple Calendar (iCloud CalDAV) credentials for automatic calendar sync
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server URL */}
          <div className="space-y-2">
            <Label>Server URL</Label>
            <Input
              value={form.serverUrl}
              onChange={(e) => updateField('serverUrl', e.target.value)}
              placeholder="https://caldav.icloud.com"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label>Username (Apple ID)</Label>
            <Input
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
              placeholder="your-apple-id@icloud.com"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label>App-Specific Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder={hasExistingPassword ? 'Password saved (enter new to change)' : 'Enter app-specific password'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              iCloud requires an app-specific password. Generate one at{' '}
              <a
                href="https://appleid.apple.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                appleid.apple.com
              </a>{' '}
              &gt; Sign-in and Security &gt; App-Specific Passwords.
            </p>
          </div>

          {/* Calendar Name */}
          <div className="space-y-2">
            <Label>Calendar Name</Label>
            <Input
              value={form.calendarName}
              onChange={(e) => updateField('calendarName', e.target.value)}
              placeholder="Puppy Yoga Retreat"
            />
            <p className="text-xs text-muted-foreground">
              The display name of the target calendar in iCloud. Must match exactly.
            </p>
          </div>

          {/* Connection Test */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testMutation.isPending || saveMutation.isPending || !form.username || (!form.password && !hasExistingPassword)}
            >
              {testMutation.isPending || saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {testResult && (
              <span className="flex items-center gap-1 text-sm">
                {testResult.success ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                {testResult.success ? 'Connected' : 'Failed'}
              </span>
            )}
          </div>

          {testResult?.error && (
            <p className="text-sm text-destructive">{testResult.error}</p>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={!connectionTested || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save CalDAV Configuration'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Status</CardTitle>
          <CardDescription>
            Calendar sync health and manual re-sync controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Counts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{syncStatus?.synced ?? 0}</p>
              <p className="text-sm text-muted-foreground">Synced</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{syncStatus?.pending ?? 0}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className={`text-2xl font-bold ${hasFailed ? 'text-red-600' : 'text-muted-foreground'}`}>
                {syncStatus?.failed ?? 0}
              </p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Last Sync */}
          {syncStatus?.lastSyncAt && (
            <p className="text-sm text-muted-foreground">
              Last successful sync:{' '}
              {new Date(syncStatus.lastSyncAt).toLocaleString('en-GB', {
                timeZone: 'Europe/Nicosia',
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}

          {/* Re-sync Button */}
          <Button
            variant="outline"
            onClick={handleResync}
            disabled={resyncMutation.isPending}
          >
            {resyncMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Re-syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 size-4" />
                Re-sync All Bookings & Events
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Triggers a full re-sync of all bookings and events to Apple Calendar.
            Existing calendar events will be updated with current data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
