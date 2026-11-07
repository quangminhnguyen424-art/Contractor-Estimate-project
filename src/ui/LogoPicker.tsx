import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image, Pressable, View } from 'react-native';

import { Button, C, Label } from './kit';
import { notify } from './notify';
import { Text } from './text';

/** Pick the company logo: resized small (it travels inside every PDF and signing page) and kept as an image data URL. */
export function LogoPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const pick = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (r.canceled || !r.assets[0]) return;
      const ctx = ImageManipulator.manipulate(r.assets[0].uri);
      ctx.resize({ width: Math.min(480, r.assets[0].width || 480) });
      const img = await ctx.renderAsync();
      let data: string;
      try {
        const out = await img.saveAsync({ base64: true, format: SaveFormat.PNG });
        data = `data:image/png;base64,${out.base64}`;
        if (data.length > 240_000) {
          const jpg = await img.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
          data = `data:image/jpeg;base64,${jpg.base64}`;
        }
      } finally {
        try { img.release(); } catch { /* released */ }
        try { ctx.release(); } catch { /* released */ }
      }
      if (data.length > 240_000) { notify('Logo too large', 'Use a simpler or smaller logo image.'); return; }
      onChange(data);
    } catch {
      notify('Could not open photos', 'Allow Bidwell AI to use Photos in your iPhone Settings.');
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Label>Company logo</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? 'Change logo' : 'Add logo'} onPress={pick}
        style={{ height: 96, borderRadius: 16, borderWidth: 1, borderStyle: value ? 'solid' : 'dashed', borderColor: C.line, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
        {value ? <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          : <Text style={{ color: C.accent, fontWeight: '600' }}>+ Add your logo</Text>}
      </Pressable>
      <Text style={{ color: C.muted, fontSize: 12 }}>Printed at the top of every quote, contract, invoice and signing page.</Text>
      {value ? <Button kind="ghost" title="Remove logo" onPress={() => onChange(undefined)} /> : null}
    </View>
  );
}
