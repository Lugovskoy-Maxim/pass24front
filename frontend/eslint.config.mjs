import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL('.', import.meta.url)),
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
];

export default config;
