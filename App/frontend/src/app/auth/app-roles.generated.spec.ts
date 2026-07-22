import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_APP_ROLES } from './app-roles.generated';

describe('app-roles.generated', () => {
  it('è allineato a .intelliflow/iam/roles.json — se fallisce, rigenerare con `npm run generate:roles`', () => {
    // Resolve from the frontend project root (the working directory `ng test` runs in), not from
    // import.meta.dirname: under `ng test --coverage` the latter points at the project root rather
    // than this file's directory, so a path relative to the spec would climb out past the repo.
    const rolesJsonPath = resolve(process.cwd(), '../../.intelliflow/iam/roles.json');
    const declaredRoles = JSON.parse(readFileSync(rolesJsonPath, 'utf8')) as { value: string }[];

    expect([...ALL_APP_ROLES]).toEqual(declaredRoles.map((role) => role.value));
  });
});
