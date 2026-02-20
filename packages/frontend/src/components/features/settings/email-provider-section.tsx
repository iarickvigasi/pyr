"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import {
  useEmailProviderConfig,
  useSaveEmailProviderConfig,
  useTestEmailConnection,
  useTogglePolling,
} from '@/lib/hooks/use-settings';

// ─── Provider Presets ──────────────────────────────────────

const PROVIDER_PRESETS = {
  gmx: { imapHost: 'imap.gmx.net', imapPort: 993, smtpHost: 'mail.gmx.net', smtpPort: 587 },
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  custom: { imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587 },
} as const;

type ProviderKey = keyof typeof PROVIDER_PRESETS;

interface FormState {
  provider: ProviderKey;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  email: string;
  password: string;
  pollIntervalMinutes: number;
  pollingEnabled: boolean;
}

const DEFAULT_FORM: FormState = {
  provider: 'gmx',
  imapHost: 'imap.gmx.net',
  imapPort: 993,
  smtpHost: 'mail.gmx.net',
  smtpPort: 587,
  email: '',
  password: '',
  pollIntervalMinutes: 2,
  pollingEnabled: true,
};

export function EmailProviderSection() {
  const configQuery = useEmailProviderConfig();
  const saveMutation = useSaveEmailProviderConfig();
  const testMutation = useTestEmailConnection();
  const toggleMutation = useTogglePolling();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [testResult, setTestResult] = useState<{ imap: boolean; smtp: boolean; error?: string } | null>(null);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    if (configQuery.data?.data?.configured) {
      const cfg = configQuery.data.data;
      setForm({
        provider: (cfg.provider ?? 'gmx') as ProviderKey,
        imapHost: cfg.imapHost ?? '',
        imapPort: cfg.imapPort ?? 993,
        smtpHost: cfg.smtpHost ?? '',
        smtpPort: cfg.smtpPort ?? 587,
        email: cfg.email ?? '',
        password: '',
        pollIntervalMinutes: cfg.pollIntervalMinutes ?? 2,
        pollingEnabled: cfg.pollingEnabled ?? true,
      });
      setHasExistingPassword(true);
      // If already configured, treat as tested
      setConnectionTested(true);
      setTestResult({ imap: true, smtp: true });
    }
  }, [configQuery.data]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Reset test status on any change (except polling fields)
    if (key !== 'pollIntervalMinutes' && key !== 'pollingEnabled') {
      setConnectionTested(false);
      setTestResult(null);
    }
  };

  const handleProviderChange = (provider: ProviderKey) => {
    const preset = PROVIDER_PRESETS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
    }));
    setConnectionTested(false);
    setTestResult(null);
  };

  const isCustom = form.provider === 'custom';

  const handleTestConnection = async () => {
    if (!form.email || (!form.password && !hasExistingPassword)) {
      toast.error('Please enter email and password before testing');
      return;
    }

    try {
      const result = await testMutation.mutateAsync({
        provider: form.provider,
        imapHost: form.imapHost,
        imapPort: form.imapPort,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        email: form.email,
        password: form.password,
      });

      const data = result.data;
      setTestResult(data);
      setConnectionTested(data.imap && data.smtp);

      if (data.imap && data.smtp) {
        toast.success('Connection successful');
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
      await saveMutation.mutateAsync({
        provider: form.provider,
        imapHost: form.imapHost,
        imapPort: form.imapPort,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        email: form.email,
        password: form.password,
        pollIntervalMinutes: form.pollIntervalMinutes,
        pollingEnabled: form.pollingEnabled,
      });
      toast.success('Email provider configuration saved');
      setHasExistingPassword(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleTogglePolling = async (enabled: boolean) => {
    updateField('pollingEnabled', enabled);
    try {
      await toggleMutation.mutateAsync({ enabled });
      toast.success(enabled ? 'Email polling enabled' : 'Email polling paused');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle polling');
      // Revert on failure
      updateField('pollingEnabled', !enabled);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email Provider</CardTitle>
        <CardDescription>
          Configure IMAP/SMTP credentials for email integration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Select */}
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={form.provider} onValueChange={(v) => handleProviderChange(v as ProviderKey)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmx">GMX</SelectItem>
              <SelectItem value="gmail">Gmail</SelectItem>
              <SelectItem value="outlook">Outlook</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* IMAP/SMTP Host/Port */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>IMAP Host</Label>
            <Input
              value={form.imapHost}
              onChange={(e) => updateField('imapHost', e.target.value)}
              disabled={!isCustom}
              placeholder="imap.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>IMAP Port</Label>
            <Input
              type="number"
              value={form.imapPort}
              onChange={(e) => updateField('imapPort', Number(e.target.value))}
              disabled={!isCustom}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>SMTP Host</Label>
            <Input
              value={form.smtpHost}
              onChange={(e) => updateField('smtpHost', e.target.value)}
              disabled={!isCustom}
              placeholder="smtp.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>SMTP Port</Label>
            <Input
              type="number"
              value={form.smtpPort}
              onChange={(e) => updateField('smtpPort', Number(e.target.value))}
              disabled={!isCustom}
            />
          </div>
        </div>

        {/* Email + Password */}
        <div className="space-y-2">
          <Label>Email Address</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label>Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder={hasExistingPassword ? 'Password saved (enter new to change)' : 'Enter password'}
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
        </div>

        {/* Connection Test */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testMutation.isPending || !form.email || (!form.password && !hasExistingPassword)}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          {testResult && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                {testResult.imap ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                IMAP
              </span>
              <span className="flex items-center gap-1">
                {testResult.smtp ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                SMTP
              </span>
            </div>
          )}
        </div>

        {testResult?.error && (
          <p className="text-sm text-destructive">{testResult.error}</p>
        )}

        {/* Polling Settings */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="poll-interval" className="whitespace-nowrap">
              Check every
            </Label>
            <Input
              id="poll-interval"
              type="number"
              min={1}
              max={60}
              value={form.pollIntervalMinutes}
              onChange={(e) => updateField('pollIntervalMinutes', Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="polling-toggle">Email Polling</Label>
              <p className="text-sm text-muted-foreground">
                {form.pollingEnabled ? 'Active -- checking for new emails' : 'Paused -- not checking for emails'}
              </p>
            </div>
            <Switch
              id="polling-toggle"
              checked={form.pollingEnabled}
              onCheckedChange={handleTogglePolling}
            />
          </div>
        </div>

        {/* Status Indicator */}
        {configQuery.data?.data?.configured && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`size-2 rounded-full ${form.pollingEnabled ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
              <span className="text-muted-foreground">
                {form.pollingEnabled ? 'Polling active' : 'Polling paused'}
                {configQuery.data.data.lastPollTime === 'active' && ' -- has polled successfully'}
              </span>
            </div>
          </div>
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
            'Save Email Configuration'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
