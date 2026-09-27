import { env } from 'cloudflare:workers';

import {
  createCustomerFeedbackEmail,
  type CustomerFeedback,
} from '@/lib/feedback/customer-feedback';

type EmailService = {
  configured?: boolean;
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
};

type FeedbackEmailEnvironment = {
  EMAIL?: EmailService;
  EMAIL_DELIVERY_CONFIGURED?: string;
};

const feedbackRecipient = 'hastabazaar98@gmail.com';

/** Raised only before the external transport is invoked. */
export class FeedbackDeliveryUnavailableError extends Error {}

export async function sendCustomerFeedbackEmail(
  feedback: CustomerFeedback,
): Promise<void> {
  const current = env as unknown as FeedbackEmailEnvironment;
  if (
    !current.EMAIL ||
    (current.EMAIL_DELIVERY_CONFIGURED !== 'true' &&
      current.EMAIL.configured !== true)
  ) {
    throw new FeedbackDeliveryUnavailableError('Email delivery is not configured.');
  }

  await current.EMAIL.send({
    to: feedbackRecipient,
    ...createCustomerFeedbackEmail(feedback, new Date()),
  });
}
