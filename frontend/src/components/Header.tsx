'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertCircle,
  LogOut,
  Plus,
  List,
  ClipboardList,
  Settings,
  User,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { officeDisplayName, officePaymentLabel } from '@/lib/api';
import { getUserRoleLabel } from '@/lib/permissions';
import {
  canOrderPasses,
  canSeeOverdueAlerts,
  canUseReception,
  canViewPasses,
  canUseTenantServiceRequests,
  getHomePath,
  hasPermission,
} from '@/lib/permissions';
import { getUiLabels } from '@/lib/ui-labels';
import { useOverdueGuests } from '@/hooks/useOverdueGuests';
import { OverdueGuestsAlert } from '@/components/OverdueGuestsAlert';
import { WorkQueueIndicator } from '@/components/WorkQueueIndicator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';

export function Header() {
  const { user, logout } = useAuth();
  const config = useConfig();
  const pathname = usePathname();
  const L = getUiLabels(config);
  const { theme } = useTheme();
  const showOverdueAlerts = user ? canSeeOverdueAlerts(user) : false;
  const { passes: overduePasses } = useOverdueGuests(showOverdueAlerts);

  if (!user) return null;

  const onControlPage = pathname === '/control';
  const showHeaderOverdueBanner =
    showOverdueAlerts && overduePasses.length > 0 && !onControlPage;
  const unpaidOffices = (user.offices || []).filter(
    (office) =>
      office.paymentStatus === 'unpaid' || office.paymentStatus === 'overdue',
  );
  const unpaidOfficeNotices = unpaidOffices.map((office) => (
    <div key={office.id}>
      {officePaymentLabel(office.paymentStatus)}: {officeDisplayName(office)}
      {office.paidUntil ? ` до ${office.paidUntil}` : ''}
    </div>
  ));

  const scrollToOverdueSection = () => {
    document
      .getElementById('reception-section-overdue')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const homePath = getHomePath(user);

  const links = [
    {
      href: '/passes',
      label: L.nav.passes,
      icon: List,
      show: canViewPasses(user),
    },
    {
      href: '/passes/new',
      label: L.nav.orderPass,
      icon: Plus,
      show: canOrderPasses(user),
    },
    {
      href: '/control',
      label: L.nav.reception,
      icon: ClipboardList,
      show: canUseReception(user),
    },
    { href: '/profile', label: L.nav.profile, icon: User, show: true },
    {
      href: '/requests',
      label: 'Обращения',
      icon: MessageSquare,
      show: canUseTenantServiceRequests(user, config),
    },
    {
      href: '/admin',
      label: L.nav.admin,
      icon: Settings,
      show: hasPermission(user, 'admin.panel'),
    },
  ].filter((l) => l.show);

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'var(--header-bg)',
        borderColor: 'var(--header-border)',
      }}
    >
      <div className="app-header__row max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center shrink-0">
          <Link href={homePath} style={{ color: 'var(--header-text)' }}>
            <SiteBrand
              config={config}
              size="sm"
              variant={theme === 'dark' ? 'dark' : 'light'}
              className="max-w-[200px] max-[360px]:[&_.font-semibold]:hidden max-[360px]:[&_img]:max-w-[112px] sm:max-w-none"
            />
          </Link>
        </div>
        <nav
          className="app-header__navigation hidden sm:flex items-center gap-1"
          aria-label="Основное меню"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== '/admin' && pathname.startsWith(href)) ||
              (href === '/admin' && pathname.startsWith('/admin'));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${active ? 'nav-link-active' : 'nav-link'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          {showOverdueAlerts &&
            overduePasses.length > 0 &&
            (onControlPage ? (
              <button
                type="button"
                onClick={scrollToOverdueSection}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium theme-alert border hover:opacity-90 transition-opacity"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{overduePasses.length}</span>
              </button>
            ) : (
              <OverdueGuestsAlert
                passes={overduePasses}
                labels={L}
                compact
                linkHref="/control#reception-section-overdue"
              />
            ))}
          <div
            className="app-header__identity text-right hidden md:block"
            style={{ color: 'var(--header-text)' }}
          >
            <Link
              href="/profile"
              className="text-sm font-medium hover:opacity-80 hover:underline block truncate"
              title={user.full_name}
            >
              {user.full_name}
            </Link>
            <div
              className="text-xs truncate"
              title={[getUserRoleLabel(user), user.company]
                .filter(Boolean)
                .join(' · ')}
              style={{ color: 'var(--header-muted)' }}
            >
              {getUserRoleLabel(user)}
              {user.company && ` · ${user.company}`}
            </div>
            {!!(user.offices?.length || user.office) && (
              <Link
                href="/profile#profile-offices"
                className="app-header__offices text-xs block truncate hover:underline"
                title={
                  user.offices
                    ?.map((office) =>
                      [office.businessCenterName, officeDisplayName(office)]
                        .filter(Boolean)
                        .join(' · '),
                    )
                    .join('; ') || `Офис ${user.office}`
                }
              >
                {(user.offices?.length || 0) > 1
                  ? `Офисы: ${user.offices!.length}`
                  : user.offices?.length
                    ? [
                        user.offices[0].businessCenterName,
                        officeDisplayName(user.offices[0]),
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : `оф. ${user.office}`}
              </Link>
            )}
          </div>
          <WorkQueueIndicator />
          <ThemeToggle compact />
          <button
            onClick={logout}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--header-muted)',
              border: '1px solid var(--header-border)',
              background: 'var(--header-control-bg)',
            }}
            title={L.nav.logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {unpaidOffices.length > 0 && (
        <div className="border-t theme-alert">
          <div className="max-w-6xl mx-auto px-4 py-2 text-sm">
            {unpaidOffices.length > 2 ? (
              <details>
                <summary className="cursor-pointer">
                  Офисы, требующие оплаты: {unpaidOffices.length}
                </summary>
                <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                  {unpaidOfficeNotices}
                </div>
              </details>
            ) : (
              unpaidOfficeNotices
            )}
          </div>
        </div>
      )}
      {showHeaderOverdueBanner && (
        <div id="overdue-global-alert" className="border-t theme-alert">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <OverdueGuestsAlert
              passes={overduePasses}
              labels={L}
              linkHref="/control#reception-section-overdue"
              className="!p-3 !mb-0 !border-[var(--alert-border)] !bg-transparent"
            />
          </div>
        </div>
      )}
    </header>
  );
}
