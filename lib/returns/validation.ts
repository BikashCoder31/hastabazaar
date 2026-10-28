import type { SupportedLocale } from '@/lib/marketplace/types';

export const returnReasons = [
  'damaged',
  'defective',
  'wrong_item',
  'not_as_described',
  'counterfeit',
  'late_delivery',
  'change_of_mind',
  'other',
] as const;

export type ReturnReason = (typeof returnReasons)[number];
export type RequestedResolution = 'refund' | 'replacement';

export interface ReturnPolicySnapshot {
  generalRequestWindowDays: number;
  sealedGoodsWindowDays: number;
  deliveryDamageEvidenceWindowHours: number;
  changeOfMindEnabled: boolean;
  highValueRefundThresholdPaisa: number;
  refundInitiationBusinessDays: number;
  codRefundEstimateBusinessDays: readonly [number, number];
}

export interface ReturnRequestInput {
  orderItemId: string;
  quantity: number;
  reason: ReturnReason;
  requestedResolution: RequestedResolution;
  detail: string;
  locale: SupportedLocale;
  idempotencyKey: string;
  originalSealIntact: boolean;
}

export interface EligibilityResult {
  decision: 'eligible' | 'ineligible' | 'manual_review';
  reasonEn: string;
  reasonNe: string;
}

export const maximumEvidenceFiles = 5;
export const maximumEvidenceFileBytes = 5 * 1024 * 1024;
export const maximumReturnRequestBytes = 27 * 1024 * 1024;

export function parseReturnRequest(formData: FormData): {
  input?: ReturnRequestInput;
  errors: string[];
} {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const errors: string[] = [];
  const orderItemId = text('orderItemId');
  const quantity = Number(text('quantity'));
  const reason = text('reason');
  const requestedResolution = text('requestedResolution');
  const detail = text('detail');
  const locale = text('locale');
  const idempotencyKey = text('idempotencyKey');
  const originalSealIntact = text('originalSealIntact') === 'yes';

  if (!orderItemId || orderItemId.length > 64) errors.push('Select a valid order item.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000) errors.push('Return quantity must be a positive whole number.');
  if (!returnReasons.includes(reason as ReturnReason)) errors.push('Select a valid return reason.');
  if (!['refund', 'replacement'].includes(requestedResolution)) errors.push('Select refund or replacement.');
  if (detail.length < 20 || detail.length > 2_000) errors.push('Add details of 20–2,000 characters.');
  if (!['en-NP', 'ne-NP'].includes(locale)) errors.push('Select English or Nepali.');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) errors.push('The request identifier is invalid.');

  return errors.length
    ? { errors }
    : {
        errors,
        input: {
          orderItemId,
          quantity,
          reason: reason as ReturnReason,
          requestedResolution: requestedResolution as RequestedResolution,
          detail,
          locale: locale as SupportedLocale,
          idempotencyKey,
          originalSealIntact,
        },
      };
}

export function parseReturnPolicySnapshot(value: string): ReturnPolicySnapshot {
  const parsed = JSON.parse(value) as Partial<ReturnPolicySnapshot>;
  if (
    !Number.isInteger(parsed.generalRequestWindowDays) ||
    !Number.isInteger(parsed.deliveryDamageEvidenceWindowHours) ||
    typeof parsed.changeOfMindEnabled !== 'boolean' ||
    !Number.isInteger(parsed.highValueRefundThresholdPaisa) ||
    !Number.isInteger(parsed.refundInitiationBusinessDays) ||
    !Array.isArray(parsed.codRefundEstimateBusinessDays) ||
    parsed.codRefundEstimateBusinessDays.length !== 2
  ) {
    throw new Error('The order return policy snapshot is invalid.');
  }
  return {
    ...(parsed as Omit<ReturnPolicySnapshot, 'sealedGoodsWindowDays'>),
    sealedGoodsWindowDays: Number.isInteger(parsed.sealedGoodsWindowDays)
      ? parsed.sealedGoodsWindowDays!
      : 15,
  };
}

function calendarDayIndex(value: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(value));
  const part = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Math.floor(Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000);
}

export function evaluateReturnEligibility(options: {
  reason: ReturnReason;
  deliveredAt: number;
  now: number;
  productReturnEligible: boolean;
  originalSealIntact?: boolean;
  policy: ReturnPolicySnapshot;
}): EligibilityResult {
  const elapsedCalendarDays = Math.max(
    0,
    calendarDayIndex(options.now) - calendarDayIndex(options.deliveredAt),
  );
  const evidenceWindowMs = options.policy.deliveryDamageEvidenceWindowHours * 3_600_000;
  const elapsedMs = Math.max(0, options.now - options.deliveredAt);
  const statutoryReasons: readonly ReturnReason[] = [
    'damaged',
    'defective',
    'wrong_item',
    'not_as_described',
    'counterfeit',
    'late_delivery',
  ];

  if (options.reason === 'change_of_mind') {
    if (!options.policy.changeOfMindEnabled || !options.productReturnEligible) {
      return {
        decision: 'ineligible',
        reasonEn: 'This item is not eligible for a change-of-mind return under the snapshotted policy.',
        reasonNe: 'स्न्यापसट गरिएको नीतिअनुसार यो सामान मन परिवर्तनका कारण फिर्ता गर्न योग्य छैन।',
      };
    }
    if (elapsedCalendarDays > options.policy.generalRequestWindowDays) {
      if (
        options.originalSealIntact &&
        elapsedCalendarDays <= options.policy.sealedGoodsWindowDays
      ) {
        return {
          decision: 'manual_review',
          reasonEn: `The request is within the ${options.policy.sealedGoodsWindowDays}-day sealed-goods window; the original seal must be verified.`,
          reasonNe: `अनुरोध ${options.policy.sealedGoodsWindowDays}-दिने सिलबन्द सामान अवधिभित्र छ; मूल सिल जाँच गर्नुपर्छ।`,
        };
      }
      return {
        decision: 'ineligible',
        reasonEn: `The ${options.policy.generalRequestWindowDays}-day change-of-mind window has ended.`,
        reasonNe: `मन परिवर्तनका लागि ${options.policy.generalRequestWindowDays} दिनको अवधि समाप्त भएको छ।`,
      };
    }
    return {
      decision: 'eligible',
      reasonEn: 'The request is within the snapshotted general return window.',
      reasonNe: 'अनुरोध स्न्यापसट गरिएको सामान्य फिर्ता अवधिभित्र छ।',
    };
  }

  if (statutoryReasons.includes(options.reason)) {
    if (options.reason === 'damaged' && elapsedMs > evidenceWindowMs) {
      return {
        decision: 'manual_review',
        reasonEn: 'Reported after the visible-damage evidence window; statutory rights still require review.',
        reasonNe: 'देखिने क्षतिको प्रमाण अवधिपछि रिपोर्ट गरिएको छ; कानुनी अधिकारका लागि अझै समीक्षा आवश्यक छ।',
      };
    }
    return {
      decision: 'eligible',
      reasonEn: 'The reason is covered regardless of change-of-mind eligibility.',
      reasonNe: 'यो कारण मन परिवर्तनसम्बन्धी योग्यताभन्दा अलग रूपमा समेटिएको छ।',
    };
  }

  if (
    options.originalSealIntact &&
    elapsedCalendarDays <= options.policy.sealedGoodsWindowDays
  ) {
    return {
      decision: 'manual_review',
      reasonEn: `The request is within the ${options.policy.sealedGoodsWindowDays}-day sealed-goods window; the original seal must be verified.`,
      reasonNe: `अनुरोध ${options.policy.sealedGoodsWindowDays}-दिने सिलबन्द सामान अवधिभित्र छ; मूल सिल जाँच गर्नुपर्छ।`,
    };
  }

  return elapsedCalendarDays <= options.policy.generalRequestWindowDays
    ? {
        decision: 'manual_review',
        reasonEn: 'The request is within the return window and needs an administrator decision.',
        reasonNe: 'अनुरोध फिर्ता अवधिभित्र छ र प्रशासकीय निर्णय आवश्यक छ।',
      }
    : {
        decision: 'ineligible',
        reasonEn: `The ${options.policy.generalRequestWindowDays}-day general return window has ended.`,
        reasonNe: `${options.policy.generalRequestWindowDays} दिनको सामान्य फिर्ता अवधि समाप्त भएको छ।`,
      };
}

export function validateEvidenceFile(file: File): string | null {
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > maximumEvidenceFileBytes) return 'Each file must be 5 MB or smaller.';
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
    return 'Use a JPG, PNG, WebP, or PDF file.';
  }
  return null;
}
