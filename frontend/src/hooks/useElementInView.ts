'use client';

import { useEffect, useState } from 'react';

export function useElementInView<T extends Element>(
  element: T | null,
  options?: IntersectionObserverInit,
): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (!element) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px', ...options },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [element, options?.root, options?.rootMargin, options?.threshold]);

  return inView;
}