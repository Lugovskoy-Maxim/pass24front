export const OFFICE_SEARCH_HINT_WORDS = new Set([
  'оф',
  'офис',
  'офиса',
  'офисы',
  'офисов',
  'офисе',
  'офисом',
  'office',
]);

export function normalizeSearch(value: string): string {
  return value
    .replace(/№/g, ' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export function matchesSearch(
  text: string,
  query: string,
  officeWords = false,
): boolean {
  const tokens = (
    normalizeSearch(query).match(
      /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]*|[\p{L}\p{N}]+/gu,
    ) || []
  ).filter((token) => !officeWords || !OFFICE_SEARCH_HINT_WORDS.has(token));
  const haystack = normalizeSearch(text);
  return tokens.every((token) => haystack.includes(token));
}
