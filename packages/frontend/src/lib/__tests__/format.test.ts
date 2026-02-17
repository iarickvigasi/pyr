import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatDateTime, formatTime } from '../format';

describe('Format Utilities', () => {
  describe('formatCurrency', () => {
    it('should format cents to euros with symbol', () => {
      expect(formatCurrency(10000)).toBe('€100.00');
      expect(formatCurrency(12345)).toBe('€123.45');
      expect(formatCurrency(99)).toBe('€0.99');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('€0.00');
    });

    it('should handle large amounts', () => {
      expect(formatCurrency(1234567)).toBe('€12,345.67');
      expect(formatCurrency(100000000)).toBe('€1,000,000.00');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-5000)).toBe('-€50.00');
    });

    it('should always show 2 decimal places', () => {
      expect(formatCurrency(10000)).toBe('€100.00');
      expect(formatCurrency(10050)).toBe('€100.50');
      expect(formatCurrency(10099)).toBe('€100.99');
    });
  });

  describe('formatDate', () => {
    it('should format date as DD MMM YYYY', () => {
      const date = new Date('2026-02-16');
      const formatted = formatDate(date);
      expect(formatted).toBe('16 Feb 2026');
    });

    it('should handle different months', () => {
      expect(formatDate(new Date('2026-01-01'))).toBe('01 Jan 2026');
      expect(formatDate(new Date('2026-12-31'))).toBe('31 Dec 2026');
    });

    it('should handle date strings', () => {
      const formatted = formatDate('2026-03-15');
      expect(formatted).toBe('15 Mar 2026');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time', () => {
      const date = new Date('2026-02-16T14:30:00Z');
      const formatted = formatDateTime(date);
      // Note: Result depends on timezone, so we just check format
      expect(formatted).toMatch(/\d{2} \w{3} \d{4}, \d{2}:\d{2}/);
    });

    it('should handle date strings', () => {
      const formatted = formatDateTime('2026-02-16T10:00:00Z');
      expect(formatted).toMatch(/\d{2} \w{3} \d{4}, \d{2}:\d{2}/);
    });
  });

  describe('formatTime', () => {
    it('should format time as HH:mm', () => {
      const date = new Date('2026-02-16T14:30:00Z');
      const formatted = formatTime(date);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    it('should handle date strings', () => {
      const formatted = formatTime('2026-02-16T09:15:00Z');
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid date gracefully', () => {
      expect(() => formatDate('invalid')).not.toThrow();
      expect(() => formatDateTime('invalid')).not.toThrow();
      expect(() => formatTime('invalid')).not.toThrow();
    });

    it('should handle very small currency amounts', () => {
      expect(formatCurrency(1)).toBe('€0.01');
      expect(formatCurrency(5)).toBe('€0.05');
    });
  });
});
