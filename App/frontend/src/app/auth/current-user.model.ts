/** The signed-in user as returned by the BFF's `GET /api/auth/me`; fields are null/empty when anonymous. */
export interface CurrentUser {
  oid: string | null;
  displayName: string | null;
  email: string | null;
  roles: string[];
}
