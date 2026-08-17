export interface ProfileChangeRequestData {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  fullName?: string;
  phone?: string;
  company?: string;
  companyShortName?: string;
  profileType?: string;
  legalForm?: string | null;
  employeeLimit?: number | null;
  requestedAt?: Date;
}

export function mapProfileChangeRequest(req?: ProfileChangeRequestData | null) {
  if (!req?.requestedAt) return null;
  return {
    last_name: req.lastName || '',
    first_name: req.firstName || '',
    middle_name: req.middleName || '',
    full_name: req.fullName || '',
    phone: req.phone,
    company: req.company,
    company_short_name: req.companyShortName,
    profile_type: req.profileType,
    legal_form: req.legalForm ?? null,
    employee_limit: req.employeeLimit ?? null,
    requested_at: new Date(req.requestedAt).toISOString(),
  };
}

export function profileFieldsEqual(
  current: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    company?: string;
    companyShortName?: string;
    profileType?: string;
    legalForm?: string | null;
    employeeLimit?: number | null;
  },
  next: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    company?: string;
    companyShortName?: string;
    profileType?: string;
    legalForm?: string | null;
    employeeLimit?: number | null;
  },
) {
  return (
    (current.lastName || '') === (next.lastName || '') &&
    (current.firstName || '') === (next.firstName || '') &&
    (current.middleName || '') === (next.middleName || '') &&
    (current.phone || '') === (next.phone || '') &&
    (current.company || '') === (next.company || '') &&
    (current.companyShortName || '') === (next.companyShortName || '') &&
    (current.profileType || '') === (next.profileType || '') &&
    (current.legalForm || '') === (next.legalForm || '') &&
    (current.employeeLimit ?? null) === (next.employeeLimit ?? null)
  );
}
