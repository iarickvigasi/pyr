'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface EmailHtmlRendererProps {
  html: string;
  className?: string;
}

function normalizeEmailHtmlNoise(input: string): string {
  return input
    // Common spacer entity variants used by marketing templates.
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    // Zero-width / invisible separators often used in hidden preheaders.
    .replace(/&#8203;|&#8204;|&#8205;|&#8288;|&#65279;/gi, '')
    .replace(/[\u00A0\u200B\u200C\u200D\u2060\uFEFF]/g, ' ')
    // Collapse very long whitespace runs injected for inbox-preview tricks.
    .replace(/[ \t\r\n]{24,}/g, ' ');
}

export function EmailHtmlRenderer({ html, className }: EmailHtmlRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pendingTimeoutsRef = useRef<number[]>([]);
  const measureIntervalRef = useRef<number | null>(null);
  const [height, setHeight] = useState(200);

  const sanitized = useMemo(() => DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  }), [html]);
  const normalized = useMemo(() => normalizeEmailHtmlNoise(sanitized), [sanitized]);

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="script-src 'none';">
  <base target="_blank">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 8px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; }
    blockquote {
      border-left: 3px solid #d1d5db;
      margin: 0.5em 0;
      padding-left: 1em;
      color: #6b7280;
    }
    pre { overflow-x: auto; }
    table { border-collapse: collapse; max-width: 100%; }
    td, th { padding: 4px 8px; }
  </style>
</head>
<body>${normalized}</body>
</html>`, [normalized]);

  const detachResizeObserver = useCallback(() => {
    if (!resizeObserverRef.current) return;
    resizeObserverRef.current.disconnect();
    resizeObserverRef.current = null;
  }, []);

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const body = doc.body;
    const htmlElement = doc.documentElement;
    const newHeight = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      htmlElement?.scrollHeight ?? 0,
      htmlElement?.offsetHeight ?? 0,
    );
    if (newHeight > 0) {
      setHeight(newHeight + 16);
    }
  }, []);

  const attachResizeObserver = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    detachResizeObserver();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    if (doc.body) observer.observe(doc.body);
    if (doc.documentElement) observer.observe(doc.documentElement);

    resizeObserverRef.current = observer;
  }, [detachResizeObserver, updateHeight]);

  const clearPendingTimeouts = useCallback(() => {
    for (const timeoutId of pendingTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current = [];
  }, []);

  const clearMeasureInterval = useCallback(() => {
    if (measureIntervalRef.current === null) return;
    window.clearInterval(measureIntervalRef.current);
    measureIntervalRef.current = null;
  }, []);

  const scheduleHeightUpdate = useCallback((delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      updateHeight();
    }, delayMs);
    pendingTimeoutsRef.current.push(timeoutId);
  }, [updateHeight]);

  const handleLoad = useCallback(() => {
    updateHeight();
    attachResizeObserver();
    clearMeasureInterval();

    // Re-measure after async layout changes (images/fonts/styles).
    clearPendingTimeouts();
    scheduleHeightUpdate(0);
    scheduleHeightUpdate(50);
    scheduleHeightUpdate(250);
    scheduleHeightUpdate(1000);

    // Some templates finish layout late; poll briefly as a fallback.
    let ticks = 0;
    measureIntervalRef.current = window.setInterval(() => {
      updateHeight();
      ticks += 1;
      if (ticks >= 20) {
        clearMeasureInterval();
      }
    }, 250);
  }, [attachResizeObserver, clearMeasureInterval, clearPendingTimeouts, scheduleHeightUpdate, updateHeight]);

  useEffect(() => {
    // Reset height for new content and perform a best-effort measure even if onLoad fired early.
    setHeight(200);
    clearPendingTimeouts();
    scheduleHeightUpdate(0);
    scheduleHeightUpdate(100);
    scheduleHeightUpdate(300);
  }, [clearPendingTimeouts, scheduleHeightUpdate, srcDoc]);

  useEffect(() => () => {
    clearPendingTimeouts();
    clearMeasureInterval();
    detachResizeObserver();
  }, [clearMeasureInterval, clearPendingTimeouts, detachResizeObserver]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={handleLoad}
      className={cn('w-full border-0', className)}
      style={{ height: `${height}px`, minHeight: '100px' }}
      title="Email content"
    />
  );
}
