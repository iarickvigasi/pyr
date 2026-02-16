import { useState, useCallback } from 'react';
import type { ViewMode } from './calendar-types';
import { navigate } from './calendar-utils';

export function useCalendarNavigation() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const goNext = useCallback(() => {
    setCurrentDate((d) => navigate(d, viewMode, 'next'));
  }, [viewMode]);

  const goPrev = useCallback(() => {
    setCurrentDate((d) => navigate(d, viewMode, 'prev'));
  }, [viewMode]);

  const goToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  return {
    currentDate,
    viewMode,
    setViewMode,
    goNext,
    goPrev,
    goToday,
  };
}
