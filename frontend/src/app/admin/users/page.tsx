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
  ArrowLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  api,
  AdminMstyleProfileState,
  AdminUser,
  BusinessCenter,
  CreateUserData,
  Office,
  ProfileChangeRequest,
  ROLE_LABELS,
  UserCategory,
  UserFilters,
  UserRole,
  formatOfficeTenants,
  formatTenantOffices,
  getErrorMessage,
  getRoleLabel,
  officeTenantIds,
} from '@/lib/api';
import { PageError } from '@/components/PageError';
import { SearchableSelect } from '@/components/SearchableSelect';
import {
  OFFICE_SEARCH_HINT_WORDS,
  normalizeSearch as normalizeOfficeSearch,
} from '@/lib/search';
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
  birthDate: '',
};

const EMPTY_MSTYLE_PROFILE: AdminMstyleProfileState = {
  exists: false,
  profileId: null,
  status: null,
  residentHoursMonthlyQuotaMin: 0,
  residentHoursMonthlyResetDay: 1,
  resourceRole: 'standalone',
  resourceOwnerProfileId: null,
  resourceOwnerUserId: null,
  secondaryUserIds: [],
  privateData: {},
  privateDataRevision: 0,
  // самостоятельное редактирование - офф.
  editPolicy: 'request_only',
};

const MAX_COMPANY_LOGO_BYTES = 80 * 1024;

const EMPTY_NAME: PersonNameParts = {
  lastName: '',
  firstName: '',
  middleName: '',
};

type ResidentPrivateField = {
  path: string;
  label: string;
  type?: 'text' | 'date';
};
const BANK_PRIVATE_FIELDS: ResidentPrivateField[] = [
  { path: 'bank.name', label: 'Наименование банка' },
  { path: 'bank.bik', label: 'БИК' },
  { path: 'bank.accountNumber', label: 'Расчётный счёт' },
  { path: 'bank.correspondentAccountNumber', label: 'Корреспондентский счёт' },
];
function residentPrivateFields(
  profileType?: 'individual' | 'company',
  legalForm?: 'ip' | 'ooo' | null,
): ResidentPrivateField[] {
  if (profileType === 'company' && legalForm === 'ip')
    return [
      { path: 'entrepreneur.inn', label: 'ИНН ИП' },
      { path: 'entrepreneur.ogrnip', label: 'ОГРНИП' },
      {
        path: 'entrepreneur.registrationAddress',
        label: 'Адрес регистрации ИП',
      },
      ...BANK_PRIVATE_FIELDS,
    ];
  if (profileType === 'company')
    return [
      { path: 'company.fullName', label: 'Полное название компании' },
      { path: 'company.legalAddress', label: 'Юридический адрес' },
      { path: 'company.actualAddress', label: 'Фактический адрес' },
      { path: 'company.generalDirector', label: 'Генеральный директор' },
      { path: 'company.ogrn', label: 'ОГРН' },
      { path: 'company.inn', label: 'ИНН' },
      { path: 'company.kpp', label: 'КПП' },
      ...BANK_PRIVATE_FIELDS,
    ];
  return [
    { path: 'individual.inn', label: 'ИНН физического лица' },
    { path: 'individual.registrationAddress', label: 'Адрес регистрации' },
    { path: 'individual.passport.gender', label: 'Пол' },
    { path: 'individual.passport.number', label: 'Серия и номер паспорта' },
    { path: 'individual.passport.departmentCode', label: 'Код подразделения' },
    {
      path: 'individual.passport.issuedDate',
      label: 'Дата выдачи',
      type: 'date',
    },
    { path: 'individual.passport.issuedBy', label: 'Кем выдан' },
    ...BANK_PRIVATE_FIELDS,
  ];
}
function privateString(source: Record<string, unknown>, path: string): string {
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}
function setPrivateString(
  source: Record<string, unknown>,
  path: string,
  value: string,
) {
  const result: Record<string, unknown> = JSON.parse(
    JSON.stringify(source || {}),
  );
  const parts = path.split('.');
  let cursor = result;
  for (const part of parts.slice(0, -1)) {
    const child = cursor[part];
    if (!child || typeof child !== 'object' || Array.isArray(child))
      cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return result;
}

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
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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
  const [officePickerScope, setOfficePickerScope] = useState<
    'all' | 'available' | 'selected'
  >('all');
  const [isActive, setIsActive] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [mstyleProfile, setMstyleProfile] =
    useState<AdminMstyleProfileState>(EMPTY_MSTYLE_PROFILE);
  const [mstyleProfileLoading, setMstyleProfileLoading] = useState(false);
  const [mstyleTenantOptions, setMstyleTenantOptions] = useState<AdminUser[]>(
    [],
  );
  const [secondaryProfileSearch, setSecondaryProfileSearch] = useState('');
  const [secondaryProfilesExpanded, setSecondaryProfilesExpanded] =
    useState(false);
  const [residentDataExpanded, setResidentDataExpanded] = useState(false);
  const [residentPrivateDirty, setResidentPrivateDirty] = useState(false);
  const [mstyleEditPolicyDirty, setMstyleEditPolicyDirty] = useState(false);
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
  }, [category, loadProfileRequests, loadRegistrationRequests]);

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
    setOfficePickerScope('all');
    setIsActive(true);
    setIsBlocked(false);
    setMstyleProfile(EMPTY_MSTYLE_PROFILE);
    setMstyleTenantOptions([]);
    setSecondaryProfileSearch('');
    setSecondaryProfilesExpanded(false);
    setResidentDataExpanded(false);
    setResidentPrivateDirty(false);
    setMstyleEditPolicyDirty(false);
    setMstyleProfileLoading(false);
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
      profileType:
        (u.profileType as CreateUserData['profileType']) || 'individual',
      legalForm: u.legalForm ?? null,
      companyShortName: u.companyShortName || '',
      employeeLimit: u.employeeLimit ?? null,
      birthDate: u.birthDate || '',
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
    setOfficePickerScope('all');
    setIsActive(u.isActive && !u.invitePending);
    setIsBlocked(!!u.isBlocked);
    setMstyleProfile(EMPTY_MSTYLE_PROFILE);
    setMstyleTenantOptions([]);
    setSecondaryProfileSearch('');
    setSecondaryProfilesExpanded(false);
    setResidentDataExpanded(false);
    setResidentPrivateDirty(false);
    setMstyleEditPolicyDirty(false);
    setMstyleProfileLoading(false);
    if (u.role === 'tenant' && !u.parentTenantId) {
      setMstyleProfileLoading(true);
      void Promise.all([
        api.admin.getUserMstyleProfile(u.id),
        api.admin.getUsers({ category: 'tenants' }),
      ])
        .then(([{ profile }, { users: tenantOptions }]) => {
          setMstyleProfile(profile);
          setMstyleTenantOptions(
            tenantOptions.filter((item) => !item.parentTenantId),
          );
        })
        .catch((err) =>
          setError(getErrorMessage(err, 'Не удалось загрузить профиль Mstyle')),
        )
        .finally(() => setMstyleProfileLoading(false));
    }
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

  const officePickerTokens = (
    normalizeOfficeSearch(officePickerSearch).match(/[\p{L}\p{N}]+/gu) || []
  ).filter((token) => !OFFICE_SEARCH_HINT_WORDS.has(token));
  const filteredOfficesByBc = Object.entries(officesByBc).reduce(
    (acc, [bc, list]) => {
      const filtered = officePickerTokens.length
        ? list.filter((o) => {
            const hay = normalizeOfficeSearch(
              `${o.number} ${o.title || ''} ${o.floor ? `этаж ${o.floor}` : ''} ${o.company || ''} ${o.tenantName || ''} ${formatOfficeTenants(o)} ${bc}`,
            );
            return officePickerTokens.every((token) => hay.includes(token));
          })
        : list;
      const scoped = filtered.filter((office) =>
        officePickerScope === 'selected'
          ? officeIds.includes(office.id)
          : officePickerScope === 'available'
            ? officeTenantIds(office).length === 0
            : true,
      );
      if (scoped.length) acc[bc] = scoped;
      return acc;
    },
    {} as Record<string, Office[]>,
  );
  const availableOfficeCount = allOffices.filter(
    (office) => officeTenantIds(office).length === 0,
  ).length;
  const matchingOfficeCount = Object.values(filteredOfficesByBc).reduce(
    (count, offices) => count + offices.length,
    0,
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
        middleName: editId
          ? nameParts.middleName.trim()
          : nameParts.middleName.trim() || undefined,
        fullName: buildFullName(nameParts),
        birthDate: editId
          ? (form.birthDate ?? '').trim()
          : (form.birthDate ?? '').trim() || undefined,
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
      let savedUserId = editId;
      if (editId) {
        // Сотрудник компании: роль не отправляем (бэкенд её не меняет)
        await api.admin.updateUser(editId, {
          email: form.email.trim().toLowerCase(),
          ...base,
          ...(isCompanyEmployee ? {} : { role: form.role }),
          isActive,
          isBlocked,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        // createUser требует role: UserRole
        const { user: createdUser } = await api.admin.createUser({
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
        savedUserId = createdUser.id;
      }

      if (savedUserId && form.role === 'tenant' && !isCompanyEmployee) {
        const writableStatus =
          mstyleProfile.status === 'active' ||
          mstyleProfile.status === 'suspended' ||
          mstyleProfile.status === 'closed'
            ? mstyleProfile.status
            : undefined;
        await api.admin.updateUserMstyleProfile(savedUserId, {
          ...(mstyleProfile.resourceRole === 'secondary'
            ? {}
            : {
                residentHoursMonthlyQuotaMin:
                  mstyleProfile.residentHoursMonthlyQuotaMin,
                residentHoursMonthlyResetDay:
                  mstyleProfile.residentHoursMonthlyResetDay,
                isPrimaryProfile: mstyleProfile.resourceRole === 'primary',
                secondaryUserIds:
                  mstyleProfile.resourceRole === 'primary'
                    ? mstyleProfile.secondaryUserIds
                    : [],
              }),
          ...(editId && writableStatus ? { status: writableStatus } : {}),
          ...(residentPrivateDirty
            ? {
                privateData: mstyleProfile.privateData,
                privateDataRevision: mstyleProfile.privateDataRevision,
              }
            : {}),
          ...(!editId || mstyleEditPolicyDirty
            ? {
                selfServiceEnabled: mstyleProfile.editPolicy === 'self_service',
              }
            : {}),
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

  const formTitle = editId
    ? users
        .flatMap((x) => x.employees || [])
        .some((employee) => employee.id === editId)
      ? 'Редактирование сотрудника компании'
      : 'Редактирование пользователя'
    : 'Новый пользователь';
  const currentEditUser = editId
    ? users.find((item) => item.id === editId) ||
      users
        .flatMap((item) => item.employees || [])
        .find((item) => item.id === editId)
    : null;
  const originalOfficeIds =
    currentEditUser?.offices?.map((office) => office.id) || [];
  const addedOfficeCount = officeIds.filter(
    (id) => !originalOfficeIds.includes(id),
  ).length;
  const removedOfficeCount = originalOfficeIds.filter(
    (id) => !officeIds.includes(id),
  ).length;

  return (
    <AdminLayout
      title={showForm ? formTitle : 'Пользователи'}
      description={
        showForm
          ? undefined
          : 'Арендаторы и сотрудники компаний, охрана и администраторы бизнес-центров.'
      }
      actions={
        showForm ? undefined : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
          >
            <Plus size={16} />
            {category === 'tenants'
              ? 'Добавить арендатора'
              : 'Добавить сотрудника'}
          </button>
        )
      }
    >
      <div className={showForm ? 'hidden' : undefined}>
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

        <section
          className="card admin-users-toolbar p-4 mb-6 space-y-4"
          aria-label="Поиск и фильтры пользователей"
          data-expanded={filtersExpanded}
          data-active={hasActiveFilters}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <span className="label">Поиск</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                className="input input--icon-left"
                type="search"
                placeholder={
                  ph.userSearch || 'ФИО, email, телефон, компания, usr_…'
                }
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyFilters();
                }}
              />
            </label>

            <button
              type="button"
              className="admin-users-toolbar__toggle"
              aria-expanded={filtersExpanded}
              aria-controls="admin-users-extra-filters"
              onClick={() => setFiltersExpanded((value) => !value)}
            >
              <SlidersHorizontal size={16} /> Фильтры
              {[
                filters.isActive,
                filters.propertyId,
                filters.officeId,
                filters.role,
              ].filter(Boolean).length > 0 && (
                <span>
                  {
                    [
                      filters.isActive,
                      filters.propertyId,
                      filters.officeId,
                      filters.role,
                    ].filter(Boolean).length
                  }
                </span>
              )}
            </button>
            <div
              className="admin-users-toolbar__extra"
              id="admin-users-extra-filters"
            >
              <label>
                <span className="label">Статус</span>
                <span className="select-wrap block">
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
                    <option value="false">
                      Неактивные / ожидают подтверждения
                    </option>
                  </select>
                </span>
              </label>

              <label>
                <span className="label">Бизнес-центр</span>
                <span className="select-wrap block">
                  <select
                    className="input"
                    value={filters.propertyId}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        propertyId: e.target.value,
                        officeId: '',
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
                </span>
              </label>

              {category === 'tenants' ? (
                <div>
                  <label className="label" htmlFor="users-office-filter">
                    Офис
                  </label>
                  <SearchableSelect
                    id="users-office-filter"
                    label="Офис для фильтра пользователей"
                    value={filters.officeId || ''}
                    onChange={(officeId) =>
                      setFilters((prev) => ({ ...prev, officeId }))
                    }
                    placeholder="Все офисы"
                    searchPlaceholder="102 офис, БЦ или компания"
                    officeWords
                    options={officesForFilter.map((office) => ({
                      value: office.id,
                      label: [office.businessCenterName, `оф. ${office.number}`]
                        .filter(Boolean)
                        .join(' · '),
                      searchText: `${office.number} ${office.title || ''} ${office.businessCenterName || ''} ${office.company || ''} ${formatOfficeTenants(office)}`,
                    }))}
                  />
                </div>
              ) : (
                <label>
                  <span className="label">Роль</span>
                  <span className="select-wrap block">
                    <select
                      className="input"
                      value={filters.role}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          role: e.target.value,
                        }))
                      }
                    >
                      <option value="">Все роли</option>
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="admin-users-toolbar__actions flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary text-sm admin-users-toolbar__apply"
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
          </div>
        </section>

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
      </div>

      {showForm && (
        <section className="space-y-4">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setShowForm(false)}
            disabled={saving}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к пользователям
          </button>
          <div className="admin-user-summary card">
            <span className="admin-user-summary__avatar" aria-hidden="true">
              {nameParts.firstName?.[0] || form.email?.[0]?.toUpperCase() || (
                <User size={20} />
              )}
            </span>
            <div className="min-w-0">
              <strong>{buildFullName(nameParts) || formTitle}</strong>
              <p>{form.email || 'Укажите email и данные пользователя'}</p>
            </div>
            <span className="admin-user-summary__role">
              {getRoleLabel(form.role)}
            </span>
          </div>
          <div className="card p-4 sm:p-5">
            <form
              id="admin-user-form"
              onSubmit={handleSubmit}
              className="admin-user-form space-y-3"
              autoComplete="off"
            >
              <div className="admin-user-form__section-heading">
                <div>
                  <span>
                    <User size={14} />
                  </span>
                  <h2>Данные и доступ</h2>
                </div>
                <p>Контакты, роль и параметры учётной записи</p>
              </div>
              <div className="admin-user-form__grid grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="label" htmlFor="admin-user-email">
                    Email *
                  </label>
                  <input
                    id="admin-user-email"
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="admin-user-password">
                    {editId ? 'Новый пароль' : 'Пароль *'}
                  </label>
                  <input
                    id="admin-user-password"
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required={!editId}
                    minLength={6}
                    autoComplete="new-password"
                    placeholder={
                      editId ? 'Оставьте пустым, чтобы не менять' : undefined
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="admin-user-username">
                    Логин
                  </label>
                  <input
                    id="admin-user-username"
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
                  <label className="label" htmlFor="admin-user-display-name">
                    Отображаемое имя
                  </label>
                  <input
                    id="admin-user-display-name"
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
                  <label className="label" htmlFor="admin-user-role">
                    Роль *
                  </label>
                  <div className="select-wrap">
                    <select
                      id="admin-user-role"
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
                      {category === 'tenants' &&
                      form.role !== 'tenant_employee' ? (
                        <option value="tenant">{ROLE_LABELS.tenant}</option>
                      ) : null}
                      {category === 'staff' &&
                        form.role !== 'tenant_employee' &&
                        STAFF_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      {category === 'staff' &&
                        form.role !== 'tenant_employee' && (
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
                  <label className="label" htmlFor="admin-user-company">
                    Компания
                  </label>
                  <input
                    id="admin-user-company"
                    className="input"
                    value={form.company}
                    onChange={(e) =>
                      setForm({ ...form, company: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="admin-user-phone">
                    Телефон
                  </label>
                  <input
                    id="admin-user-phone"
                    className="input"
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="admin-user-birthdate">
                    Дата рождения
                  </label>
                  <input
                    id="admin-user-birthdate"
                    className="input"
                    type="date"
                    value={form.birthDate || ''}
                    onChange={(e) =>
                      setForm({ ...form, birthDate: e.target.value })
                    }
                  />
                </div>
                {form.role === 'tenant' &&
                  !users
                    .flatMap((x) => x.employees || [])
                    .some((e) => e.id === editId) && (
                    <>
                      <div className="admin-user-form__section-heading admin-user-form__section-heading--grid">
                        <div>
                          <span>
                            <Building2 size={14} />
                          </span>
                          <h2>Компания и профиль резидента</h2>
                        </div>
                        <p>Тип профиля, документы и резидентские часы</p>
                      </div>
                      <div>
                        <label className="label">Тип профиля</label>
                        <div className="select-wrap">
                          <select
                            className="input"
                            value={form.profileType || 'individual'}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                profileType: e.target.value as
                                  'individual' | 'company',
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
                            setForm({
                              ...form,
                              companyShortName: e.target.value,
                            })
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
                      {editId && (
                        <div className="sm:col-span-2 border border-[var(--border)] rounded-lg bg-[var(--surface-muted)]">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-3 p-4 text-left"
                            onClick={() =>
                              setResidentDataExpanded((value) => !value)
                            }
                          >
                            <span className="font-medium text-sm">
                              Дополнительные данные резидента
                            </span>
                            {residentDataExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          {residentDataExpanded && (
                            <div className="border-t border-[var(--border)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label
                                className="sm:col-span-2 flex items-center gap-2 text-sm"
                                title="Как правило, реквизиты профиля зафиксированы потому что на них заключён договор аренды. Проверьте нужно ли разрешать этому профилю редактирование своих данных"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    mstyleProfile.editPolicy === 'self_service'
                                  }
                                  disabled={
                                    mstyleProfileLoading ||
                                    mstyleProfile.editPolicy === 'locked'
                                  }
                                  onChange={(e) => {
                                    setMstyleEditPolicyDirty(true);
                                    setMstyleProfile((prev) => ({
                                      ...prev,
                                      editPolicy: e.target.checked
                                        ? 'self_service'
                                        : 'request_only',
                                    }));
                                  }}
                                />
                                Разрешено редактировать свой профиль
                              </label>
                              {residentPrivateFields(
                                form.profileType,
                                form.legalForm,
                              ).map((field) => (
                                <div key={field.path}>
                                  <label className="label">{field.label}</label>
                                  <input
                                    className="input"
                                    type={field.type || 'text'}
                                    value={privateString(
                                      mstyleProfile.privateData,
                                      field.path,
                                    )}
                                    onChange={(e) => {
                                      setResidentPrivateDirty(true);
                                      setMstyleProfile((prev) => ({
                                        ...prev,
                                        privateData: setPrivateString(
                                          prev.privateData,
                                          field.path,
                                          e.target.value,
                                        ),
                                      }));
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="sm:col-span-2">
                        {mstyleProfile.resourceRole === 'secondary' ? (
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                            <div className="font-medium">
                              Второстепенный профиль
                            </div>
                            <div className="text-xs text-[var(--muted)] mt-1">
                              Основной профиль:{' '}
                              {mstyleTenantOptions.find(
                                (item) =>
                                  item.id === mstyleProfile.resourceOwnerUserId,
                              )?.companyShortName ||
                                mstyleTenantOptions.find(
                                  (item) =>
                                    item.id ===
                                    mstyleProfile.resourceOwnerUserId,
                                )?.company ||
                                mstyleTenantOptions.find(
                                  (item) =>
                                    item.id ===
                                    mstyleProfile.resourceOwnerUserId,
                                )?.fullName ||
                                mstyleProfile.resourceOwnerProfileId ||
                                'не найден'}
                            </div>
                            <div className="text-xs text-[var(--muted)] mt-1">
                              Квота, дата сброса и Mstyle-офисы наследуются от
                              основного профиля.
                            </div>
                          </div>
                        ) : (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={mstyleProfile.resourceRole === 'primary'}
                              disabled={
                                mstyleProfileLoading ||
                                (mstyleProfile.resourceRole === 'primary' &&
                                  mstyleProfile.secondaryUserIds.length > 0)
                              }
                              onChange={(e) =>
                                setMstyleProfile((prev) => ({
                                  ...prev,
                                  resourceRole: e.target.checked
                                    ? 'primary'
                                    : 'standalone',
                                  resourceOwnerProfileId: e.target.checked
                                    ? prev.profileId
                                    : null,
                                }))
                              }
                            />
                            Основной профиль
                          </label>
                        )}
                        {mstyleProfile.resourceRole === 'primary' &&
                          mstyleProfile.secondaryUserIds.length > 0 && (
                            <p className="text-xs text-[var(--muted)] mt-1">
                              Чтобы отключить основной профиль, сначала отвяжите
                              все второстепенные профили и сохраните изменения.
                            </p>
                          )}
                      </div>

                      <div>
                        <label className="label">
                          Квота резидентских часов, ч/мес. (Mstyle)
                        </label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={0.5}
                          value={
                            mstyleProfile.residentHoursMonthlyQuotaMin / 60
                          }
                          disabled={
                            mstyleProfileLoading ||
                            mstyleProfile.resourceRole === 'secondary'
                          }
                          onChange={(e) => {
                            const hours =
                              e.target.value === ''
                                ? 0
                                : Number(e.target.value);
                            setMstyleProfile((prev) => ({
                              ...prev,
                              residentHoursMonthlyQuotaMin: Math.max(
                                0,
                                Math.round(hours * 60),
                              ),
                            }));
                          }}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="label">
                          Дата сброса квоты (Mstyle)
                        </label>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={31}
                          step={1}
                          value={mstyleProfile.residentHoursMonthlyResetDay}
                          disabled={
                            mstyleProfileLoading ||
                            mstyleProfile.resourceRole === 'secondary'
                          }
                          onChange={(e) => {
                            const day =
                              e.target.value === ''
                                ? 1
                                : Number(e.target.value);
                            setMstyleProfile((prev) => ({
                              ...prev,
                              residentHoursMonthlyResetDay: Math.min(
                                31,
                                Math.max(1, Math.trunc(day)),
                              ),
                            }));
                          }}
                          placeholder="1"
                        />
                      </div>

                      {mstyleProfile.resourceRole === 'primary' && (
                        <div className="sm:col-span-2 border border-[var(--border)] rounded-lg bg-[var(--surface-muted)]">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-3 p-4 text-left"
                            onClick={() =>
                              setSecondaryProfilesExpanded((value) => !value)
                            }
                          >
                            <span className="flex items-center gap-2">
                              <Link2 className="w-4 h-4 text-[var(--primary)]" />
                              <span className="font-medium text-sm">
                                Привязать второстепенные профили
                              </span>
                              {mstyleProfile.secondaryUserIds.length > 0 && (
                                <span className="text-xs text-[var(--muted)]">
                                  ({mstyleProfile.secondaryUserIds.length})
                                </span>
                              )}
                            </span>
                            {secondaryProfilesExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          {secondaryProfilesExpanded && (
                            <div className="border-t border-[var(--border)] p-4 space-y-3">
                              <p className="text-xs text-[var(--muted)]">
                                Второстепенные профили сохраняют собственные
                                реквизиты и доступы Pass, но используют
                                Mstyle-ресурсы основного профиля.
                              </p>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                                <input
                                  className="input input--icon-left text-sm"
                                  value={secondaryProfileSearch}
                                  onChange={(e) =>
                                    setSecondaryProfileSearch(e.target.value)
                                  }
                                  placeholder="Поиск профиля..."
                                />
                              </div>
                              <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-64 overflow-y-auto bg-[var(--surface)]">
                                {mstyleTenantOptions
                                  .filter((item) => item.id !== editId)
                                  .filter((item) => {
                                    const needle = secondaryProfileSearch
                                      .trim()
                                      .toLowerCase();
                                    if (!needle) return true;
                                    return [
                                      item.companyShortName,
                                      item.company,
                                      item.fullName,
                                      item.email,
                                      item.phone,
                                    ]
                                      .filter(Boolean)
                                      .some((value) =>
                                        String(value)
                                          .toLowerCase()
                                          .includes(needle),
                                      );
                                  })
                                  .map((item) => {
                                    const checked =
                                      mstyleProfile.secondaryUserIds.includes(
                                        item.id,
                                      );
                                    const label =
                                      item.companyShortName ||
                                      item.company ||
                                      item.fullName ||
                                      item.email;
                                    return (
                                      <label
                                        key={item.id}
                                        className={`flex items-start gap-2.5 text-sm cursor-pointer px-3 py-2 ${
                                          checked
                                            ? 'bg-[var(--status-approved-soft)]'
                                            : 'hover:bg-[var(--surface-muted)]'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="mt-0.5"
                                          checked={checked}
                                          onChange={() =>
                                            setMstyleProfile((prev) => ({
                                              ...prev,
                                              secondaryUserIds: checked
                                                ? prev.secondaryUserIds.filter(
                                                    (id) => id !== item.id,
                                                  )
                                                : [
                                                    ...prev.secondaryUserIds,
                                                    item.id,
                                                  ],
                                            }))
                                          }
                                        />
                                        <span className="min-w-0">
                                          <span className="font-medium">
                                            {label}
                                          </span>
                                          {item.email &&
                                            label !== item.email && (
                                              <span className="block text-[11px] text-[var(--muted)]">
                                                {item.email}
                                              </span>
                                            )}
                                        </span>
                                      </label>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
                        Показывается на карточке и странице пропуска вместо
                        иконки типа
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
                    {users.find((x) =>
                      x.employees?.some((e) => e.id === editId),
                    )?.fullName
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
                  <div
                    className="admin-office-assignment space-y-3"
                    id="user-office-assignment"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-[var(--primary)]" />
                        <div>
                          <h2 className="font-semibold">Офисы арендатора</h2>
                          <p className="text-xs text-[var(--muted)]">
                            Выбрано: {officeIds.length} из {allOffices.length}
                          </p>
                        </div>
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
                    <p className="text-sm text-[var(--muted)]">
                      Офисы определяют доступ к пропускам. При выборе занятого
                      офиса другой арендатор сохранит доступ.
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
                        <div
                          className="admin-office-assignment__filters"
                          role="group"
                          aria-label="Показать офисы"
                        >
                          {(
                            [
                              ['all', `Все · ${allOffices.length}`],
                              [
                                'available',
                                `Свободные · ${availableOfficeCount}`,
                              ],
                              ['selected', `Выбраны · ${officeIds.length}`],
                            ] as const
                          ).map(([scope, label]) => (
                            <button
                              key={scope}
                              type="button"
                              aria-pressed={officePickerScope === scope}
                              onClick={() => setOfficePickerScope(scope)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <label htmlFor="user-office-search" className="label">
                          Поиск по офисам
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                          <input
                            id="user-office-search"
                            className="input input--icon-left text-sm"
                            value={officePickerSearch}
                            type="search"
                            onChange={(e) =>
                              setOfficePickerSearch(e.target.value)
                            }
                            placeholder="102 офис, БЦ или компания"
                            aria-label="Поиск офиса для назначения"
                            aria-controls="user-office-options"
                          />
                        </div>
                        <p
                          className="text-xs text-[var(--muted)]"
                          role="status"
                          aria-live="polite"
                        >
                          Найдено: {matchingOfficeCount}. Поиск не снимает
                          выбранные офисы.
                        </p>
                        <div
                          className="admin-office-assignment__list"
                          id="user-office-options"
                        >
                          {Object.keys(filteredOfficesByBc).length === 0 ? (
                            <div className="p-4 text-sm text-[var(--muted)] text-center">
                              {officePickerScope === 'selected' &&
                              !officeIds.length
                                ? 'Выбранных офисов пока нет'
                                : 'Офисы не найдены. Измените поиск или фильтр.'}
                            </div>
                          ) : (
                            Object.entries(filteredOfficesByBc).map(
                              ([bc, offices]) => (
                                <div key={bc} className="p-3">
                                  <div className="admin-office-assignment__group-title">
                                    <span>{bc}</span>
                                    <span>{offices.length}</span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {offices.map((office) => {
                                      const checked = officeIds.includes(
                                        office.id,
                                      );
                                      const occupants = officeTenantIds(office);
                                      const currentlyAssigned =
                                        !!editId && occupants.includes(editId);
                                      const occupiedByOther = occupants.some(
                                        (id) => id !== editId,
                                      );
                                      const otherNames =
                                        office.tenants
                                          ?.filter((t) => t.id !== editId)
                                          .map((t) => t.name)
                                          .join(', ') ||
                                        (office.tenantId !== editId
                                          ? office.tenantName
                                          : '');
                                      return (
                                        <label
                                          key={office.id}
                                          className={`admin-office-assignment__option ${
                                            checked
                                              ? 'admin-office-assignment__option--selected'
                                              : ''
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={checked}
                                            onChange={() =>
                                              toggleOffice(office.id)
                                            }
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
                                            <span
                                              className={`admin-office-assignment__state ${occupiedByOther ? 'admin-office-assignment__state--shared' : ''}`}
                                            >
                                              {occupiedByOther
                                                ? 'Есть арендатор'
                                                : checked
                                                  ? 'Выбран'
                                                  : currentlyAssigned
                                                    ? 'Будет снят'
                                                    : 'Свободен'}
                                            </span>
                                            {occupiedByOther ? (
                                              <span className="block text-[11px] text-amber-700 mt-0.5">
                                                Уже есть:{' '}
                                                {otherNames ||
                                                  'другой арендатор'}
                                                {office.company
                                                  ? ` (${office.company})`
                                                  : ''}{' '}
                                                — будет добавлен ещё один
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
                    <p className="text-xs text-[var(--muted)]" role="status">
                      {officeIds.length > 0
                        ? `Выбрано офисов: ${officeIds.length}`
                        : 'Офисы не выбраны — заказ пропусков будет недоступен'}
                      {(addedOfficeCount > 0 || removedOfficeCount > 0) && (
                        <span className="block mt-1">
                          При сохранении: добавить {addedOfficeCount}, снять{' '}
                          {removedOfficeCount}. Изменения ещё не сохранены.
                        </span>
                      )}
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

              <div className="admin-user-form__section-heading">
                <div>
                  <span>
                    <UserCog size={14} />
                  </span>
                  <h2>Состояние учётной записи</h2>
                </div>
                <p>Подтверждение данных и доступ к кабинету</p>
              </div>
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
                      setForm({
                        ...form,
                        privateDataComplete: e.target.checked,
                      })
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
                      Заблокировать вход и завершить текущие сеансы
                    </label>
                    {form.role === 'tenant' &&
                      !users
                        .flatMap((x) => x.employees || [])
                        .some((e) => e.id === editId) && (
                        <label className="flex items-center gap-2 text-sm">
                          <span>Статус профиля (Mstyle)</span>
                          <select
                            className="input w-auto py-1"
                            value={mstyleProfile.status ?? 'active'}
                            disabled={
                              mstyleProfileLoading ||
                              mstyleProfile.status === 'closed' ||
                              mstyleProfile.status === 'deleted'
                            }
                            title={
                              mstyleProfile.exists
                                ? 'Статус MstyleProfile'
                                : 'Профиль Mstyle будет создан при сохранении'
                            }
                            onChange={(e) =>
                              setMstyleProfile((prev) => ({
                                ...prev,
                                status: e.target
                                  .value as AdminMstyleProfileState['status'],
                              }))
                            }
                          >
                            {mstyleProfile.status === 'draft' && (
                              <option value="draft" disabled>
                                Черновик
                              </option>
                            )}
                            <option value="active">Активен</option>
                            <option value="suspended">Приостановлен</option>
                            <option value="closed">Закрыт</option>
                            {mstyleProfile.status === 'deleted' && (
                              <option value="deleted" disabled>
                                Удалён
                              </option>
                            )}
                          </select>
                        </label>
                      )}
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
                  if (
                    !current.lastLoginAt &&
                    !current.invitePending &&
                    !current.parentTenantName
                  ) {
                    return null;
                  }
                  return (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)] space-y-1">
                      {current.lastLoginAt && (
                        <div>
                          Вход:{' '}
                          {new Date(current.lastLoginAt).toLocaleString(
                            'ru-RU',
                          )}
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
              {error && (
                <div role="alert" className="text-sm text-red-600">
                  {error}
                </div>
              )}
              {currentEditUser && (
                <div className="admin-user-form__danger">
                  <button
                    type="button"
                    className="btn admin-user-form__delete"
                    disabled={saving || deletingUserId === currentEditUser.id}
                    onClick={() => void handleDeleteUser(currentEditUser)}
                  >
                    <Trash2 size={16} /> Удалить пользователя
                  </button>
                </div>
              )}
              <div className="admin-user-form__actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || mstyleProfileLoading}
                >
                  {saving
                    ? 'Сохранение...'
                    : mstyleProfileLoading
                      ? 'Загрузка Mstyle...'
                      : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {!showForm && (
        <div className="card admin-users-register overflow-hidden">
          <div className="admin-users-register__heading">
            <div>
              <h2>
                {category === 'tenants' ? 'Арендаторы' : 'Сотрудники'}{' '}
                <span>{total}</span>
              </h2>
              <p>
                {hasActiveFilters
                  ? 'Результаты поиска и фильтров'
                  : 'Учётные записи и назначенные помещения'}
              </p>
            </div>
            <span>{loading ? 'Обновляем…' : `${users.length} показано`}</span>
          </div>
          <div className="overflow-x-auto">
            <table
              className="admin-users-table w-full text-sm min-w-[760px]"
              aria-label={category === 'tenants' ? 'Арендаторы' : 'Сотрудники'}
            >
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
                    Карточка
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
                                <span
                                  className="w-5 h-5 shrink-0"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  className="admin-users-table__name"
                                  onClick={() => openEdit(u)}
                                  title={`Открыть ${u.fullName}`}
                                >
                                  {u.fullName}
                                </button>
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                  {category === 'tenants' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--muted)] font-normal leading-none">
                                      Владелец
                                    </span>
                                  )}
                                  {category === 'tenants' && u.profileType && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-normal leading-none">
                                      {profileTypeLabel(u.profileType)}
                                      {u.profileType === 'company' &&
                                      u.legalForm
                                        ? ` · ${legalFormLabel(u.legalForm)}`
                                        : ''}
                                    </span>
                                  )}
                                  {category === 'staff' && (
                                    <span className="admin-users-table__tag">
                                      {getRoleLabel(u.role)}
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
                            <span className="admin-users-table__mobile-label">
                              {category === 'tenants'
                                ? 'Офисы'
                                : 'Бизнес-центры'}
                            </span>
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
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="admin-users-table__open"
                                onClick={() => openEdit(u)}
                                aria-label={`Открыть пользователя ${u.fullName}`}
                              >
                                Открыть <ChevronRight size={15} />
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
                                      <button
                                        type="button"
                                        className="admin-users-table__name"
                                        onClick={() => openEdit(emp)}
                                        title={`Открыть ${emp.fullName}`}
                                      >
                                        {emp.fullName}
                                      </button>
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
                                    title={
                                      emp.company || u.company || undefined
                                    }
                                  >
                                    {emp.company || u.company || '—'}
                                  </div>
                                </td>
                                <td className="p-3 align-middle hidden sm:table-cell text-[var(--muted)] text-xs">
                                  <span className="admin-users-table__mobile-label">
                                    Офисы
                                  </span>
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
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      className="admin-users-table__open"
                                      onClick={() => openEdit(emp)}
                                      aria-label={`Открыть сотрудника ${emp.fullName}`}
                                    >
                                      Открыть <ChevronRight size={15} />
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
      )}
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
