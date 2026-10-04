'use client';
import { useEffect, useState } from 'react';
import { OfficeCategory, officeServices } from '@/lib/office-services';
let pending: ReturnType<typeof officeServices.categories> | undefined;
export function useOfficeCategories() {
  const [categories, setCategories] = useState<OfficeCategory[]>([]);
  useEffect(() => {
    pending ||= officeServices.categories();
    let active = true;
    void pending
      .then((result) => {
        if (active) setCategories(result.categories);
      })
      .catch(() => {
        pending = undefined;
      });
    return () => {
      active = false;
    };
  }, []);
  return categories;
}
