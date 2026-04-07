/**
 * RBAC (Role-Based Access Control) — 역할 기반 접근 제어
 * - 역할: user, moderator, admin, superadmin
 * - 권한: 최소 권한 원칙 (Principle of Least Privilege)
 * - 계층 구조: superadmin > admin > moderator > user
 */

export type Role = 'user' | 'moderator' | 'admin' | 'superadmin';

export type Permission =
  | 'chat:use'
  | 'chat:unlimited'
  | 'models:view'
  | 'models:manage'
  | 'users:view'
  | 'users:manage'
  | 'users:delete'
  | 'credits:view'
  | 'credits:manage'
  | 'credits:grant'
  | 'audit:view'
  | 'admin:access'
  | 'admin:settings'
  | 'system:manage'
  | 'api:unlimited';

// ── 역할별 권한 매핑 ──
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  user: new Set([
    'chat:use',
    'models:view',
    'credits:view',
  ]),
  moderator: new Set([
    'chat:use',
    'chat:unlimited',
    'models:view',
    'credits:view',
    'users:view',
    'audit:view',
  ]),
  admin: new Set([
    'chat:use',
    'chat:unlimited',
    'models:view',
    'models:manage',
    'credits:view',
    'credits:manage',
    'credits:grant',
    'users:view',
    'users:manage',
    'audit:view',
    'admin:access',
    'api:unlimited',
  ]),
  superadmin: new Set([
    'chat:use',
    'chat:unlimited',
    'models:view',
    'models:manage',
    'credits:view',
    'credits:manage',
    'credits:grant',
    'users:view',
    'users:manage',
    'users:delete',
    'audit:view',
    'admin:access',
    'admin:settings',
    'system:manage',
    'api:unlimited',
  ]),
};

// ── 역할 계층 (숫자가 클수록 상위) ──
const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

/**
 * 특정 역할이 특정 권한을 가지고 있는지 확인
 */
export function hasPermission(role: Role | string | undefined, permission: Permission): boolean {
  const normalizedRole = normalizeRole(role);
  return ROLE_PERMISSIONS[normalizedRole]?.has(permission) ?? false;
}

/**
 * 특정 역할이 여러 권한을 모두 가지고 있는지 확인
 */
export function hasAllPermissions(role: Role | string | undefined, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * 특정 역할이 여러 권한 중 하나라도 가지고 있는지 확인
 */
export function hasAnyPermission(role: Role | string | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * 역할 비교: roleA가 roleB 이상의 권한을 가지는지
 */
export function isRoleAtLeast(roleA: Role | string | undefined, roleB: Role): boolean {
  return ROLE_HIERARCHY[normalizeRole(roleA)] >= ROLE_HIERARCHY[roleB];
}

/**
 * 역할 문자열 정규화 (잘못된 값 → 'user')
 */
export function normalizeRole(role: string | undefined | null): Role {
  if (!role || typeof role !== 'string') return 'user';
  const lower = role.toLowerCase().trim() as Role;
  return ROLE_HIERARCHY[lower] !== undefined ? lower : 'user';
}

/**
 * 역할의 모든 권한 목록 반환
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] || []);
}
