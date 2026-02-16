import { useState, useCallback } from 'react';

interface PaginationState {
  cursors: string[];
  hasMore: boolean;
}

export function usePagination() {
  const [state, setState] = useState<PaginationState>({
    cursors: [],
    hasMore: false,
  });

  const currentCursor = state.cursors[state.cursors.length - 1] as
    | string
    | undefined;

  const setResult = useCallback(
    (nextCursor: string | null, hasMore: boolean) => {
      setState((prev) => ({
        cursors: nextCursor ? [...prev.cursors, nextCursor] : prev.cursors,
        hasMore,
      }));
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ cursors: [], hasMore: false });
  }, []);

  return {
    cursor: currentCursor,
    hasMore: state.hasMore,
    setResult,
    reset,
  };
}
