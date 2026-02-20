'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface EmailHtmlRendererProps {
  html: string;
  className?: string;
}

export function EmailHtmlRenderer({ html, className }: EmailHtmlRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  });

  const srcDoc = `<!DOCTYPE html>
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
<body>${sanitized}</body>
</html>`;

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const newHeight = iframe.contentDocument.body.scrollHeight;
    if (newHeight > 0) {
      setHeight(newHeight + 16);
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      updateHeight();

      // Observe for dynamic resizes
      if (iframe.contentDocument?.body) {
        const observer = new ResizeObserver(() => {
          updateHeight();
        });
        observer.observe(iframe.contentDocument.body);
        return () => observer.disconnect();
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [updateHeight, srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className={cn('w-full border-0', className)}
      style={{ height: `${height}px`, minHeight: '100px' }}
      title="Email content"
    />
  );
}
