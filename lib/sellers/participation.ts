import type { ManagedMakerProgramMode } from '@/lib/configuration/types';

export type ParticipationRoute = 'registered_seller' | 'managed_maker';
export type ParticipationApplicationStage =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved_for_activation'
  | 'active'
  | 'rejected'
  | 'suspended';

export type CraftExperienceBand =
  | 'beginner'
  | 'less_than_one_year'
  | 'one_to_three_years'
  | 'four_to_ten_years'
  | 'more_than_ten_years';

export interface CraftExperience {
  craft: string;
  band: CraftExperienceBand;
}

export interface MakerSocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  x?: string;
  youtube?: string;
}

const experienceBands = new Set<CraftExperienceBand>([
  'beginner',
  'less_than_one_year',
  'one_to_three_years',
  'four_to_ten_years',
  'more_than_ten_years',
]);

export function parseCraftExperience(
  craftValue: string,
  bandValue: string,
): readonly CraftExperience[] {
  const craft = craftValue.trim();
  const band = bandValue.trim() as CraftExperienceBand;
  if (!craft && !bandValue.trim()) return [];
  if (!craft || !experienceBands.has(band)) {
    throw new Error('Choose a craft and a valid experience range together.');
  }
  if (craft.length > 120) throw new Error('Craft name must be 120 characters or fewer.');
  return [{ craft, band }];
}

const socialHosts: Record<keyof MakerSocialLinks, readonly string[]> = {
  facebook: ['facebook.com', 'www.facebook.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  x: ['x.com', 'www.x.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'],
};

export function parseMakerSocialLinks(
  values: Partial<Record<keyof MakerSocialLinks, string>>,
): MakerSocialLinks {
  const result: MakerSocialLinks = {};
  for (const [network, raw] of Object.entries(values) as Array<
    [keyof MakerSocialLinks, string | undefined]
  >) {
    const value = raw?.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Enter a valid ${network} URL.`);
    }
    if (url.protocol !== 'https:' || !socialHosts[network].includes(url.hostname.toLowerCase())) {
      throw new Error(`Enter a valid ${network} URL.`);
    }
    url.hash = '';
    result[network] = url.toString().replace(/\/$/, '');
  }
  return result;
}

export function applicationCapabilities(
  stage: ParticipationApplicationStage,
  programMode: ManagedMakerProgramMode,
) {
  const canPrepare = !['rejected', 'suspended'].includes(stage);
  const commerciallyActive = stage === 'active' && programMode === 'activation_enabled';
  return Object.freeze({
    editProfile: canPrepare,
    prepareProductDrafts: canPrepare,
    respondToReview: stage === 'changes_requested',
    publishProducts: commerciallyActive,
    acceptOrders: commerciallyActive,
  });
}

export function managedMakerDisplayName(publicName: string): string {
  const name = publicName.trim();
  if (!name) throw new Error('Public maker name is required.');
  return `${name} — Managed by Hastabazaar`;
}
