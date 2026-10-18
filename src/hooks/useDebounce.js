import { useCallback, useRef } from "react";

export const useDebounce = (fn, delay = 500) => {
  const timerRef = useRef(null);

  const debouncedFn = useCallback(
    (...args) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );

  return debouncedFn;
};
