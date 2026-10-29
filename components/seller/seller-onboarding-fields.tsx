import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SellerOnboardingFields({ deferBank = false }: { deferBank?: boolean }) {
  return <fieldset className="grid min-w-0 gap-5 md:grid-cols-2">
    <legend className="mb-3 font-semibold">{deferBank ? 'Pickup and return addresses' : 'Private payout and collection details'}</legend>
    <p className="text-sm text-muted-foreground md:col-span-2">{deferBank ? 'Add bank details later from your dashboard. Payouts require reviewed bank details.' : 'Provide the beneficiary exactly as shown by your bank. Staff must verify the account before payout. These details and your documents stay private.'}</p>
    {([
      ['payoutBeneficiary', 'Bank account beneficiary name'], ['bankName', 'Bank name'],
      ['bankBranch', 'Bank branch'], ['bankAccountNumber', 'Bank account number'],
      ['pickupAddress', 'Full pickup address'], ['returnAddress', 'Full return address'],
    ] as const).filter(([name]) => !deferBank || name.endsWith('Address')).map(([name, label]) => <div key={name} className="min-w-0 space-y-2">
      <Label htmlFor={name}>{label} *</Label>
      <Input id={name} name={name} required minLength={3} maxLength={name.endsWith('Address') ? 500 : name === 'bankAccountNumber' ? 40 : 160}
        autoComplete="off" spellCheck={false} />
    </div>)}
    <p className="text-sm text-muted-foreground md:col-span-2">Include locality, ward, municipality, district and province in both addresses. You may use the same address for pickup and returns. Never provide a banking password, PIN or OTP.</p>
  </fieldset>;
}
