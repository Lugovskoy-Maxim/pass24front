export interface ProfileChangeRequestData {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  fullName?: string;
  phone?: string;
  company?: string;
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
    requested_at: new Date(req.requestedAt).toISOString(),
  };
}

export function profileFieldsEqual(
  current: { lastName?: string; firstName?: string; middleName?: string; phone?: string; company?: string },
  next: { lastName?: string; firstName?: string; middleName?: string; phone?: string; company?: string },
) {
  return (
    (current.lastName || '') === (next.lastName || '') &&
    (current.firstName || '') === (next.firstName || '') &&
    (current.middleName || '') === (next.middleName || '') &&
    (current.phone || '') === (next.phone || '') &&
    (current.company || '') === (next.company || '')
  );
}