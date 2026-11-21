import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, C } from './kit';
import { Reveal } from './motion';
import { Text } from './text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'add-circle', title: 'Say the job, get the price', text: 'Tap the orange +. Describe the job by voice or text, add photos or a 3D scan, and Studwise drafts the estimate with your prices.' },
  { icon: 'paper-plane', title: 'Send the quote and get it signed', text: 'Edit the wording, text the client a link, and they sign on their phone or on yours.' },
  { icon: 'camera', title: 'Run the job from one page', text: 'Each job keeps its photos by area, to-dos for the crew, and the money: what’s paid, what’s owed, what it cost.' },
  { icon: 'sparkles', title: 'Let Studwise check in each day', text: 'Home shows what needs you today: crew, follow-ups, money owed. Ask Studwise anything at the bottom.' },
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
          <Text style={{ color: C.ink2, fontSize: 15 }}>Here’s how Studwise works, in four steps.</Text>
        </Reveal>
        {STEPS.map((s, i) => (
          <Reveal key={s.title} index={i + 1}>
            <View style={{ flexDirection: 'row', gap: 14, backgroundColor: C.panel, borderRadius: 16, padding: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={s.icon} size={24} color={C.accent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700' }}>{`${i + 1}. `}<Text>{s.title}</Text></Text>
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
