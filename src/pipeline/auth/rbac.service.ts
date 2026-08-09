export const ROLE_PERMISSIONS: Record<string,string[]> = {
  ADMIN: ['*'],
  EDITOR: ['scholarships:read','articles:read','articles:write','articles:approve','articles:publish'],
  VIEWER: ['scholarships:read','articles:read','jobs:read','metrics:read'],
};
export function permissionsForRole(role: string): string[] { return ROLE_PERMISSIONS[role] ?? []; }
export function hasPermission(permissions: string[], required: string): boolean { return permissions.includes('*') || permissions.includes(required); }
