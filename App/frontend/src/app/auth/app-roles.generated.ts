// GENERATED FILE — DO NOT EDIT.
// Source: .intelliflow/iam/roles.json — regenerate with `npm run generate:roles`
// (runs automatically before `npm run build` and `npm run start`).

/**
 * The role values declared in roles.json, as typed constants: reference these
 * instead of role-string literals, so a role renamed or removed in roles.json
 * becomes a compile error instead of a silently dead check.
 */
export const AppRoles = {
  /** Full access to contacts including deletion. Includes all Contacts.Writer permissions. */
  ContactsAdmin: 'Contacts.Admin',
  /** Can create and edit contacts, but cannot delete them. */
  ContactsWriter: 'Contacts.Writer',
} as const;

/** One of the role values declared in roles.json. */
export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];

/** Every role value declared in roles.json, in declaration order. */
export const ALL_APP_ROLES: readonly AppRole[] = Object.values(AppRoles);
