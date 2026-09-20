import { randomBytes } from 'node:crypto';
import { requestEmailOtp, type EmailOtpStore } from './email-otp-service';

// The hosted Node process finishes the started delivery independently of this
// fixed response schedule. SMTP speed and account existence must not select
// the response time or the browser cookie. Delivery failures remove the code.
export async function requestPasswordReset(
  store: EmailOtpStore,
  email: string,
  deliver: (email: string, code: string) => Promise<void>,
  responseSchedule: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 5000)),
): Promise<string> {
  const token = Buffer.from(randomBytes(32)).toString('base64url');
  void requestEmailOtp(store, email, deliver, Date.now(), { token }).catch(
    () => {},
  );
  await responseSchedule();
  return token;
}
