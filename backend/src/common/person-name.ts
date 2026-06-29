export interface PersonNameParts {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  fullName?: string;
}

export function buildFullName(parts: PersonNameParts): string {
  if (parts.fullName?.trim()) return parts.fullName.trim();
  return [parts.lastName, parts.firstName, parts.middleName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

export function splitFullName(fullName?: string): Required<Pick<PersonNameParts, 'lastName' | 'firstName' | 'middleName'>> {
  if (!fullName?.trim()) {
    return { lastName: '', firstName: '', middleName: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    middleName: parts.slice(2).join(' '),
  };
}

export function resolvePersonName(dto: PersonNameParts): {
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
} {
  const lastName = dto.lastName?.trim() || '';
  const firstName = dto.firstName?.trim() || '';
  const middleName = dto.middleName?.trim() || '';
  const fullName = buildFullName({ lastName, firstName, middleName, fullName: dto.fullName });

  if (!fullName) {
    throw new Error('FULL_NAME_REQUIRED');
  }

  const resolved = lastName || firstName
    ? { lastName, firstName, middleName, fullName }
    : { ...splitFullName(fullName), fullName };

  return resolved;
}