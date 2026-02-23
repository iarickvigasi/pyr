"use client";

import { useState, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const SESSION_KEY_STORAGE = 'pyr_assistant_session';
const DEFAULT_SESSION_KEY = 'dashboard:ines';

export interface ToolCall {
  name: string;
  status: 'active' | 'complete';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pyr_token');
}

function getStoredSessionKey(): string {
  if (typeof window === 'undefined') return DEFAULT_SESSION_KEY;
  return localStorage.getItem(SESSION_KEY_STORAGE) ?? DEFAULT_SESSION_KEY;
}

function storeSessionKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY_STORAGE, key);
  }
}

/** Map tool function names to human-readable activity labels */
function toolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_guests: 'Searching guests...',
    get_guest: 'Looking up guest profile...',
    list_guests: 'Fetching guest list...',
    prepare_create_guest: 'Preparing new guest...',
    prepare_update_guest: 'Preparing guest update...',
    prepare_delete_guest: 'Preparing guest archive...',
    prepare_merge_guests: 'Preparing guest merge...',
    list_bookings: 'Looking up bookings...',
    get_booking: 'Checking booking details...',
    prepare_update_booking: 'Preparing booking update...',
    prepare_cancel_booking: 'Preparing booking cancellation...',
    list_rooms: 'Checking rooms...',
    list_room_types: 'Checking room types...',
    check_availability: 'Checking availability...',
    list_events: 'Fetching events...',
    get_event: 'Checking event details...',
    list_event_registrations: 'Checking registrations...',
    prepare_update_event: 'Preparing event update...',
    prepare_delete_event: 'Preparing event deletion...',
    prepare_register_guest: 'Preparing event registration...',
    list_conversations: 'Checking messages...',
    get_conversation: 'Reading conversation...',
    update_conversation: 'Updating conversation...',
    get_dashboard_stats: 'Checking dashboard stats...',
    get_today_schedule: 'Looking up today\'s schedule...',
    get_settings: 'Checking settings...',
    update_setting: 'Updating setting...',
    prepare_create_booking: 'Preparing booking...',
    prepare_create_event: 'Preparing event...',
    confirm_action: 'Confirming action...',
    cancel_action: 'Cancelling action...',
    send_invoice_reminder: 'Checking overdue bookings...',
    update_briefing_time: 'Updating briefing time...',
    list_pending_drafts: 'Checking pending drafts...',
    show_draft: 'Loading email draft...',
    approve_draft: 'Approving draft...',
    reject_draft: 'Rejecting draft...',
    regenerate_draft: 'Regenerating draft...',
  };
  return labels[toolName] ?? `Running ${toolName.replace(/_/g, ' ')}...`;
}

export function useAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [sessionKey, setSessionKey] = useState<string>(() => {
    const fresh = `dashboard:${Date.now()}`;
    storeSessionKey(fresh);
    return fresh;
  });
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const token = getToken();
    if (!token) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    setActiveTools([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/api/v1/assistant/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text, sessionKey }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorMsg = 'Sorry, I couldn\'t process that. Please try again.';
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMsg = `Error: ${errorJson.error.message}`;
          }
        } catch {
          // Use default error message
        }

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id ? { ...m, content: errorMsg } : m
          )
        );
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: 'No response received.' }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      const currentToolCalls: ToolCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              // Handle text content delta
              if (delta?.content) {
                accumulatedContent += delta.content;
                // When content starts streaming, mark active tools as complete
                if (currentToolCalls.some(t => t.status === 'active')) {
                  for (const tc of currentToolCalls) {
                    tc.status = 'complete';
                  }
                  setActiveTools([...currentToolCalls]);
                }
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, content: accumulatedContent, toolCalls: [...currentToolCalls] }
                      : m
                  )
                );
              }

              // Handle tool call deltas
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const fnName = tc.function?.name;
                  if (fnName && !currentToolCalls.find(t => t.name === fnName)) {
                    currentToolCalls.push({ name: fnName, status: 'active' });
                    setActiveTools([...currentToolCalls]);
                  }
                }
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled -- do nothing
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: 'Sorry, I couldn\'t process that. Please try again.' }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setActiveTools([]);
      abortRef.current = null;
    }
  }, [sessionKey]);

  const resetSession = useCallback(async () => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const token = getToken();
    if (!token) return;

    let newKey: string | null = null;

    try {
      const response = await fetch(`${API_BASE}/api/v1/assistant/chat/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const body = await response.json();
        newKey = body.data.sessionKey;
      }
    } catch {
      // Network error -- fall through to client-side key
    }

    // Always generate a fresh session key, even if the endpoint failed
    if (!newKey) {
      newKey = `dashboard:${Date.now()}`;
    }
    setSessionKey(newKey);
    storeSessionKey(newKey);

    setMessages([]);
    setIsStreaming(false);
    setActiveTools([]);
  }, []);

  return {
    messages,
    isStreaming,
    activeTools,
    sendMessage,
    resetSession,
    toolLabel,
  };
}
