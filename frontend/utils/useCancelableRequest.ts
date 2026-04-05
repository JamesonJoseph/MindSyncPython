import { useCallback, useEffect, useRef } from 'react';

export function useCancelableRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  const cancelActiveRequest = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const nextSignal = useCallback(() => {
    cancelActiveRequest();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, [cancelActiveRequest]);

  useEffect(() => {
    return () => {
      cancelActiveRequest();
    };
  }, [cancelActiveRequest]);

  return {
    nextSignal,
    cancelActiveRequest,
  };
}
