/** Shared signup validation. Neither value is normalized or retained. */
export function passwordConfirmationError(password: string, confirmation: string): 'invalid' | 'confirmation' | null {
  if (password.length < 10 || password.length > 256) return 'invalid';
  return password === confirmation ? null : 'confirmation';
}
