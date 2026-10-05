'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { officeDisplayName, officePaymentLabel } from '@/lib/api';
import {
  canSeeOverdueAlerts,
  getHomePath,
  getUserRoleLabel,
} from '@/lib/permissions';
import { getPrimaryNavigation, isNavigationActive } from '@/lib/navigation';
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
  const [openPanel, setOpenPanel] = useState<'account' | 'navigation' | null>(
    null,
  );
  const accountRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const links = user
    ? getPrimaryNavigation(user, config).filter(
        (link) => link.href !== '/profile',
      )
    : [];
  const navigationBreakpoint = links.length <= 3 ? 900 : 1100;

  useEffect(() => setOpenPanel(null), [pathname]);

  useEffect(() => {
    if (!openPanel) return;
    const panelRef = openPanel === 'account' ? accountRef : navigationRef;
    const buttonRef =
      openPanel === 'account' ? accountButtonRef : navigationButtonRef;
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpenPanel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenPanel(null);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    const media = window.matchMedia(
      `(min-width: ${navigationBreakpoint}px), (max-width: 639px)`,
    );
    const closeNavigation = () => {
      if (media.matches)
        setOpenPanel((current) => (current === 'navigation' ? null : current));
    };
    closeNavigation();
    media.addEventListener('change', closeNavigation);
    return () => media.removeEventListener('change', closeNavigation);
  }, [navigationBreakpoint]);

  if (!user) return null;

  const name =
    user.full_name?.trim() || user.username || user.email || 'Аккаунт';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('ru');
  const roleLabel = getUserRoleLabel(user);
  const offices = user.offices || [];
  const officeLabel =
    offices.length > 1
      ? `Офисы: ${offices.length}`
      : offices.length
        ? officeDisplayName(offices[0])
        : user.office
          ? `Офис ${user.office}`
          : '';
  const onControlPage = pathname === '/control';
  const showHeaderOverdueBanner =
    showOverdueAlerts && overduePasses.length > 0 && !onControlPage;
  const unpaidOffices = offices.filter(
    (office) =>
      office.paymentStatus === 'unpaid' || office.paymentStatus === 'overdue',
  );
  const unpaidOfficeNotices = unpaidOffices.map((office) => (
    <div key={office.id}>
      {officePaymentLabel(office.paymentStatus)}: {officeDisplayName(office)}
      {office.paidUntil ? ` до ${office.paidUntil}` : ''}
    </div>
  ));
  const navigationLinks = links.map(({ href, label, icon: Icon }) => {
    const active = isNavigationActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        title={label}
        className={`app-header__nav-link ${active ? 'is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => setOpenPanel(null)}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  });

  return (
    <header
      className={`app-header ${links.length <= 3 ? 'app-header--compact-navigation' : ''}`}
    >
      <a href="#main-content" className="app-header__skip">
        Перейти к содержимому
      </a>
      <div className="app-header__row">
        <div className="app-header__start">
          {links.length > 0 && (
            <div ref={navigationRef} className="app-header__menu">
              <button
                ref={navigationButtonRef}
                type="button"
                className="app-header__control"
                aria-label={
                  openPanel === 'navigation' ? 'Закрыть меню' : 'Открыть меню'
                }
                aria-expanded={openPanel === 'navigation'}
                aria-controls="header-navigation-panel"
                onClick={() =>
                  setOpenPanel((current) =>
                    current === 'navigation' ? null : 'navigation',
                  )
                }
              >
                {openPanel === 'navigation' ? (
                  <X className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Menu className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
              {openPanel === 'navigation' && (
                <nav
                  id="header-navigation-panel"
                  className="app-header__panel app-header__menu-panel"
                  aria-label="Основное меню"
                >
                  <p className="app-header__eyebrow">Разделы</p>
                  {navigationLinks}
                </nav>
              )}
            </div>
          )}
          <Link href={getHomePath(user)} className="app-header__brand">
            <SiteBrand
              config={config}
              size="sm"
              variant={theme === 'dark' ? 'dark' : 'light'}
              className="app-header__brand-content"
            />
          </Link>
        </div>
        <nav className="app-header__navigation" aria-label="Основное меню">
          {navigationLinks}
        </nav>
        <div className="app-header__utilities">
          {showOverdueAlerts &&
            overduePasses.length > 0 &&
            (onControlPage ? (
              <button
                type="button"
                className="app-header__control app-header__overdue"
                title={L.reception.sectionOverdue}
                aria-label={`${L.reception.sectionOverdue}: ${overduePasses.length}`}
                onClick={() =>
                  document
                    .getElementById('reception-section-overdue')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
                <span className="app-header__count">
                  {overduePasses.length > 99 ? '99+' : overduePasses.length}
                </span>
              </button>
            ) : (
              <Link
                href="/control#reception-section-overdue"
                className="app-header__control app-header__overdue"
                title={L.reception.sectionOverdue}
                aria-label={`${L.reception.sectionOverdue}: ${overduePasses.length}`}
              >
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
                <span className="app-header__count">
                  {overduePasses.length > 99 ? '99+' : overduePasses.length}
                </span>
              </Link>
            ))}
          <WorkQueueIndicator />
          <ThemeToggle compact className="app-header__control" />
          <div ref={accountRef} className="app-header__account">
            <button
              ref={accountButtonRef}
              type="button"
              className={`app-header__account-button ${isNavigationActive(pathname, '/profile') ? 'is-current' : ''}`}
              aria-label={`Аккаунт: ${name}`}
              aria-expanded={openPanel === 'account'}
              aria-controls="header-account-panel"
              onClick={() =>
                setOpenPanel((current) =>
                  current === 'account' ? null : 'account',
                )
              }
            >
              <span className="app-header__avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="app-header__identity">
                <span className="app-header__name" title={name}>
                  {name}
                </span>
                <span className="app-header__context">
                  <span className="app-header__role" title={roleLabel}>
                    {roleLabel}
                  </span>
                  {officeLabel && (
                    <span className="app-header__offices" title={officeLabel}>
                      {officeLabel}
                    </span>
                  )}
                </span>
              </span>
              <ChevronDown
                className="app-header__chevron w-4 h-4"
                aria-hidden="true"
              />
            </button>
            {openPanel === 'account' && (
              <section
                id="header-account-panel"
                className="app-header__panel app-header__account-panel"
                aria-label="Меню аккаунта"
              >
                <div className="app-header__account-info">
                  <span className="app-header__role-badge">{roleLabel}</span>
                  <p className="app-header__account-name">{name}</p>
                  {user.company && (
                    <p className="app-header__company">{user.company}</p>
                  )}
                </div>
                {officeLabel && (
                  <div className="app-header__office-section">
                    <div className="app-header__office-heading">
                      <span>
                        <Building2 className="w-4 h-4" aria-hidden="true" />
                        {offices.length > 1
                          ? `Ваши офисы · ${offices.length}`
                          : 'Ваш офис'}
                      </span>
                      <Link
                        href="/profile#profile-offices"
                        onClick={() => setOpenPanel(null)}
                        aria-label="Открыть офисы в профиле"
                      >
                        <span>{offices.length > 1 ? 'Все' : 'Открыть'}</span>
                        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    </div>
                    <ul
                      className="app-header__office-list"
                      aria-label="Ваши офисы"
                      tabIndex={offices.length > 3 ? 0 : undefined}
                    >
                      {offices.length ? (
                        offices.map((office) => (
                          <li key={office.id}>
                            <span className="app-header__office-name">
                              {officeDisplayName(office)}
                            </span>
                            {office.businessCenterName && (
                              <span className="app-header__office-bc">
                                {office.businessCenterName}
                              </span>
                            )}
                            {office.category?.name && (
                              <span className="app-header__office-category">
                                {office.category.name}
                              </span>
                            )}
                          </li>
                        ))
                      ) : (
                        <li>
                          <span className="app-header__office-name">
                            {officeLabel}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="app-header__account-actions">
                  <Link
                    href="/profile"
                    className="app-header__account-link"
                    onClick={() => setOpenPanel(null)}
                  >
                    <User className="w-4 h-4" aria-hidden="true" />
                    <span>{L.nav.profile}</span>
                    <ArrowUpRight
                      className="w-4 h-4 ml-auto"
                      aria-hidden="true"
                    />
                  </Link>
                  <button
                    type="button"
                    className="app-header__account-link app-header__logout"
                    onClick={() => {
                      setOpenPanel(null);
                      logout();
                    }}
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    {L.nav.logout}
                  </button>
                </div>
              </section>
            )}
          </div>
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
