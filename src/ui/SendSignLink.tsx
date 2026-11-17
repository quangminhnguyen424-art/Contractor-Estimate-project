import { router } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { useCloud } from '@/cloud/CloudProvider';
import { createSignLink } from '@/cloud/sign';
import { useApp } from '@/store/AppContext';

import { Button, Muted } from './kit';
import { notify } from './notify';

/** Sends the client a link to read and sign on their own phone (Studwise cloud). The signature comes back by itself. */
export function SendSignLink(props: {
  kind: 'quote' | 'change'; estimateId: string; changeId?: string; title: string; clientName: string; total: number;
  /** The document exactly as the client will see it. Called when the link is made. */
  html: () => string | Promise<string>;
  /** The text sent with the link, in the client's language. Without it: English. */
  message?: (link: string) => Promise<string>;
  /** Explain an error to the user; return true when it was handled. */
  failed?: (e: unknown) => boolean;
  /** Run before sending (e.g. save the change order first); may return the id the document got. */
  before?: () => string | void;
  disabled?: boolean;
}) {
  const cloud = useCloud();
  const { profile } = useApp();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!cloud.configured) return null;

  const send = async () => {
    if (!cloud.user) { router.push('/login'); return; }
    setBusy(true);
    try {
      const madeId = props.before?.();
      const company = profile?.companyName ?? '';
      const link = await createSignLink({
        uid: cloud.user.id, kind: props.kind, estimateId: props.estimateId, changeId: madeId || props.changeId, title: props.title,
        company, clientName: props.clientName, total: props.total, html: await props.html(),
        phone: profile?.phone, email: profile?.email, payLink: profile?.payLink,
      });
      const what = props.kind === 'quote' ? 'quote' : 'change order';
      await Share.share({ message: props.message ? await props.message(link) : `${company}: here is your ${what} for ${props.title}. Please review and sign here: ${link}` });
      setSent(true);
    } catch (e) {
      if (!props.failed?.(e)) notify('Could not make the link', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button kind="secondary" icon="link-outline" disabled={busy || props.disabled}
        title={busy ? 'Making the link…' : cloud.user ? (sent ? 'Send the link again' : 'Send a link to sign online') : 'Log in to send a signing link'} onPress={send} />
      {sent ? <Muted style={{ fontSize: 12 }}>When the client signs, Studwise records it here and lets you know. The link works for 30 days; a new link replaces the old one.</Muted> : null}
    </>
  );
}
