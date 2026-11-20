'use client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function ConfirmOperation({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onConfirm,
  confirmLabel = 'Confirm decision',
  disabled = false,
  workspace = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
  confirmLabel?: string;
  disabled?: boolean;
  workspace?: boolean;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={pending}
            size={workspace ? 'workspace' : undefined}
            variant={workspace ? 'workspace-outline' : undefined}
          >
            Go back
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || disabled}
            size={workspace ? 'workspace' : undefined}
            variant={workspace ? 'workspace-decision' : undefined}
            onClick={onConfirm}
          >
            {pending ? 'Saving…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
