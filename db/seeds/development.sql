-- Local development data only. Never apply this file to production.
-- IDs and timestamps are fixed so the seed is repeatable after a local reset.

INSERT OR IGNORE INTO categories (
  id,
  parent_id,
  slug,
  name_en,
  name_ne,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES
  ('cat-gifts', NULL, 'gifts', 'Gifts', 'उपहार', 1, 10, 1788681600000, 1788681600000),
  ('cat-home-decor', NULL, 'home-decor', 'Home decor', 'गृह सजावट', 1, 20, 1788681600000, 1788681600000),
  ('cat-jewelry-accessories', NULL, 'jewelry-accessories', 'Jewelry & accessories', 'गहना तथा सहायक सामग्री', 1, 30, 1788681600000, 1788681600000),
  ('cat-traditional-textiles', NULL, 'traditional-textiles', 'Traditional textiles', 'परम्परागत कपडा', 1, 40, 1788681600000, 1788681600000),
  ('cat-lifestyle', NULL, 'lifestyle', 'Lifestyle', 'जीवनशैली', 1, 50, 1788681600000, 1788681600000),
  ('cat-art-paintings', NULL, 'art-paintings', 'Art & paintings', 'कला तथा चित्रकला', 1, 60, 1788681600000, 1788681600000),
  ('cat-pottery', NULL, 'pottery', 'Pottery', 'माटोका भाँडा', 1, 70, 1788681600000, 1788681600000),
  ('cat-wood-bamboo-craft', NULL, 'wood-bamboo-craft', 'Wood/bamboo craft', 'काठ तथा बाँसका हस्तकला', 1, 80, 1788681600000, 1788681600000),
  ('cat-personalized-gifts', NULL, 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 90, 1788681600000, 1788681600000),
  ('cat-corporate-gifting', NULL, 'corporate-gifting', 'Corporate gifting', 'संस्थागत उपहार', 1, 100, 1788681600000, 1788681600000);

INSERT OR IGNORE INTO occasions (
  id, slug, name_en, name_ne, is_active, sort_order, created_at, updated_at
) VALUES
  ('occasion-birthday', 'birthday-gifts', 'Birthday gifts', 'जन्मदिनका उपहार', 1, 10, 1788681600000, 1788681600000),
  ('occasion-wedding', 'wedding-gifts', 'Wedding gifts', 'विवाहका उपहार', 1, 20, 1788681600000, 1788681600000),
  ('occasion-dashain', 'dashain-gifts', 'Dashain gifts', 'दशैंका उपहार', 1, 30, 1788681600000, 1788681600000),
  ('occasion-tihar', 'tihar-gifts', 'Tihar gifts', 'तिहारका उपहार', 1, 40, 1788681600000, 1788681600000),
  ('occasion-mothers-day', 'mothers-day', 'Mother''s Day', 'आमाको मुख हेर्ने दिन', 1, 50, 1788681600000, 1788681600000),
  ('occasion-fathers-day', 'fathers-day', 'Father''s Day', 'बुबाको मुख हेर्ने दिन', 1, 60, 1788681600000, 1788681600000),
  ('occasion-anniversary', 'anniversary', 'Anniversary', 'वार्षिकोत्सव', 1, 70, 1788681600000, 1788681600000),
  ('occasion-corporate', 'corporate-gifts', 'Corporate gifts', 'संस्थागत उपहार', 1, 80, 1788681600000, 1788681600000),
  ('occasion-nepali-abroad', 'nepali-gifts-abroad', 'Nepali gifts abroad', 'विदेशमा नेपाली उपहार', 1, 90, 1788681600000, 1788681600000),
  ('occasion-housewarming', 'housewarming', 'Housewarming', 'गृहप्रवेशका उपहार', 1, 100, 1788681600000, 1788681600000),
  ('occasion-personalized', 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 110, 1788681600000, 1788681600000);

-- The Sites local authentication fixture uses this address. The invitation
-- activates only after that user signs in to /admin.
INSERT OR IGNORE INTO staff_invitations (
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
  'invite-local-super-admin',
  'seedy@sites.test',
  'super_admin',
  'pending',
  NULL,
  NULL,
  4102444799000,
  1788624000000,
  NULL,
  NULL
);

PRAGMA optimize;
