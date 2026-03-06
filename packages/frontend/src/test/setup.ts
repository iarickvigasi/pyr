import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock Next.js image - use createElement to avoid JSX in .ts file
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    return createElement('img', { src, alt });
  },
}));

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
