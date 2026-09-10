import { constants, createPublicKey, verify } from 'crypto';
import { TextDecoder } from 'util';
import type { MstyleOauthClient } from './mstyle-v2.config';

// JWT profiles are flat objects. Preserve duplicate keys, including escaped
// spellings, until validation instead of silently accepting JSON.parse's last key.
export function parseJwtObject(encoded: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('encoding');
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded) throw new Error('encoding');
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let index = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(json[index] || 'x')) index++;
  };
  const string = () => {
    // JSON.parse below rejects unescaped control characters after the token is
    // isolated, so the scanner only needs to distinguish quotes and escapes.
    const found = /^"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(
      json.slice(index),
    );
    if (!found) throw new Error('json');
    index += found[0].length;
    return JSON.parse(found[0]) as string;
  };
  const result: Record<string, unknown> = Object.create(null);
  whitespace();
  if (json[index++] !== '{') throw new Error('json');
  whitespace();
  if (json[index] !== '}') {
    while (true) {
      const key = string();
      if (Object.hasOwn(result, key)) throw new Error('duplicate');
      whitespace();
      if (json[index++] !== ':') throw new Error('json');
      whitespace();
      if (json[index] === '"') result[key] = string();
      else {
        const value =
          /^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/.exec(
            json.slice(index),
          );
        if (!value) throw new Error('json');
        result[key] = JSON.parse(value[0]);
        index += value[0].length;
      }
      whitespace();
      if (json[index] === '}') break;
      if (json[index++] !== ',') throw new Error('json');
      whitespace();
    }
  }
  index++;
  whitespace();
  if (index !== json.length) throw new Error('json');
  return result;
}
export function exactJwtFields(
  object: Record<string, unknown>,
  fields: readonly string[],
) {
  if (
    Object.keys(object).length !== fields.length ||
    fields.some((name) => !Object.hasOwn(object, name))
  )
    throw new Error('fields');
}
export function verifyRegisteredJwt(
  raw: string,
  client: MstyleOauthClient,
  typ: string,
  fields: readonly string[],
) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 8192)
    throw new Error('size');
  const parts = raw.split('.');
  if (
    parts.length !== 3 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    throw new Error('format');
  const header = parseJwtObject(parts[0]);
  const claims = parseJwtObject(parts[1]);
  exactJwtFields(header, ['alg', 'typ', 'kid']);
  exactJwtFields(claims, fields);
  const alg = client.algorithm || 'RS256';
  if (
    header.typ !== typ ||
    header.alg !== alg ||
    typeof header.kid !== 'string'
  )
    throw new Error('profile');
  const pem = client.publicKeysByKid?.[header.kid];
  if (!pem) throw new Error('key');
  const key = createPublicKey(pem);
  if (
    !['rsa', 'rsa-pss'].includes(key.asymmetricKeyType || '') ||
    (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
  )
    throw new Error('key');
  const signature = Buffer.from(parts[2], 'base64url');
  if (signature.toString('base64url') !== parts[2])
    throw new Error('signature');
  if (
    !verify(
      'sha256',
      Buffer.from(parts[0] + '.' + parts[1]),
      {
        key,
        padding:
          alg === 'PS256'
            ? constants.RSA_PKCS1_PSS_PADDING
            : constants.RSA_PKCS1_PADDING,
        ...(alg === 'PS256' ? { saltLength: 32 } : {}),
      },
      signature,
    )
  )
    throw new Error('signature');
  return claims;
}
export function jwtReplayKey(iss: string, typ: string, jti: string): string {
  return JSON.stringify([iss, typ, jti]);
}
