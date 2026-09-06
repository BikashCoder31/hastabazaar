'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldPlus, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function StaffInvitationManager({
  pendingInvitations,
}: {
  pendingInvitations: readonly { id: string; email: string }[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [revoking, setRevoking] = useState<{ id: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function invite(event: { preventDefault(): void }) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/staff-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(result.error || 'Invitation failed.');
      setEmail('');
      setMessage(result.message || 'Invitation created.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(
        `/api/admin/staff-invitations/${encodeURIComponent(revoking.id)}`,
        { method: 'DELETE' },
      );
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(result.error || 'Revocation failed.');
      setRevoking(null);
      setMessage(result.message || 'Invitation revoked.');
      router.refresh();
    } catch (caught) {
      setRevoking(null);
      setError(caught instanceof Error ? caught.message : 'Revocation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="grid gap-4 rounded-xl border bg-muted/25 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="staff-email">Staff email</Label>
          <Input
            id="staff-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <select
            id="staff-role"
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={busy}>
          <ShieldPlus />
          {busy ? 'Saving…' : 'Create access'}
        </Button>
      </form>

      {message ? <output className="block text-sm font-medium text-emerald-700">{message}</output> : null}
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}

      {pendingInvitations.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Pending access</h3>
          {pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
              <span className="min-w-0 truncate text-sm">{invitation.email}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRevoking(invitation)}
                aria-label={`Revoke invitation for ${invitation.email}`}
              >
                <Trash2 /> Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this staff invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.email} will no longer be able to activate staff access from this invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={revoke}>
              {busy ? 'Revoking…' : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
