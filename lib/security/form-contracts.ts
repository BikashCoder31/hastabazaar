import type { FormAudience, FormDefinition } from '../forms/types';

function fixedSecurityForm(
  id: string,
  audience: FormAudience,
  route: string,
  keys: readonly string[],
  explanation: string,
): FormDefinition {
  return Object.freeze({
    id,
    adapterId: id,
    audience,
    route,
    mode: 'system',
    baseFields: Object.freeze(
      keys.map((key) =>
        Object.freeze({
          key,
          label: key,
          type: 'existing',
          capability: 'protected' as const,
          explanation:
            'This feature-managed security control keeps its native validation, authorization and secret handling. Form Catalog cannot change or collect it.',
        }),
      ),
    ),
    capabilities: Object.freeze({
      customFieldTypes: Object.freeze([]),
      answerBehavior: 'none',
      explanation: `${explanation} These fixed controls require no form publication and never create generic form answer records.`,
    }),
  });
}

/** Source inventory only: native security and portability handlers own these controls. */
export const SECURITY_FORM_CONTRACTS: Readonly<Record<string, FormDefinition>> =
  Object.freeze({
    'system.assisted-recovery-request': fixedSecurityForm(
      'system.assisted-recovery-request',
      'super_admin',
      '/api/security/assisted-recovery',
      [
        'targetId',
        'kind',
        'confirmedEmail',
        'confirmedTarget',
        'supportReference',
        'verificationReference',
        'verificationMethod',
        'ownershipVerified',
      ],
      'Freshly MFA-verified Super Admin can authorize registered-email password or lost-authenticator recovery for an eligible seller or Admin after documented ownership verification. Invitations and credentials never enter generic form answers.',
    ),
    'system.assisted-recovery-complete': fixedSecurityForm(
      'system.assisted-recovery-complete',
      'public',
      '/api/security/assisted-recovery/complete',
      ['token', 'password', 'confirmation'],
      'A valid private one-use mailbox invitation authorizes password completion or, with the current password, mandatory authenticator replacement. Live account, approval and expiry checks remain server enforced.',
    ),
    'system.seller-mfa-verify': fixedSecurityForm(
      'system.seller-mfa-verify',
      'seller',
      '/api/security/verify',
      ['password', 'code', 'recovery', 'returnTo'],
      'Enrolled sellers complete a protected second-factor check. A recent session-bound password proof avoids repeated password entry.',
    ),
    'system.seller-mfa-setup': fixedSecurityForm(
      'system.seller-mfa-setup',
      'seller',
      '/api/security/setup',
      ['password', 'code', 'recovery', 'setupId', 'manualKey', 'otpAuthUrl'],
      'Seller authenticator enrollment is optional unless replacement is required after assisted recovery. Existing factors protect replacements.',
    ),
    'system.seller-mfa-activation': fixedSecurityForm(
      'system.seller-mfa-activation',
      'seller',
      '/api/security/confirm',
      ['setupId', 'acknowledge', 'password', 'recoveryCodes'],
      'A confirmed authenticator and saved recovery codes are required before activation and older sessions are revoked.',
    ),
    'system.seller-recovery-codes': fixedSecurityForm(
      'system.seller-recovery-codes',
      'seller',
      '/api/security/recovery',
      ['password', 'code', 'recovery', 'recoveryCodes'],
      'Sellers replace their own recovery codes after current password and MFA assurance checks.',
    ),
    'system.seller-mfa-disable': fixedSecurityForm(
      'system.seller-mfa-disable',
      'seller',
      '/api/security/disable',
      ['password', 'code', 'recovery', 'acknowledge'],
      'A seller can turn off their own MFA after current password, existing factor and explicit acknowledgment. Sessions and recovery codes are revoked; staff policy cannot be bypassed through a secondary seller role.',
    ),
    'system.security-mfa-disable': fixedSecurityForm(
      'system.security-mfa-disable',
      'super_admin',
      '/api/security/disable',
      ['password', 'code', 'recovery', 'acknowledge'],
      'Super Admin can disable only their own MFA after a fresh password and factor check plus explicit acknowledgment. The transaction revokes sessions, invalidates recovery codes and records a secret-free audit event.',
    ),
    'system.backup-export': fixedSecurityForm(
      'system.backup-export',
      'super_admin',
      '/api/admin/backup-transfer',
      ['action', 'kind', 'passphrase', 'confirmation', 'ticket'],
      'Recent Super Admin verification and matching private passphrases protect export. The native preparation handler grants a one-use ticket submitted to /api/admin/backup-transfer/download; the package and passphrase stay outside answer history.',
    ),
    'system.backup-key-recovery': fixedSecurityForm(
      'system.backup-key-recovery',
      'super_admin',
      '/api/admin/backup-transfer',
      ['action', 'kind', 'passphrase', 'confirmation', 'ticket'],
      'Recent Super Admin verification and private passphrases protect key recovery. The native preparation handler grants a one-use ticket submitted to /api/admin/backup-transfer/download; encryption keys and passphrases stay outside answer history.',
    ),
    'system.backup-inspect': fixedSecurityForm(
      'system.backup-inspect',
      'super_admin',
      '/api/admin/backup-transfer/inspect',
      ['action', 'passphrase', 'file', 'ticket'],
      'The native inspection handler validates recent Super Admin verification, a private inspection ticket and the encrypted package. Inspection does not restore records; package bytes and passphrases stay outside answer history.',
    ),
    'system.security-password-bootstrap': fixedSecurityForm(
      'system.security-password-bootstrap',
      'staff',
      '/api/security/bootstrap',
      ['action', 'password', 'confirmation', 'code'],
      'The native first-password flow verifies the existing privileged account and email challenge before saving its password. Password policy, challenge consumption and existing permissions remain server enforced.',
    ),
    'system.security-mfa-verify': fixedSecurityForm(
      'system.security-mfa-verify',
      'staff',
      '/api/security/verify',
      ['password', 'code', 'recovery', 'returnTo'],
      'The native verification handler validates the privileged account password or its single-use, session-bound proof from a password login within five minutes, plus an authenticator or single-use recovery code when enrolled. Optional unenrolled Admin and explicitly disabled Super Admin accounts receive a password-proven session. Return destinations remain validated.',
    ),
    'system.security-mfa-setup': fixedSecurityForm(
      'system.security-mfa-setup',
      'staff',
      '/api/security/setup',
      ['password', 'code', 'recovery', 'setupId', 'manualKey', 'otpAuthUrl'],
      'The native setup handler verifies the password and existing factor when replacing an authenticator. The same rendered control conditionally posts its new authenticator code to /api/security/confirm; secrets and setup expiry remain feature managed.',
    ),
    'system.security-mfa-activation': fixedSecurityForm(
      'system.security-mfa-activation',
      'staff',
      '/api/security/confirm',
      ['setupId', 'acknowledge', 'password', 'recoveryCodes'],
      'Initial setup activates through native confirmation only after recovery-code acknowledgement. After code replacement this is a local acknowledgement with a status refresh, without another security mutation. Recovery codes stay outside answer history.',
    ),
    'system.security-recovery-codes': fixedSecurityForm(
      'system.security-recovery-codes',
      'staff',
      '/api/security/recovery',
      ['password', 'code', 'recovery', 'recoveryCodes'],
      'The native replacement handler validates the current privileged password and a fresh verified session or existing factor. Previous recovery codes are invalidated by the protected security workflow and new codes are shown only in that workflow.',
    ),
  });
