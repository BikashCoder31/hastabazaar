export const feedbackTopics = [
  'General question',
  'Order or delivery',
  'Product information',
  'Returns or refunds',
  'Seller support',
  'Website feedback',
] as const;

export type FeedbackTopic = (typeof feedbackTopics)[number];

export type CustomerFeedback = {
  name: string;
  email: string;
  phone: string;
  topic: FeedbackTopic;
  subject: string;
  rating: number | null;
  orderReference: string;
  message: string;
  pagePath: string;
};

export type FeedbackValidation =
  | { ok: true; feedback: CustomerFeedback }
  | { ok: false; error: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pagePathPattern = /^\/[\w!$&'()*+,\-./:;=@~%]*$/;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string'
    ? value.replaceAll('\0', '').replaceAll('\r\n', '\n').trim()
    : '';
}

export function validateCustomerFeedback(form: FormData): FeedbackValidation {
  const name = text(form, 'name');
  const email = text(form, 'email').toLowerCase();
  const topic = text(form, 'topic');
  const phone = text(form, 'phone');
  const subject = text(form, 'subject');
  const ratingText = text(form, 'rating');
  const orderReference = text(form, 'orderReference');
  const message = text(form, 'message');
  const submittedPagePath = text(form, 'pagePath');

  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: 'Enter your name using 2 to 100 characters.' };
  }
  if (email.length > 254 || !emailPattern.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (!feedbackTopics.includes(topic as FeedbackTopic)) {
    return { ok: false, error: 'Choose a valid query type.' };
  }
  if (phone.length > 30) return { ok: false, error: 'Phone number must be 30 characters or fewer.' };
  if (subject && (subject.length < 3 || subject.length > 160)) {
    return { ok: false, error: 'Subject must use 3 to 160 characters.' };
  }
  const rating = ratingText ? Number(ratingText) : null;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { ok: false, error: 'Choose a rating from 1 to 5.' };
  }
  if (orderReference.length > 80) {
    return {
      ok: false,
      error: 'Order reference must be 80 characters or fewer.',
    };
  }
  if (message.length < 10 || message.length > 2_000) {
    return {
      ok: false,
      error: 'Enter a query using 10 to 2,000 characters.',
    };
  }
  if (form.get('privacyAcknowledgement') !== 'accepted') {
    return {
      ok: false,
      error: 'Confirm that we may use these details to respond to your query.',
    };
  }

  const pagePath =
    submittedPagePath.length <= 200 && pagePathPattern.test(submittedPagePath)
      ? submittedPagePath
      : '/';

  return {
    ok: true,
    feedback: {
      name,
      email,
      phone,
      topic: topic as FeedbackTopic,
      subject,
      rating,
      orderReference,
      message,
      pagePath,
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export function createCustomerFeedbackEmail(
  feedback: CustomerFeedback,
  submittedAt: Date,
) {
  const timestamp = new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'long',
    timeStyle: 'long',
    timeZone: 'Asia/Kathmandu',
  }).format(submittedAt);
  const orderReference = feedback.orderReference || 'Not provided';

  return {
    subject: `[Hastabazaar query] ${feedback.subject || feedback.topic}`,
    text: [
      'A customer submitted a query through the Hastabazaar footer form.',
      '',
      `Name: ${feedback.name}`,
      `Email: ${feedback.email}`,
      `Phone: ${feedback.phone || 'Not provided'}`,
      `Query type: ${feedback.topic}`,
      `Subject: ${feedback.subject || 'Not provided'}`,
      `Rating: ${feedback.rating ? `${feedback.rating}/5` : 'Not provided'}`,
      `Order reference: ${orderReference}`,
      `Page: ${feedback.pagePath}`,
      `Submitted: ${timestamp}`,
      '',
      'Customer message:',
      feedback.message,
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#14284a;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border:1px solid #dfe5ef;border-radius:18px;padding:32px"><p style="margin:0 0 8px;color:#245fc2;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Hastabazaar customer query</p><h1 style="margin:0 0 24px;font-size:26px">${escapeHtml(feedback.topic)}</h1><table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6"><tr><td style="padding:5px 12px 5px 0;font-weight:700;vertical-align:top">Name</td><td style="padding:5px 0">${escapeHtml(feedback.name)}</td></tr><tr><td style="padding:5px 12px 5px 0;font-weight:700;vertical-align:top">Email</td><td style="padding:5px 0">${escapeHtml(feedback.email)}</td></tr><tr><td style="padding:5px 12px 5px 0;font-weight:700;vertical-align:top">Order reference</td><td style="padding:5px 0">${escapeHtml(orderReference)}</td></tr><tr><td style="padding:5px 12px 5px 0;font-weight:700;vertical-align:top">Page</td><td style="padding:5px 0">${escapeHtml(feedback.pagePath)}</td></tr><tr><td style="padding:5px 12px 5px 0;font-weight:700;vertical-align:top">Submitted</td><td style="padding:5px 0">${escapeHtml(timestamp)}</td></tr></table><div style="margin-top:24px;padding:20px;border-radius:12px;background:#f5f7fb;white-space:pre-wrap;line-height:1.65">${escapeHtml(feedback.message)}</div><p style="margin:20px 0 0;color:#68758a;font-size:13px;line-height:1.5">Reply using the customer email shown above. Do not forward this message outside the support team.</p></div></div></body></html>`,
  };
}
