import { useState } from 'react';
import { Platform } from 'react-native';

import { useApp } from '@/store/AppContext';
import { Banner, Button, Card, Field, H2, Muted } from '@/ui/kit';

/** Paste or pick a backup file and restore it. Used on first launch (new phone or computer). */
export function RestoreBackup() {
  const { importData } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json,text/plain';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (f) setText(await f.text());
      };
      input.click();
    } catch {
      setError('Could not open files. Paste the backup text instead.');
    }
  };

  return (
    <Card>
      <H2>Restore a backup</H2>
      <Muted style={{ fontSize: 13 }}>Moving from another phone or computer? Restore the backup you exported in Settings.</Muted>
      {Platform.OS === 'web' ? <Button kind="ghost" title="Choose backup file…" onPress={pickFile} /> : null}
      <Field label="Backup text" multiline value={text} onChangeText={(v) => { setText(v); setError(null); }}
        placeholder="Paste the backup text here" autoCapitalize="none" autoCorrect={false} />
      <Button kind="secondary" title="Restore backup" disabled={text.trim().length < 10} onPress={() => { const r = importData(text); setError(r.ok ? null : r.message); }} />
      {error ? <Banner tone="warn" title={error} /> : null}
    </Card>
  );
}
