import * as ImagePicker from 'expo-image-picker';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text } from '@/ui/text';
import { newId } from '@/engine/format';
import { markupSvg, type PhotoKind, type SitePhoto } from '@/engine/site';

import { C } from './kit';
import { notify } from './notify';
import { savePhoto, usePhotoUri } from './photoStore';

/** A job site photo with its drawings on top, at any width. */
export function PhotoView({ photo, width, badge }: { photo: SitePhoto; width: number; badge?: string }) {
  const height = Math.round((width * photo.h) / photo.w);
  const src = usePhotoUri(photo.uri);
  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', backgroundColor: C.cardHi }}>
      {src ? <Image source={{ uri: src }} style={{ width, height }} accessibilityLabel={photo.note || `${photo.kind} photo`} /> : null}
      {photo.markup.length ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <SvgXml xml={markupSvg(photo.markup, photo.w, photo.h)} width={width} height={height} />
        </View>
      ) : null}
      {badge ? (
        <View style={{ position: 'absolute', left: 4, top: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const KIND_LABEL: Record<PhotoKind, string> = { before: 'Before', progress: 'Progress', after: 'After' };

/** Takes or picks photos and stores them safely. Returns the new photos (empty if cancelled). */
export async function addSitePhotos(camera: boolean, kind: PhotoKind): Promise<SitePhoto[]> {
  try {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify('Camera access needed', 'Allow camera access in Settings to take job photos.');
        return [];
      }
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 20 });
    if (res.canceled) return [];
    const out: SitePhoto[] = [];
    let failed = 0;
    for (const a of res.assets) {
      try {
        const saved = await savePhoto(a.uri, a.width);
        out.push({ id: newId(), uri: saved.uri, w: saved.w || a.width || 1000, h: saved.h || a.height || 750, kind, note: '', markup: [], takenAt: new Date().toISOString() });
      } catch {
        failed++;
      }
    }
    if (failed) notify(`${failed} photo${failed > 1 ? 's' : ''} could not be saved`, 'Try JPG or PNG photos, or take the photo with the camera.');
    return out;
  } catch {
    notify('Photos unavailable', 'Could not open photos on this device.');
    return [];
  }
}

