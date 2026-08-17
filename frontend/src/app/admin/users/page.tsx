'use client';

import {
  Suspense,
  useEffect,
  useState,
  useCallback,
  FormEvent,
  Fragment,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  Search,
  Pencil,
  Link2,
  X,
  Users,
  Building2,
  UserCog,
  Check,
  Clock,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Fingerprint,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminModal } from '@/components/AdminModal';
import {
  api,
  AdminUser,
  BusinessCenter,
  CreateUserData,
  Office,
  ProfileChangeRequest,
  ROLE_LABELS,
  UserCategory,
  UserFilters,
  UserRole,
  formatTenantOffices,
  getErrorMessage,
  getRoleLabel,
} from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { PersonNameFields } from '@/components/PersonNameFields';
import {
  buildFullName,
  getUserNameLabels,
  isPersonNameValid,
  PersonNameParts,
  splitFullName,
} from '@/lib/person-name';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import {
  identityStatusLabel,
  legalFormLabel,
  profileTypeLabel,
} from '@/lib/pass-identity';

const EMPTY: CreateUserData = {
  email: '',
  password: '',
  username: '',
  displayName: '',
  emailVerified: true,
  privateDataComplete: false,
  role: 'tenant',
  phone: '',
  company: '',
  companyLogo: '',
  office: '',
  floor: '',
  officeIds: [],
  propertyIds: [],
  profileType: 'individual',
  legalForm: null,
  companyShortName: '',
  employeeLimit: null,
};

const MAX_COMPANY_LOGO_BYTES = 80 * 1024;

const EMPTY_NAME: PersonNameParts = {
  lastName: '',
  firstName: '',
  middleName: '',
};

const STAFF_ROLES: UserRole[] = ['security', 'bc_admin', 'admin'];

const EMPTY_FILTERS: Omit<UserFilters, 'category'> = {
  search: '',
  isActive: '',
  propertyId: '',
  officeId: '',
  role: '',
};

function AdminUsersPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const ph = getUiLabels(useConfig()).placeholders;
  const [category, setCategory] = useState<UserCategory>(() =>
    searchParams.get('category') === 'staff' ? 'staff' : 'tenants',
  );
  const [profileRequests, setProfileRequests] = useState<
    Array<{ user: AdminUser; request: ProfileChangeRequest }>
  >([]);
  const [registrationRequests, setRegistrationRequests] = useState<AdminUser[]>(
    [],
  );
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ tenants: 0, staff: 0 });
  const [allOffices, setAllOffices] = useState<Office[]>([]);
  const [businessCenters, setBusinessCenters] = useState<BusinessCenter[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  // Всегда string — иначе useDebounce(string | undefined) ломает production typecheck
  const debouncedSearch = useDebounce(filters.search ?? '');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserData>(EMPTY);
  const [nameParts, setNameParts] = useState<PersonNameParts>(EMPTY_NAME);
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [officePickerSearch, setOfficePickerSearch] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [expandedOwners, setExpandedOwners] = useState<Record<string, boolean>>(
    {},
  );
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const buildQuery = useCallback(
    (
      cat: UserCategory,
      applied: typeof appliedFilters,
      search?: string,
    ): UserFilters => ({
      category: cat,
      search: search?.trim() || undefined,
      isActive: applied.isActive || undefined,
      propertyId: applied.propertyId || undefined,
      officeId: cat === 'tenants' ? applied.officeId || undefined : undefined,
      role: cat === 'staff' ? applied.role || undefined : undefined,
    }),
    [],
  );

  const loadProfileRequests = useCallback(() => {
    return api.admin
      .getProfileChangeRequests()
      .then(({ requests }) => setProfileRequests(requests))
      .catch(() => setProfileRequests([]));
  }, []);

  const loadRegistrationRequests = useCallback(() => {
    return api.admin
      .getRegistrationRequests()
      .then(({ requests }) => setRegistrationRequests(requests))
      .catch(() => setRegistrationRequests([]));
  }, []);

  const load = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent;
      if (!silent) {
        setLoading(true);
        setLoadError('');
        setLoadErrorCause(null);
      }
      return Promise.all([
        api.admin.getUsers(
          buildQuery(category, appliedFilters, debouncedSearch),
        ),
        api.admin.getOffices(),
        api.admin.getBusinessCenters(),
      ])
        .then(
          ([
            { users: data, total: t, counts: c },
            { offices },
            { businessCenters: bc },
          ]) => {
            setUsers(data);
            setTotal(t);
            setCounts(c);
            setAllOffices(offices.filter((o) => o.isActive));
            setBusinessCenters(bc.filter((b) => b.isActive));
          },
        )
        .catch((err) => {
          if (!silent) {
            setLoadErrorCause(err);
            setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
          }
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [category, appliedFilters, debouncedSearch, buildQuery],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refreshModeration = useCallback(() => {
    if (category !== 'tenants') return Promise.resolve();
    return Promise.all([loadProfileRequests(), loadRegistrationRequests()]);
  }, [category, loadProfileRequests, loadRegistrationRequests]);

  useAutoRefresh(
    () => {
      void load({ silent: true });
      void refreshModeration();
    },
    { enabled: !saving && !showForm },
  );

  useEffect(() => {
    if (category === 'tenants') {
      loadProfileRequests();
      loadRegistrationRequests();
    } else {
      setProfileRequests([]);
      setRegistrationRequests([]);
    }
  }, [category]);

  // из письма / меню: ?highlight=registration
  useEffect(() => {
    if (searchParams.get('highlight') !== 'registration') return;
    setCategory('tenants');
    if (!registrationRequests.length) return;
    const t = window.setTimeout(() => {
      document
        .getElementById('registration-requests')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => window.clearTimeout(t);
  }, [searchParams, registrationRequests.length]);

  const handleApproveRegistration = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.approveRegistration(id);
      toast(
        'Регистрация подтверждена. Назначьте офис в карточке пользователя.',
        'success',
      );
      load();
      loadRegistrationRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleRejectRegistration = async (id: string) => {
    if (
      !window.confirm(
        'Отклонить заявку на регистрацию? Пользователь сможет подать заявку повторно.',
      )
    ) {
      return;
    }
    setModeratingId(id);
    try {
      await api.admin.rejectRegistration(id);
      toast('Заявка на регистрацию отклонена', 'success');
      load();
      loadRegistrationRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleApproveProfile = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.approveProfileChange(id);
      toast('Изменения профиля подтверждены', 'success');
      load();
      loadProfileRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleRejectProfile = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.rejectProfileChange(id);
      toast('Изменения профиля отклонены', 'success');
      load();
      loadProfileRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const applyFilters = () => setAppliedFilters({ ...filters });

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const switchCategory = (cat: UserCategory) => {
    setCategory(cat);
    setFilters((prev) => ({
      ...prev,
      role: '',
      officeId: cat === 'staff' ? '' : prev.officeId,
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      role: '',
      officeId: cat === 'staff' ? '' : prev.officeId,
    }));
  };

  const hasActiveFilters = !!(
    appliedFilters.isActive ||
    appliedFilters.propertyId ||
    appliedFilters.officeId ||
    appliedFilters.role ||
    debouncedSearch
  );

  const officesForFilter = filters.propertyId
    ? allOffices.filter((o) => o.propertyId === filters.propertyId)
    : allOffices;

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY, role: category === 'tenants' ? 'tenant' : 'security' });
    setNameParts(EMPTY_NAME);
    setOfficeIds([]);
    setPropertyIds([]);
    setOfficePickerSearch('');
    setIsActive(true);
    setIsBlocked(false);
    setShowForm(true);
    setError('');
  };

  const openEdit = (u: AdminUser) => {
    setEditId(u.id);
    // Сотрудник компании: роль не меняем на tenant/staff в форме — только профиль
    const formRole = u.parentTenantId ? (u.role as UserRole) : u.role;
    setForm({
      email: u.email,
      password: '',
      username: u.username || '',
      displayName: u.displayName || '',
      emailVerified: u.emailVerified !== false,
      privateDataComplete: !!u.privateDataComplete,
      role: formRole,
      phone: u.phone || '',
      company: u.company || '',
      companyLogo: u.companyLogo || '',
      office: u.office || '',
      floor: u.floor || '',
      profileType: (u.profileType as CreateUserData['profileType']) || 'individual',
      legalForm: u.legalForm ?? null,
      companyShortName: u.companyShortName || '',
      employeeLimit: u.employeeLimit ?? null,
    });
    setNameParts(
      u.lastName || u.firstName
        ? {
            lastName: u.lastName || '',
            firstName: u.firstName || '',
            middleName: u.middleName || '',
          }
        : splitFullName(u.fullName),
    );
    setOfficeIds(u.offices?.map((o) => o.id) || []);
    setPropertyIds(
      u.propertyIds || u.businessCenters?.map((bc) => bc.id) || [],
    );
    setOfficePickerSearch('');
    setIsActive(u.isActive && !u.invitePending);
    setIsBlocked(!!u.isBlocked);
    setShowForm(true);
    setError('');
  };

  const toggleOffice = (id: string) => {
    setOfficeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleDeleteUser = async (u: AdminUser) => {
    const isCompanyEmployee = !!u.parentTenantId;
    const kind = isCompanyEmployee
      ? 'сотрудника компании'
      : category === 'tenants'
        ? 'арендатора'
        : 'сотрудника';
    const extra =
      !isCompanyEmployee && category === 'tenants'
        ? '\nОфисы компании будут отвязаны. Если есть сотрудники компании — сначала удалите их.'
        : isCompanyEmployee
          ? '\nПропуска сотрудника будут переназначены владельцу компании.'
          : '';
    if (
      !window.confirm(
        `Удалить ${kind} «${u.fullName}» (${u.email})?${extra}\n\nДействие нельзя отменить.`,
      )
    ) {
      return;
    }
    setDeletingUserId(u.id);
    try {
      await api.admin.deleteUser(u.id);
      toast('Пользователь удалён', 'success');
      if (editId === u.id) setShowForm(false);
      load();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка удаления'), 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  const toggleProperty = (id: string) => {
    setPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const officesByBc = allOffices.reduce(
    (acc, office) => {
      const key = office.businessCenterName || 'Без БЦ';
      if (!acc[key]) acc[key] = [];
      acc[key].push(office);
      return acc;
    },
    {} as Record<string, Office[]>,
  );

  const officePickerQuery = officePickerSearch.trim().toLowerCase();
  const filteredOfficesByBc = Object.entries(officesByBc).reduce(
    (acc, [bc, list]) => {
      const filtered = officePickerQuery
        ? list.filter((o) => {
            const hay =
              `${o.number} ${o.floor || ''} ${o.company || ''} ${o.tenantName || ''} ${bc}`.toLowerCase();
            return hay.includes(officePickerQuery);
          })
        : list;
      if (filtered.length) acc[bc] = filtered;
      return acc;
    },
    {} as Record<string, Office[]>,
  );

  const selectedOfficeChips = allOffices.filter((o) =>
    officeIds.includes(o.id),
  );

  const formatBindings = (u: AdminUser) => {
    if ((u.role === 'tenant' || u.isTenantOwner) && u.offices?.length)
      return formatTenantOffices(u.offices);
    if (
      (u.role === 'security' || u.role === 'bc_admin') &&
      u.businessCenters?.length
    ) {
      return u.businessCenters.map((bc) => bc.name).join(' · ');
    }
    if (u.office) return `оф. ${u.office}`;
    return '—';
  };

  const toggleOwnerExpanded = (ownerId: string) => {
    setExpandedOwners((prev) => ({ ...prev, [ownerId]: !prev[ownerId] }));
  };

  const statusBadge = (u: AdminUser) => {
    const base =
      'inline-flex items-center text-xs px-2 py-0.5 rounded-full leading-tight whitespace-nowrap';
    if (u.isBlocked) {
      return (
        <span className={`${base} bg-red-100 text-red-800`}>Заблокирован</span>
      );
    }
    if (u.invitePending) {
      return (
        <span className={`${base} bg-sky-50 text-sky-800`}>Приглашение</span>
      );
    }
    if (u.identityStatus && u.identityStatus !== 'active' && !u.isActive) {
      return (
        <span className={`${base} bg-amber-50 text-amber-800`}>
          {identityStatusLabel(u.identityStatus)}
        </span>
      );
    }
    if (u.isActive) {
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700`}>
          Активен
        </span>
      );
    }
    if (u.role === 'tenant' && !u.parentTenantId && !u.offices?.length) {
      return (
        <span
          className={`${base} bg-amber-50 text-amber-800`}
          title="Ожидает подтверждения администратором"
        >
          Ожидает
        </span>
      );
    }
    return <span className={`${base} bg-red-50 text-red-600`}>Отключён</span>;
  };

  // Авто-раскрытие компаний, если поиск совпал с сотрудником (пришли owners через employee search)
  useEffect(() => {
    if (category !== 'tenants' || !debouncedSearch.trim()) return;
    const next: Record<string, boolean> = {};
    users.forEach((u) => {
      if (u.employees?.length) next[u.id] = true;
    });
    if (Object.keys(next).length)
      setExpandedOwners((prev) => ({ ...prev, ...next }));
  }, [users, category, debouncedSearch]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isPersonNameValid(nameParts)) {
      setError('Укажите фамилию и имя');
      return;
    }
    setSaving(true);
    try {
      const isCompanyEmployee =
        form.role === 'tenant_employee' ||
        (!!editId &&
          users.flatMap((x) => x.employees || []).some((e) => e.id === editId));
      const base = {
        lastName: nameParts.lastName.trim(),
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim() || undefined,
        fullName: buildFullName(nameParts),
        username: form.username?.trim() || '',
        displayName: form.displayName?.trim() || undefined,
        emailVerified: form.emailVerified !== false,
        privateDataComplete: !!form.privateDataComplete,
        phone: form.phone || undefined,
        company: form.company || undefined,
        companyLogo:
          form.role === 'tenant' && !isCompanyEmployee
            ? form.companyLogo || ''
            : undefined,
        office:
          !isCompanyEmployee &&
          form.role !== 'tenant' &&
          form.role !== 'security'
            ? form.office || undefined
            : undefined,
        floor:
          !isCompanyEmployee &&
          form.role !== 'tenant' &&
          form.role !== 'security'
            ? form.floor || undefined
            : undefined,
        officeIds:
          form.role === 'tenant' && !isCompanyEmployee ? officeIds : undefined,
        propertyIds:
          form.role === 'security' || form.role === 'bc_admin'
            ? propertyIds
            : undefined,
        profileType:
          form.role === 'tenant' && !isCompanyEmployee
            ? form.profileType || 'individual'
            : undefined,
        legalForm:
          form.role === 'tenant' && !isCompanyEmployee
            ? form.profileType === 'company'
              ? form.legalForm || 'ooo'
              : null
            : undefined,
        companyShortName:
          form.role === 'tenant' && !isCompanyEmployee
            ? form.companyShortName || ''
            : undefined,
        employeeLimit:
          form.role === 'tenant' && !isCompanyEmployee
            ? form.employeeLimit
            : undefined,
      };
      if (editId) {
        // Сотрудник компании: роль не отправляем (бэкенд её не меняет)
        await api.admin.updateUser(editId, {
          ...base,
          ...(isCompanyEmployee ? {} : { role: form.role }),
          isActive,
          isBlocked,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        // createUser требует role: UserRole
        await api.admin.createUser({
          email: form.email,
          password: form.password,
          role: form.role,
          ...base,
          officeIds: form.role === 'tenant' ? officeIds : undefined,
          propertyIds:
            form.role === 'security' || form.role === 'bc_admin'
              ? propertyIds
              : undefined,
        });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Пользователи">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Учётные записи живут в Pass. Арендаторы и сотрудники компании · охрана
        и админы БЦ
      </p>

      {loadError && (
        <PageError
          className="mb-6"
          message={loadError}
          error={loadErrorCause}
          onRetry={load}
          retryLabel="Повторить"
        />
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => switchCategory('tenants')}
          className={`btn text-sm ${category === 'tenants' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Building2 className="w-4 h-4" />
          Арендаторы
          <span className="ml-1 opacity-80">({counts.tenants})</span>
        </button>
        <button
          type="button"
          onClick={() => switchCategory('staff')}
          className={`btn text-sm ${category === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <UserCog className="w-4 h-4" />
          Сотрудники
          <span className="ml-1 opacity-80">({counts.staff})</span>
        </button>
      </div>

      <div className="card p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left"
              placeholder={ph.userSearch || 'ФИО, email, телефон, компания, usr_…'}
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </div>

          <div className="select-wrap">
            <select
              className="input"
              value={filters.isActive}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  isActive: e.target.value as UserFilters['isActive'],
                }))
              }
            >
              <option value="">Все статусы</option>
              <option value="true">Активные</option>
              <option value="false">Неактивные / ожидают подтверждения</option>
            </select>
          </div>

          <div className="select-wrap">
            <select
              className="input"
              value={filters.propertyId}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  propertyId: e.target.value,
                  officeId: e.target.value ? prev.officeId : '',
                }))
              }
            >
              <option value="">Все бизнес-центры</option>
              {businessCenters.map((bc) => (
                <option key={bc.id} value={bc.id}>
                  {bc.name}
                </option>
              ))}
            </select>
          </div>

          {category === 'tenants' ? (
            <div className="select-wrap">
              <select
                className="input"
                value={filters.officeId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, officeId: e.target.value }))
                }
              >
                <option value="">Все офисы</option>
                {officesForFilter.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.businessCenterName
                      ? `${office.businessCenterName}: `
                      : ''}
                    оф. {office.number}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="select-wrap">
              <select
                className="input"
                value={filters.role}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                <option value="">Все роли</option>
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={applyFilters}
          >
            Применить
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={resetFilters}
            >
              <X className="w-4 h-4" />
              Сбросить
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary text-sm ml-auto"
            onClick={openCreate}
          >
            <Plus className="w-4 h-4" />
            {category === 'tenants'
              ? 'Добавить арендатора'
              : 'Добавить сотрудника'}
          </button>
        </div>

        {hasActiveFilters && (
          <p className="text-xs text-[var(--muted)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Найдено: {total}
          </p>
        )}
      </div>

      {category === 'tenants' && registrationRequests.length > 0 && (
        <div
          id="registration-requests"
          className="card p-5 mb-6 border-2 border-[var(--status-pending-border)] theme-alert-subtle space-y-3 scroll-mt-24 shadow-[0_0_0_3px_var(--status-pending-soft)]"
        >
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <Clock className="w-4 h-4" />
            Заявки на регистрацию ({registrationRequests.length})
            <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--status-pending)] text-[var(--status-badge-on)]">
              нужно действие
            </span>
          </div>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            После подтверждения назначьте офис арендатору в карточке
            пользователя.
          </p>
          {registrationRequests.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-[var(--alert-border)] bg-[var(--surface)] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="text-sm">
                <div className="font-medium">{u.fullName}</div>
                <div className="text-[var(--muted)] mt-1">
                  {u.email || '—'}
                  {u.email && (
                    <span
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${u.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {u.emailVerified
                        ? 'email подтверждён'
                        : 'email не подтверждён'}
                    </span>
                  )}
                </div>
                <div className="text-[var(--muted)] mt-1">
                  {u.company && `Компания: ${u.company}`}
                  {u.phone ? ` · Тел.: ${u.phone}` : ''}
                  {u.createdAt
                    ? ` · ${new Date(u.createdAt).toLocaleString('ru-RU')}`
                    : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-success text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleApproveRegistration(u.id)}
                >
                  <Check className="w-4 h-4" />
                  Подтвердить
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => openEdit(u)}
                >
                  <Pencil className="w-4 h-4" />
                  Назначить офис
                </button>
                <button
                  type="button"
                  className="btn btn-danger text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleRejectRegistration(u.id)}
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {category === 'tenants' && profileRequests.length > 0 && (
        <div className="card p-5 mb-6 border theme-alert-subtle space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Clock className="w-4 h-4" />
            Заявки на изменение профиля ({profileRequests.length})
          </div>
          {profileRequests.map(({ user: u, request }) => (
            <div
              key={u.id}
              className="rounded-lg border border-[var(--alert-border)] bg-[var(--surface)] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {u.fullName} →{' '}
                  <span className="text-[var(--primary)]">
                    {request.full_name}
                  </span>
                </div>
                <div className="text-[var(--muted)] mt-1">{u.email}</div>
                <div className="text-[var(--muted)] mt-1">
                  {(request.company || u.company) &&
                    `Компания: ${u.company || '—'} → ${request.company || '—'} · `}
                  {(request.company_short_name || u.companyShortName) &&
                    `Кратко: ${u.companyShortName || '—'} → ${request.company_short_name || '—'} · `}
                  {(request.profile_type || u.profileType) &&
                    `Тип: ${profileTypeLabel(u.profileType)} → ${profileTypeLabel(request.profile_type)} · `}
                  {(request.legal_form || u.legalForm) &&
                    `Форма: ${legalFormLabel(u.legalForm)} → ${legalFormLabel(request.legal_form)} · `}
                  {(request.phone || u.phone) &&
                    `Тел.: ${u.phone || '—'} → ${request.phone || '—'} · `}
                  {new Date(request.requested_at).toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-success text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleApproveProfile(u.id)}
                >
                  <Check className="w-4 h-4" />
                  Подтвердить
                </button>
                <button
                  type="button"
                  className="btn btn-danger text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleRejectProfile(u.id)}
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal
        open={showForm}
        wide
        title={
          editId
            ? users
                .flatMap((x) => x.employees || [])
                .some((e) => e.id === editId)
              ? 'Редактирование сотрудника компании'
              : 'Редактирование пользователя'
            : 'Новый пользователь'
        }
        onClose={() => setShowForm(false)}
      >
        <form
          id="admin-user-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                disabled={!!editId}
              />
            </div>
            <div>
              <label className="label">
                {editId ? 'Новый пароль' : 'Пароль *'}
              </label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editId}
                minLength={6}
              />
            </div>
            <div>
              <label className="label">Логин (username)</label>
              <input
                className="input"
                value={form.username || ''}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
                placeholder="необязательно"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label">Отображаемое имя</label>
              <input
                className="input"
                value={form.displayName || ''}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                placeholder="по умолчанию ФИО"
              />
            </div>
            <div className="sm:col-span-2">
              <PersonNameFields
                value={nameParts}
                labels={getUserNameLabels(
                  form.role === 'tenant' || form.role === 'tenant_employee'
                    ? 'tenant'
                    : form.role,
                )}
                onChange={setNameParts}
              />
            </div>
            <div>
              <label className="label">Роль *</label>
              <div className="select-wrap">
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as UserRole })
                  }
                  disabled={
                    !!editId &&
                    !!users
                      .flatMap((x) => x.employees || [])
                      .some((e) => e.id === editId)
                  }
                >
                  {form.role === 'tenant_employee' && (
                    <option value="tenant_employee">
                      {getRoleLabel('tenant_employee')}
                    </option>
                  )}
                  {category === 'tenants' && form.role !== 'tenant_employee' ? (
                    <option value="tenant">{ROLE_LABELS.tenant}</option>
                  ) : null}
                  {category === 'staff' &&
                    form.role !== 'tenant_employee' &&
                    STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {getRoleLabel(role)}
                      </option>
                    ))}
                  {category === 'staff' && form.role !== 'tenant_employee' && (
                    <option value="tenant">{ROLE_LABELS.tenant}</option>
                  )}
                  {category === 'tenants' &&
                    form.role !== 'tenant_employee' &&
                    form.role !== 'tenant' && (
                      <option value={form.role}>
                        {getRoleLabel(form.role)}
                      </option>
                    )}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Компания</label>
              <input
                className="input"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Телефон</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            {form.role === 'tenant' &&
              !users
                .flatMap((x) => x.employees || [])
                .some((e) => e.id === editId) && (
                <>
                  <div>
                    <label className="label">Тип профиля</label>
                    <div className="select-wrap">
                      <select
                        className="input"
                        value={form.profileType || 'individual'}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            profileType: e.target.value as 'individual' | 'company',
                            legalForm:
                              e.target.value === 'company'
                                ? form.legalForm || 'ooo'
                                : null,
                          })
                        }
                      >
                        <option value="individual">Физлицо</option>
                        <option value="company">Компания</option>
                      </select>
                    </div>
                  </div>
                  {form.profileType === 'company' && (
                    <div>
                      <label className="label">Правовая форма</label>
                      <div className="select-wrap">
                        <select
                          className="input"
                          value={form.legalForm || 'ooo'}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              legalForm: e.target.value as 'ip' | 'ooo',
                            })
                          }
                        >
                          <option value="ooo">ООО</option>
                          <option value="ip">ИП</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="label">Краткое название</label>
                    <input
                      className="input"
                      value={form.companyShortName || ''}
                      onChange={(e) =>
                        setForm({ ...form, companyShortName: e.target.value })
                      }
                      placeholder="для документов и снимков"
                    />
                  </div>
                  <div>
                    <label className="label">Лимит сотрудников</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={200}
                      value={form.employeeLimit ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          employeeLimit:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      placeholder="по умолчанию 3"
                    />
                  </div>
                </>
              )}
            {form.role === 'tenant' &&
              !users
                .flatMap((x) => x.employees || [])
                .some((e) => e.id === editId) && (
                <div className="sm:col-span-2 space-y-2">
                  <label className="label">Логотип компании</label>
                  <div className="flex flex-wrap items-center gap-3">
                    {form.companyLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.companyLogo}
                        alt="Логотип"
                        className="w-16 h-16 object-contain"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-center text-[10px] text-[var(--muted)]">
                        нет
                      </div>
                    )}
                    <label className="btn btn-secondary text-xs cursor-pointer">
                      Загрузить
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith('image/')) {
                            toast(
                              'Загрузите изображение (PNG, JPG, SVG)',
                              'error',
                            );
                            return;
                          }
                          if (file.size > MAX_COMPANY_LOGO_BYTES) {
                            toast(
                              'Файл слишком большой. Максимум 80 КБ',
                              'error',
                            );
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () =>
                            setForm((prev) => ({
                              ...prev,
                              companyLogo: String(reader.result || ''),
                            }));
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {form.companyLogo ? (
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, companyLogo: '' }))
                        }
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Показывается на карточке и странице пропуска вместо иконки
                    типа
                  </p>
                </div>
              )}
          </div>

          {editId &&
            users
              .flatMap((x) => x.employees || [])
              .some((e) => e.id === editId) && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]">
                Сотрудник компании
                {users.find((x) => x.employees?.some((e) => e.id === editId))
                  ?.fullName
                  ? ` «${users.find((x) => x.employees?.some((e) => e.id === editId))?.fullName}»`
                  : ''}
                . Офисы наследуются от владельца; приглашения отправляет
                владелец из профиля.
              </div>
            )}

          {form.role === 'tenant' &&
            !users
              .flatMap((x) => x.employees || [])
              .some((e) => e.id === editId) && (
              <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[var(--primary)]" />
                    <span className="font-medium text-sm">
                      Привязка к офисам
                    </span>
                  </div>
                  {officeIds.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--muted)] hover:text-[var(--primary)]"
                      onClick={() => setOfficeIds([])}
                    >
                      Снять все
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Выберите офисы компании. Занятый офис при сохранении перейдёт
                  к этому арендатору.
                </p>

                {selectedOfficeChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedOfficeChips.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--status-approved-soft)] text-[var(--status-approved)] border border-[var(--status-approved-border)]"
                        onClick={() => toggleOffice(o.id)}
                        title="Убрать"
                      >
                        {o.businessCenterName
                          ? `${o.businessCenterName}: `
                          : ''}
                        оф. {o.number}
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}

                {allOffices.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                    Сначала добавьте офисы в реестре или создайте тестовые
                    данные.
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                      <input
                        className="input input--icon-left text-sm"
                        value={officePickerSearch}
                        onChange={(e) => setOfficePickerSearch(e.target.value)}
                        placeholder="Поиск офиса, БЦ, компании..."
                      />
                    </div>
                    <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-64 overflow-y-auto bg-[var(--surface)]">
                      {Object.keys(filteredOfficesByBc).length === 0 ? (
                        <div className="p-4 text-sm text-[var(--muted)] text-center">
                          Ничего не найдено
                        </div>
                      ) : (
                        Object.entries(filteredOfficesByBc).map(
                          ([bc, offices]) => (
                            <div key={bc} className="p-3">
                              <div className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">
                                {bc}
                              </div>
                              <div className="space-y-1.5">
                                {offices.map((office) => {
                                  const checked = officeIds.includes(office.id);
                                  const occupiedByOther = !!(
                                    office.tenantId &&
                                    office.tenantId !== editId
                                  );
                                  return (
                                    <label
                                      key={office.id}
                                      className={`flex items-start gap-2.5 text-sm cursor-pointer rounded-md px-2 py-1.5 -mx-1 ${
                                        checked
                                          ? 'bg-[var(--status-approved-soft)]'
                                          : 'hover:bg-[var(--surface-muted)]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={checked}
                                        onChange={() => toggleOffice(office.id)}
                                      />
                                      <span className="min-w-0">
                                        <span className="font-medium">
                                          оф. {office.number}
                                        </span>
                                        {office.floor ? (
                                          <span className="text-[var(--muted)]">
                                            {' '}
                                            · {office.floor} эт.
                                          </span>
                                        ) : null}
                                        {occupiedByOther ? (
                                          <span className="block text-[11px] text-amber-700 mt-0.5">
                                            Занят:{' '}
                                            {office.tenantName ||
                                              'другой арендатор'}
                                            {office.company
                                              ? ` (${office.company})`
                                              : ''}{' '}
                                            — при сохранении перейдёт сюда
                                          </span>
                                        ) : office.company ? (
                                          <span className="block text-[11px] text-[var(--muted)]">
                                            {office.company}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  </>
                )}
                <p className="text-xs text-[var(--muted)]">
                  {officeIds.length > 0
                    ? `Выбрано офисов: ${officeIds.length}`
                    : 'Офисы не выбраны — заказ пропусков будет недоступен'}
                </p>
              </div>
            )}

          {(form.role === 'security' || form.role === 'bc_admin') && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)]">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-medium text-sm">
                  {form.role === 'bc_admin'
                    ? 'Бизнес-центры под управлением'
                    : 'Привязка к бизнес-центрам'}
                </span>
              </div>
              {businessCenters.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Сначала создайте бизнес-центры.
                </p>
              ) : (
                <div className="space-y-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 max-h-48 overflow-y-auto">
                  {businessCenters.map((bc) => (
                    <label
                      key={bc.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={propertyIds.includes(bc.id)}
                        onChange={() => toggleProperty(bc.id)}
                      />
                      <span>
                        {bc.name}
                        {bc.address && (
                          <span className="text-[var(--muted)]">
                            {' '}
                            · {bc.address}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)] mt-2">
                {propertyIds.length > 0
                  ? `Выбрано БЦ: ${propertyIds.length}`
                  : 'Бизнес-центры не выбраны'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.emailVerified !== false}
                onChange={(e) =>
                  setForm({ ...form, emailVerified: e.target.checked })
                }
              />
              Email подтверждён
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.privateDataComplete}
                onChange={(e) =>
                  setForm({ ...form, privateDataComplete: e.target.checked })
                }
              />
              Анкета полная
            </label>
            {editId && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Активен
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isBlocked}
                    onChange={(e) => setIsBlocked(e.target.checked)}
                  />
                  Заблокирован (отзыв сессий Pass, +authVersion)
                </label>
              </>
            )}
          </div>
          {editId &&
            (() => {
              const current =
                users.find((x) => x.id === editId) ||
                users
                  .flatMap((x) => x.employees || [])
                  .find((e) => e.id === editId);
              if (!current) return null;
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)] space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-[var(--text)]">
                    <Fingerprint className="w-4 h-4 text-[var(--primary)]" />
                    Pass
                  </div>
                  <div className="font-mono break-all">
                    {current.passSubject || 'subject появится после сохранения'}
                  </div>
                  <div>
                    {identityStatusLabel(current.identityStatus)} · v
                    {current.authVersion ?? 1}
                    {current.privateDataComplete ? ' · анкета полная' : ''}
                    {current.privateDataRevision != null
                      ? ` · rev ${current.privateDataRevision}`
                      : ''}
                  </div>
                  {current.lastLoginAt && (
                    <div>
                      Вход:{' '}
                      {new Date(current.lastLoginAt).toLocaleString('ru-RU')}
                    </div>
                  )}
                  {current.invitePending && (
                    <div>
                      Приглашение не принято
                      {current.inviteExpiresAt
                        ? ` до ${new Date(current.inviteExpiresAt).toLocaleString('ru-RU')}`
                        : ''}
                    </div>
                  )}
                  {current.parentTenantName && (
                    <div>Владелец: {current.parentTenantName}</div>
                  )}
                </div>
              );
            })()}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Отмена
            </button>
          </div>
        </form>
      </AdminModal>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-users-table w-full text-sm min-w-[760px]">
            <thead className="surface-muted text-[var(--muted)]">
              <tr>
                <th className="text-left p-3 font-medium align-middle min-w-[12rem] w-[28%]">
                  ФИО
                </th>
                <th className="text-left p-3 font-medium align-middle hidden lg:table-cell min-w-[10rem] w-[18%]">
                  Email
                </th>
                {category === 'tenants' ? (
                  <th className="text-left p-3 font-medium align-middle hidden md:table-cell min-w-[8rem] w-[16%]">
                    Компания
                  </th>
                ) : (
                  <th className="text-left p-3 font-medium align-middle min-w-[7rem] w-[14%]">
                    Роль
                  </th>
                )}
                <th className="text-left p-3 font-medium align-middle hidden sm:table-cell min-w-[9rem] w-[20%]">
                  {category === 'tenants' ? 'Офисы' : 'Бизнес-центры'}
                </th>
                <th className="text-left p-3 font-medium align-middle whitespace-nowrap min-w-[7.5rem] w-[12%]">
                  Статус
                </th>
                <th className="p-3 text-right font-medium align-middle whitespace-nowrap w-[5.5rem]">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    Загрузка...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    {category === 'tenants'
                      ? 'Арендаторы не найдены'
                      : 'Сотрудники не найдены'}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const employees = u.employees || [];
                  const empCount = u.employeesCount ?? employees.length;
                  const expanded = !!expandedOwners[u.id];
                  const canExpand = category === 'tenants' && empCount > 0;
                  const bindings = formatBindings(u);

                  return (
                    <Fragment key={u.id}>
                      <tr className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                        <td className="p-3 align-middle">
                          <div className="flex items-center gap-2 min-w-0">
                            {category === 'tenants' ? (
                              <button
                                type="button"
                                className={`p-0.5 rounded shrink-0 w-5 h-5 inline-flex items-center justify-center ${
                                  canExpand
                                    ? 'hover:bg-[var(--surface)] text-[var(--text)]'
                                    : 'invisible pointer-events-none'
                                }`}
                                onClick={() =>
                                  canExpand && toggleOwnerExpanded(u.id)
                                }
                                aria-expanded={expanded}
                                aria-label={
                                  expanded
                                    ? 'Свернуть сотрудников'
                                    : 'Показать сотрудников'
                                }
                                disabled={!canExpand}
                              >
                                {expanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <span className="w-5 h-5 shrink-0" aria-hidden />
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-medium truncate leading-snug"
                                title={u.fullName}
                              >
                                {u.fullName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                {category === 'tenants' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--muted)] font-normal leading-none">
                                    Владелец
                                  </span>
                                )}
                                {category === 'tenants' && u.profileType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-normal leading-none">
                                    {profileTypeLabel(u.profileType)}
                                    {u.profileType === 'company' && u.legalForm
                                      ? ` · ${legalFormLabel(u.legalForm)}`
                                      : ''}
                                  </span>
                                )}
                                {u.profileChangeRequest && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 leading-none">
                                    на модерации
                                  </span>
                                )}
                                {canExpand && (
                                  <button
                                    type="button"
                                    className="text-xs text-[var(--primary)] hover:underline inline-flex items-center gap-0.5 leading-none"
                                    onClick={() => toggleOwnerExpanded(u.id)}
                                  >
                                    <Users className="w-3 h-3" />
                                    {empCount}
                                  </button>
                                )}
                              </div>
                              <div
                                className="text-xs text-[var(--muted)] lg:hidden truncate mt-0.5"
                                title={u.email || undefined}
                              >
                                {u.email || '—'}
                              </div>
                              {category === 'tenants' && (
                                <div
                                  className="text-xs text-[var(--muted)] md:hidden truncate mt-0.5"
                                  title={u.company || undefined}
                                >
                                  {u.company || '—'}
                                </div>
                              )}
                              <div
                                className="text-xs text-[var(--muted)] sm:hidden mt-0.5 line-clamp-2"
                                title={bindings}
                              >
                                {bindings}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 align-middle hidden lg:table-cell text-[var(--muted)]">
                          <div
                            className="truncate"
                            title={u.email || undefined}
                          >
                            {u.email || '—'}
                          </div>
                          {u.email && (
                            <div
                              className={`text-[10px] mt-0.5 leading-none ${u.emailVerified ? 'text-emerald-700' : 'text-slate-500'}`}
                            >
                              {u.emailVerified
                                ? 'подтверждён'
                                : 'не подтверждён'}
                            </div>
                          )}
                        </td>
                        {category === 'tenants' ? (
                          <td className="p-3 align-middle hidden md:table-cell text-[var(--muted)]">
                            <div
                              className="truncate"
                              title={u.company || undefined}
                            >
                              {u.companyShortName || u.company || '—'}
                            </div>
                            {u.companyShortName && u.company && (
                              <div className="text-[10px] truncate leading-none mt-0.5">
                                {u.company}
                              </div>
                            )}
                          </td>
                        ) : (
                          <td className="p-3 align-middle">
                            <div
                              className="truncate"
                              title={getRoleLabel(u.role)}
                            >
                              {getRoleLabel(u.role)}
                            </div>
                          </td>
                        )}
                        <td className="p-3 align-middle hidden sm:table-cell text-[var(--muted)] text-xs">
                          <div
                            className="line-clamp-2 break-words leading-snug"
                            title={bindings}
                          >
                            {bindings}
                          </div>
                        </td>
                        <td className="p-3 align-middle">
                          <div className="inline-flex max-w-full">
                            {statusBadge(u)}
                          </div>
                        </td>
                        <td className="p-3 align-middle">
                          <div className="flex items-center justify-end gap-1 min-w-[4.5rem]">
                            <button
                              type="button"
                              className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--surface-muted)] shrink-0"
                              onClick={() => openEdit(u)}
                              title="Редактировать"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-md border border-red-200 hover:bg-red-50 text-red-600 shrink-0"
                              onClick={() => handleDeleteUser(u)}
                              disabled={deletingUserId === u.id}
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded &&
                        employees.map((emp) => {
                          const empBindings = `Как у владельца · ${getRoleLabel(emp.role)}`;
                          return (
                            <tr
                              key={emp.id}
                              className="border-t border-[var(--border)] bg-[var(--surface-muted)]/60"
                            >
                              <td className="p-3 align-middle">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-5 h-5 shrink-0 inline-flex items-center justify-center"
                                    aria-hidden
                                  >
                                    <User className="w-4 h-4 text-[var(--muted)]" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className="font-medium truncate leading-snug"
                                      title={emp.fullName}
                                    >
                                      {emp.fullName}
                                    </div>
                                    <div className="mt-0.5">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-800 font-normal leading-none">
                                        Сотрудник
                                      </span>
                                    </div>
                                    <div
                                      className="text-xs text-[var(--muted)] lg:hidden truncate mt-0.5"
                                      title={emp.email || undefined}
                                    >
                                      {emp.email || '—'}
                                    </div>
                                    <div className="text-xs text-[var(--muted)] md:hidden truncate mt-0.5">
                                      {emp.company || u.company || '—'}
                                    </div>
                                    <div className="text-xs text-[var(--muted)] sm:hidden mt-0.5 line-clamp-2">
                                      {empBindings}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 align-middle hidden lg:table-cell text-[var(--muted)]">
                                <div
                                  className="truncate"
                                  title={emp.email || undefined}
                                >
                                  {emp.email || '—'}
                                </div>
                              </td>
                              <td className="p-3 align-middle hidden md:table-cell text-[var(--muted)] text-xs">
                                <div
                                  className="truncate"
                                  title={emp.company || u.company || undefined}
                                >
                                  {emp.company || u.company || '—'}
                                </div>
                              </td>
                              <td className="p-3 align-middle hidden sm:table-cell text-[var(--muted)] text-xs">
                                <div
                                  className="line-clamp-2 leading-snug"
                                  title={empBindings}
                                >
                                  {empBindings}
                                </div>
                              </td>
                              <td className="p-3 align-middle">
                                <div className="inline-flex max-w-full">
                                  {statusBadge(emp)}
                                </div>
                              </td>
                              <td className="p-3 align-middle">
                                <div className="flex items-center justify-end gap-1 min-w-[4.5rem]">
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--surface-muted)] shrink-0"
                                    onClick={() => openEdit(emp)}
                                    title="Редактировать сотрудника"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-md border border-red-200 hover:bg-red-50 text-red-600 shrink-0"
                                    onClick={() => handleDeleteUser(emp)}
                                    disabled={deletingUserId === emp.id}
                                    title="Удалить сотрудника"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Пользователи">
          <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
        </AdminLayout>
      }
    >
      <AdminUsersPageContent />
    </Suspense>
  );
}
