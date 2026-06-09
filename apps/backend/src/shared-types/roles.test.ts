import {
  ADMIN_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  BD_TIER_ROLES,
  isBdRole,
  isSeniorBdRole,
  isJuniorBdRole,
} from './roles';

describe('roles foundation', () => {
  it('defines a senior_bd role', () => {
    expect(ADMIN_ROLES.SENIOR_BD).toBe('senior_bd');
  });

  it('adds the new management/security permission keys', () => {
    expect(PERMISSIONS.ADMIN_DELETE).toBe('admin.delete');
    expect(PERMISSIONS.STAFF_RESET_PASSWORD).toBe('staff.reset_password');
    expect(PERMISSIONS.STAFF_OTP).toBe('staff.otp');
    expect(PERMISSIONS.STAFF_FORCE_LOGOUT).toBe('staff.force_logout');
    expect(PERMISSIONS.FINANCE_FREEZE).toBe('finance.freeze');
    expect(PERMISSIONS.EMERGENCY_CONTROL).toBe('emergency.control');
    expect(PERMISSIONS.AGENCY_CREATE).toBe('agency.create');
  });

  it('treats bd, bdm and senior_bd as the BD tier', () => {
    expect(BD_TIER_ROLES).toEqual(expect.arrayContaining(['bd', 'bdm', 'senior_bd']));
    expect(isBdRole('senior_bd')).toBe(true);
    expect(isBdRole('bd')).toBe(true);
  });

  it('classifies senior vs junior BD', () => {
    expect(isSeniorBdRole('senior_bd')).toBe(true);
    expect(isSeniorBdRole('bdm')).toBe(true);
    expect(isSeniorBdRole('bd')).toBe(false);
    expect(isJuniorBdRole('bd')).toBe(true);
    expect(isJuniorBdRole('senior_bd')).toBe(false);
  });

  it('grants senior_bd agency.manage and bd.view but not the wildcard', () => {
    const perms = ROLE_PERMISSIONS['senior_bd'];
    expect(perms).toContain('agency.manage');
    expect(perms).toContain('bd.view');
    expect(perms).not.toContain('*');
  });
});
