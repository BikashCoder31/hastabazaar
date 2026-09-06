-- Run this once against production only after replacing BOTH placeholders.
-- Do not commit a real staff email address to source control.
INSERT INTO staff_invitations (
  id,
  email,
  role,
  status,
  invited_by,
  accepted_by,
  expires_at,
  created_at,
  accepted_at,
  revoked_at
) VALUES (
  'REPLACE_WITH_UUID',
  'REPLACE_WITH_COMPANY_EMAIL',
  'super_admin',
  'pending',
  NULL,
  NULL,
  4102444799000,
  CAST(unixepoch('now') * 1000 AS INTEGER),
  NULL,
  NULL
);
