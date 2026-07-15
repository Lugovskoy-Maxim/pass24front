'use client';

import { Clock } from 'lucide-react';
import { User } from '@/lib/api';
import { isAwaitingAdminApproval } from '@/lib/permissions';

export function PendingApprovalBanner({ user }: { user: User | null | undefined }) {
  if (!user || !isAwaitingAdminApproval(user)) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Заявка на регистрацию ожидает подтверждения</p>
        <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
          Администратор проверит данные и откроет доступ. После одобрения вы сможете заказывать пропуска.
        </p>
      </div>
    </div>
  );
}