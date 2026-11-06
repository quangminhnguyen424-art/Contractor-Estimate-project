import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, C } from './kit';
import { Reveal } from './motion';
import { Text } from './text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'add-circle', title: 'Price your first job', text: 'Tap the orange +. Talk, scan the room or snap a photo, and Bidwell drafts the estimate with your prices.' },
  { icon: 'camera', title: 'Keep every job site in one place', text: 'Photos by room, before and after, tasks your crew marks done, and a work order in their language.' },
  { icon: 'document-text', title: 'Send the quote and get it signed', text: 'Edit the wording, let the client sign on your phone or from a link, then share the PDF.' },
  { icon: 'sparkles', title: 'Let Bidwell check in each day', text: 'Home shows what needs you today: crew, follow-ups, money owed. Ask Bidwell anything at the bottom.' },
];

/** The last step of the welcome: four things to do first, then straight into the app. */
export function QuickTour({ name, onDone }: { name?: string; onDone: (route?: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 28, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <Reveal style={{ gap: 6 }}>
          <Text style={{ color: C.accent, fontWeight: '700', fontSize: 14 }}>QUICK TOUR</Text>
          <Text style={{ color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>You’re all set{name ? `, ${name}` : ''}</Text>
          <Text style={{ color: C.ink2, fontSize: 15 }}>Here’s how Bidwell works, in four steps.</Text>
        </Reveal>
        {STEPS.map((s, i) => (
          <Reveal key={s.title} index={i + 1}>
            <View style={{ flexDirection: 'row', gap: 14, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={s.icon} size={24} color={C.accent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700' }}>{i + 1}. {s.title}</Text>
                <Text style={{ color: C.ink2, fontSize: 14, lineHeight: 20 }}>{s.text}</Text>
              </View>
            </View>
          </Reveal>
        ))}
      </ScrollView>
      <View style={{ padding: 20, paddingBottom: insets.bottom + 16, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <Button title="Start my first estimate" icon="add" onPress={() => onDone('/new')} />
        <Button kind="secondary" title="Go to Home" onPress={() => onDone()} />
      </View>
    </View>
  );
}
