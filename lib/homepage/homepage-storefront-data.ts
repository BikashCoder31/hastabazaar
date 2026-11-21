import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { publicProductVisibility } from '@/lib/products/eligibility';
import { currentProductMediaOrder, currentProductMediaSql } from '@/lib/products/publication-media';
import { getReviewedPublicProfileExtras } from '@/lib/sellers/public-profile-media';
import { publicProfileEligibility } from '@/lib/sellers/public-profile-workflow';

export async function listHomepageMakers(db: D1Database, now: number) {
  const { results } = await db.prepare(`
    SELECT seller_profiles.id,
      (SELECT photos.id FROM product_media photos
        JOIN products ON products.id = photos.product_id
        WHERE products.seller_id = seller_profiles.id
          AND ${publicProductVisibility('products', now)}
          AND ${currentProductMediaSql('photos')} AND photos.mime_type LIKE 'image/%'
          AND NOT EXISTS (
            SELECT 1 FROM homepage_product_controls
            WHERE product_id = products.id AND is_hidden = 1
          )
        ORDER BY products.published_at DESC, ${currentProductMediaOrder('photos')}, photos.id
        LIMIT 1) AS productImageId
    FROM seller_profiles
    JOIN seller_public_profile_states profile ON profile.seller_id = seller_profiles.id
    WHERE profile.display_name IS NOT NULL
      AND ${publicProfileEligibility('seller_profiles.id', now)}
    ORDER BY profile.last_normal_publication_at DESC, seller_profiles.approved_at DESC, seller_profiles.id
    LIMIT 4
  `).all<{ id: string; productImageId: string | null }>();

  const entries = await Promise.all(results.map(async ({ id, productImageId }) => {
    const [profile, extras] = await Promise.all([
      getPublicMakerProfile(db, id),
      getReviewedPublicProfileExtras(db, id, now),
    ]);
    if (!profile?.tradingName) return null;
    const workshopPhoto = extras?.media.find(file => file.kind === 'profile_image');
    return {
      ...profile,
      experience: extras?.craftExperience[0],
      image: workshopPhoto ? {
        src: '/api/profile-media/' + encodeURIComponent(workshopPhoto.id),
        alt: workshopPhoto.caption || `Workshop photo from ${profile.tradingName}`,
      } : productImageId ? {
        src: '/api/product-media/' + encodeURIComponent(productImageId),
        alt: `A product from ${profile.tradingName}`,
      } : null,
    };
  }));
  return entries.filter(entry => entry !== null);
}
