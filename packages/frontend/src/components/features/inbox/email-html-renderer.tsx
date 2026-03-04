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
  const lastHeightRef = useRef<number>(200);
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
    html, body {
      margin: 0;
      padding: 0;
      height: auto !important;
      min-height: 0 !important;
      overflow: hidden;
    }
    #email-root {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      padding: 8px;
      margin: 0;
      min-height: 0 !important;
      height: auto !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    #email-root img { max-width: 100%; height: auto; }
    #email-root a { color: #2563eb; }
    #email-root blockquote {
      border-left: 3px solid #d1d5db;
      margin: 0.5em 0;
      padding-left: 1em;
      color: #6b7280;
    }
    #email-root pre { overflow-x: auto; }
    #email-root table { border-collapse: collapse; max-width: 100%; }
    #email-root td, #email-root th { padding: 4px 8px; }
  </style>
</head>
<body><div id="email-root">${normalized}</div></body>
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

    const root = doc.getElementById('email-root') as HTMLElement | null;
    if (!root) return;

    const newHeight = Math.ceil(
      Math.max(
        root.scrollHeight,
        root.offsetHeight,
        root.getBoundingClientRect().height,
      ),
    );

    if (newHeight > 0) {
      const nextHeight = Math.max(100, newHeight);
      if (Math.abs(nextHeight - lastHeightRef.current) > 1) {
        lastHeightRef.current = nextHeight;
        setHeight(nextHeight);
      }
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

    const root = doc.getElementById('email-root');
    if (root) observer.observe(root);
    if (doc.body) observer.observe(doc.body);

    resizeObserverRef.current = observer;
  }, [detachResizeObserver, updateHeight]);

  const clearPendingTimeouts = useCallback(() => {
    for (const timeoutId of pendingTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current = [];
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

    // Re-measure after async layout changes (images/fonts/styles).
    clearPendingTimeouts();
    scheduleHeightUpdate(0);
    scheduleHeightUpdate(50);
    scheduleHeightUpdate(250);
    scheduleHeightUpdate(1000);

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (doc) {
      for (const image of Array.from(doc.images)) {
        if (image.complete) continue;
        image.addEventListener('load', updateHeight, { once: true });
        image.addEventListener('error', updateHeight, { once: true });
      }
    }
  }, [attachResizeObserver, clearPendingTimeouts, scheduleHeightUpdate, updateHeight]);

  useEffect(() => {
    // Reset height for new content and perform a best-effort measure even if onLoad fired early.
    setHeight(200);
    lastHeightRef.current = 200;
    clearPendingTimeouts();
    scheduleHeightUpdate(0);
    scheduleHeightUpdate(100);
    scheduleHeightUpdate(300);
  }, [clearPendingTimeouts, scheduleHeightUpdate, srcDoc]);

  useEffect(() => () => {
    clearPendingTimeouts();
    detachResizeObserver();
  }, [clearPendingTimeouts, detachResizeObserver]);

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
