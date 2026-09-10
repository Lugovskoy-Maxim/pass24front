import {
  REQUIRED_INDIVIDUAL_FIELDS,
  REQUIRED_COMPANY_FIELDS,
  RESIDENT_PRIVATE_FIELDS,
} from './mstyle-v2.constants';
import { problem } from './mstyle-v2.problem';
export function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function pick(source: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = getPath(source, key);
    if (value !== undefined) setPath(out, key, value);
  }
  return out;
}

export function getPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const parts = path.split('.');
  if (
    parts.some((part) =>
      ['__proto__', 'prototype', 'constructor'].includes(part),
    )
  )
    problem(422, 'VALIDATION_FAILED');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const child = cursor[part];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export function leafFieldCodes(
  source: Record<string, unknown>,
  prefix = '',
): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...leafFieldCodes(value as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

export function mergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  assertSafeKeys(patch);
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
        ? mergeObjects(
            current as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return merged;
}

export function requiredResidentFields(
  profileType: string,
  legalForm?: string | null,
): readonly string[] {
  if (profileType !== 'company') return REQUIRED_INDIVIDUAL_FIELDS;
  return legalForm === 'ip'
    ? ['entrepreneur.inn', 'entrepreneur.ogrnip']
    : REQUIRED_COMPANY_FIELDS;
}

/**
 * M0 stored flat field names. M1/M2 expose structured field codes, so reads
 * project legacy rows into the canonical shape without rewriting history.
 */
export function canonicalPrivateValues(
  source: Record<string, unknown>,
  profileType: string,
  legalForm?: string | null,
): Record<string, unknown> {
  const result = mergeObjects({}, source);
  if (profileType === 'company' && legalForm === 'ip') {
    copyAliases(result, source, 'entrepreneur', {
      inn: ['inn'],
      ogrnip: ['ogrnip', 'ogrn'],
      registrationAddress: ['registrationAddress', 'legalAddress'],
    });
  } else if (profileType === 'company') {
    copyAliases(result, source, 'company', {
      fullName: ['fullName', 'companyFullName'],
      inn: ['inn'],
      kpp: ['kpp'],
      ogrn: ['ogrn'],
      legalAddress: ['legalAddress'],
      actualAddress: ['actualAddress'],
      generalDirector: ['generalDirector', 'ceoName'],
    });
  } else {
    copyAliases(result, source, 'individual', {
      birthDate: ['birthDate'],
      inn: ['inn'],
      registrationAddress: ['registrationAddress'],
    });
    copyAliases(result, source, 'individual.passport', {
      fullName: ['passport.fullName', 'fullName', 'displayName'],
      gender: ['passport.gender', 'gender'],
      birthDate: ['passport.birthDate', 'birthDate'],
      number: ['passport.number', 'documentNumber'],
      departmentCode: ['passport.departmentCode', 'documentCode'],
      issuedDate: ['passport.issuedDate', 'documentIssuedAt'],
      issuedBy: ['passport.issuedBy', 'documentIssuedBy'],
    });
  }
  return result;
}

function copyAliases(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  targetPrefix: string,
  aliases: Record<string, readonly string[]>,
) {
  for (const [name, candidates] of Object.entries(aliases)) {
    if (getPath(target, `${targetPrefix}.${name}`) !== undefined) continue;
    const candidate = candidates
      .map((path) => getPath(source, path))
      .find((value) => value !== undefined);
    if (candidate !== undefined) {
      setPath(target, `${targetPrefix}.${name}`, candidate);
    }
  }
}

export function assertSafeKeys(source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      problem(422, 'VALIDATION_FAILED');
    if (value && typeof value === 'object' && !Array.isArray(value))
      assertSafeKeys(value as Record<string, unknown>);
  }
}
export function normalizeResidentInput(
  source: Record<string, unknown>,
  type: string,
  legalForm?: string | null,
) {
  assertSafeKeys(source);
  if (type !== 'company' && source.passport !== undefined) {
    const passport = source.passport;
    if (!passport || typeof passport !== 'object' || Array.isArray(passport))
      problem(422, 'VALIDATION_FAILED');
    const fields = [
      'fullName',
      'gender',
      'birthDate',
      'number',
      'departmentCode',
      'issuedDate',
      'issuedBy',
    ];
    for (const [field, value] of Object.entries(passport)) {
      const canonical = getPath(source, `individual.passport.${field}`);
      if (
        !fields.includes(field) ||
        (canonical !== undefined && canonical !== value)
      )
        problem(422, 'VALIDATION_FAILED', {
          errors: [
            {
              field: `passport.${field}`,
              code: 'invalid',
              message: 'Unknown or conflicting passport field',
            },
          ],
        });
    }
  }
  const values = canonicalPrivateValues(source, type, legalForm);
  // New writes store only one location for each aliased field.
  const aliases =
    type === 'company'
      ? [
          'fullName',
          'companyFullName',
          'inn',
          'kpp',
          'ogrn',
          'ogrnip',
          'legalAddress',
          'actualAddress',
          'generalDirector',
          'ceoName',
          'registrationAddress',
        ]
      : [
          'passport',
          'fullName',
          'displayName',
          'birthDate',
          'inn',
          'registrationAddress',
          'gender',
          'documentNumber',
          'documentCode',
          'documentIssuedAt',
          'documentIssuedBy',
        ];
  for (const key of aliases) delete values[key];
  const bad = leafFieldCodes(values).filter(
    (field) => !(RESIDENT_PRIVATE_FIELDS as readonly string[]).includes(field),
  );
  if (bad.length)
    problem(422, 'VALIDATION_FAILED', {
      errors: bad.map((field) => ({
        field,
        code: 'unknown_field',
        message: 'Unknown fieldCode',
      })),
    });
  return values;
}
export function validateResidentValues(
  values: Record<string, unknown>,
  type: string,
  legalForm?: string | null,
) {
  const required = requiredResidentFields(type, legalForm);
  const errors: { field: string; code: string; message: string }[] = [];
  for (const field of required) {
    const value = getPath(values, field);
    let message = '';
    const isCompany = type === 'company' && legalForm !== 'ip';
    if (value !== undefined && typeof value !== 'string')
      message = 'Значение должно быть строкой';
    else if (isCompany) {
      if (
        field === 'company.fullName' &&
        (typeof value !== 'string' || !value.trim())
      )
        message = 'Укажите полное название ООО';
      if (
        field === 'company.inn' &&
        (typeof value !== 'string' || !/^[0-9]{10}$/.test(value))
      )
        message = 'ИНН ООО должен содержать ровно 10 цифр';
      if (
        field === 'company.ogrn' &&
        (typeof value !== 'string' || !/^[0-9]{13}$/.test(value))
      )
        message = 'ОГРН ООО должен содержать ровно 13 цифр';
    } else if (!hasValue(value)) message = 'Обязательное поле';
    if (message) errors.push({ field, code: 'invalid', message });
  }
  if (errors.length) problem(422, 'VALIDATION_FAILED', { errors });
  if (type === 'company' && legalForm !== 'ip')
    setPath(
      values,
      'company.fullName',
      String(getPath(values, 'company.fullName')).trim(),
    );
  return values;
}
