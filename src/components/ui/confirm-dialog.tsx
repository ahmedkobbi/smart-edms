'use client';

/**
 * Smart EDMS — Reusable confirmation dialog for destructive actions
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Delete user?"
 *     description="This action cannot be undone. The user will be permanently removed."
 *     confirmLabel="Delete"
 *     cancelLabel="Cancel"
 *     variant="destructive"
 *     onConfirm={async () => {
 *       await api.delete(`/api/admin/users/${id}`);
 *       toast({ title: 'User deleted' });
 *     }}
 *   />
 *
 * The dialog:
 *   - Requires the user to type a confirmation phrase (optional, via
 *     `requirePhrase` prop) for high-risk actions like tenant deletion.
 *   - Shows a clear visual severity (destructive = red).
 *   - Disables the confirm button until the async operation completes.
 *   - Closes automatically on success.
 */

import * as React from 'react';
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
import { Loader2, AlertTriangle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useI18n } from '@/i18n/use-i18n';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** When set, the user must type this exact phrase to enable the confirm button. */
  requirePhrase?: string;
  /** Phrase input label, e.g. "Type the document title to confirm" */
  requirePhraseLabel?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  requirePhrase,
  requirePhraseLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const phraseOk = !requirePhrase || phrase === requirePhrase;
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
      setPhrase('');
    } catch (err: any) {
      setError(err?.message || t('common.operationFailed'));
    } finally {
      setLoading(false);
    }
  }, [onConfirm, onOpenChange, t]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!loading) { onOpenChange(o); setPhrase(''); setError(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {variant === 'destructive' && (
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            )}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requirePhrase && (
          <div className="space-y-2">
            {requirePhraseLabel && (
              <label className="text-sm font-medium text-foreground">
                {requirePhraseLabel}
              </label>
            )}
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={requirePhrase}
              disabled={loading}
              autoComplete="off"
              aria-label={requirePhraseLabel || t('common.confirmationPhraseAria')}
            />
            <p className="text-xs text-muted-foreground">
              {t('common.typePhraseToConfirm', { phrase: requirePhrase })}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{resolvedCancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading || !phraseOk}
            className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {loading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t('common.working')}
              </>
            ) : (
              resolvedConfirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Convenience hook for managing a confirm dialog's open state + the
 * action to perform on confirm.
 *
 * Usage:
 *   const confirm = useConfirmDialog();
 *   <Button onClick={() => confirm.open({
 *     title: 'Delete user?',
 *     description: '...',
 *     variant: 'destructive',
 *     onConfirm: () => api.delete(...),
 *   })}>Delete</Button>
 *   {confirm.dialog}
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    props: Partial<ConfirmDialogProps> | null;
  }>({ open: false, props: null });

  const open = React.useCallback((props: Omit<ConfirmDialogProps, 'open' | 'onOpenChange'>) => {
    setState({ open: true, props });
  }, []);

  const dialog = state.props ? (
    <ConfirmDialog
      {...state.props}
      open={state.open}
      onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
      title={state.props.title || ''}
      description={state.props.description || ''}
      onConfirm={state.props.onConfirm || (() => {})}
    />
  ) : null;

  return { open, dialog };
}
