#!/usr/bin/env node
// Generates src/app/auth/app-roles.generated.ts from the App's role declaration
// (.intelliflow/iam/roles.json), so frontend code references typed constants
// instead of role-string literals: a role renamed or removed in roles.json
// becomes a compile error at the next build instead of a silently dead check.
//
// Runs automatically before `npm run build` / `npm run start` (pre-hooks in
// package.json) and in the Docker image build; the output is committed, and a
// unit test asserts it stays aligned with roles.json. No dependencies: plain
// Node, deterministic output (same input → byte-identical file).
//
// Usage: node scripts/generate-app-roles.mjs [path/to/roles.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rolesJsonPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(scriptDir, '../../../.intelliflow/iam/roles.json');
const outputPath = resolve(scriptDir, '../src/app/auth/app-roles.generated.ts');

/**
 * Derives the TypeScript identifier for a role value: alphanumeric segments
 * (split on '.', '_', '-', …) concatenated in PascalCase — "Contacts.Admin"
 * becomes "ContactsAdmin".
 */
function identifierFor(value) {
  const identifier = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join('');
  if (!/^[A-Za-z]/.test(identifier)) {
    throw new Error(`Role value "${value}" does not yield a valid TypeScript identifier.`);
  }
  return identifier;
}

/** Makes a role description safe inside a JSDoc block comment. */
function jsdocSafe(text) {
  return text.replaceAll('*/', '*\\/');
}

/** Renders a role value as a single-quoted TypeScript string literal. */
function stringLiteral(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

const roles = JSON.parse(readFileSync(rolesJsonPath, 'utf8'));
if (!Array.isArray(roles)) {
  throw new Error(`${rolesJsonPath} must contain a JSON array of role declarations.`);
}

const seen = new Map();
for (const role of roles) {
  if (typeof role?.value !== 'string' || role.value.length === 0) {
    throw new Error(`Every role declaration in ${rolesJsonPath} must have a non-empty string "value".`);
  }
  const identifier = identifierFor(role.value);
  if (seen.has(identifier)) {
    throw new Error(
      `Role values "${seen.get(identifier).value}" and "${role.value}" both map to the identifier "${identifier}".`,
    );
  }
  seen.set(identifier, role);
}

const constants = [...seen.entries()]
  .map(([identifier, role]) => {
    const description = role.description ? `  /** ${jsdocSafe(role.description)} */\n` : '';
    return `${description}  ${identifier}: ${stringLiteral(role.value)},`;
  })
  .join('\n');

// `{}` on one line when there are no roles: the multi-line form would not be
// prettier-clean, and the committed file must always pass format:check.
const appRolesObject = constants.length === 0 ? '{} as const' : `{\n${constants}\n} as const`;

const content = `// GENERATED FILE — DO NOT EDIT.
// Source: .intelliflow/iam/roles.json — regenerate with \`npm run generate:roles\`
// (runs automatically before \`npm run build\` and \`npm run start\`).

/**
 * The role values declared in roles.json, as typed constants: reference these
 * instead of role-string literals, so a role renamed or removed in roles.json
 * becomes a compile error instead of a silently dead check.
 */
export const AppRoles = ${appRolesObject};

/** One of the role values declared in roles.json. */
export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];

/** Every role value declared in roles.json, in declaration order. */
export const ALL_APP_ROLES: readonly AppRole[] = Object.values(AppRoles);
`;

writeFileSync(outputPath, content);
console.log(`Generated ${outputPath} from ${rolesJsonPath} (${roles.length} roles).`);
