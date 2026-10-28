'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ReferralShare({
  code,
  invitationLink: link,
}: {
  code: string;
  invitationLink: string | null;
}) {
  const [message, setMessage] = useState('');
  return (
    <div className="mt-5 space-y-3">
      <label className="block text-sm font-medium" htmlFor="referral-code">
        Your referral code
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id="referral-code"
          readOnly
          value={code}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-xl border bg-background p-3 font-mono text-base tracking-wider"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage('Referral code copied.');
            } catch {
              setMessage('Select and copy your code above.');
            }
          }}
        >
          Copy code
        </Button>
      </div>
      {link ? (
        <>
          <label className="block text-sm font-medium" htmlFor="referral-link">
            Your invitation link
          </label>
          <input
            id="referral-link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-xl border bg-background p-3 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMessage('Invitation link copied.');
                } catch {
                  setMessage('Select and copy the link above.');
                }
              }}
            >
              Copy invitation
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={async () => {
                try {
                  if (navigator.share)
                    await navigator.share({
                      title: 'Shop with me on Hastabazaar',
                      url: link,
                    });
                  else {
                    await navigator.clipboard.writeText(link);
                    setMessage('Invitation link copied.');
                  }
                } catch {
                  setMessage('You can copy the link above to share it.');
                }
              }}
            >
              Share with a friend
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Invitation links are unavailable. You can copy your referral code
          above.
        </p>
      )}
      <output className="block text-sm">{message}</output>
    </div>
  );
}
