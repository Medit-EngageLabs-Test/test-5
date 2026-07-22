// GENERATED FILE — DO NOT EDIT.
// Source: .intelliflow/iam/roles.json — regenerate with `npm run generate:roles`
// (runs automatically before `npm run build` and `npm run start`).

/**
 * The role values declared in roles.json, as typed constants: reference these
 * instead of role-string literals, so a role renamed or removed in roles.json
 * becomes a compile error instead of a silently dead check.
 */
export const AppRoles = {
  /** Full moderation rights on the Board: can manage any Task regardless of who created it. */
  BoardModerator: 'Board.Moderator',
} as const;

/** One of the role values declared in roles.json. */
export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];

/** Every role value declared in roles.json, in declaration order. */
export const ALL_APP_ROLES: readonly AppRole[] = Object.values(AppRoles);
