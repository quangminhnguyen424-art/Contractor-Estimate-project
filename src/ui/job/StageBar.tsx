import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { jobSteps, type Job } from '@/engine/job';

import { Text } from '../text';
import { C } from '../theme';

/** Where the job is: Estimate → Sent → Signed → Finished. Done steps are ticked, the current one is blue. */
export function StageBar({ job }: { job: Job }) {
  const { labels, done } = jobSteps(job);
  if (job.stage === 'lost') {
    return (
      <View style={{ alignSelf: 'flex-start', backgroundColor: C.cardHi, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
        <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>Lost</Text>
      </View>
    );
  }
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${Math.min(done + 1, 4)} of 4: ${labels[Math.min(done, 3)]}`} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {labels.map((label, i) => {
        const isDone = i < done;
        const current = i === done;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View style={{ flex: 1, height: 3, backgroundColor: i === 0 ? 'transparent' : i <= done ? C.accent : C.line }} />
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDone ? C.accent : C.card, borderWidth: 2, borderColor: isDone || current ? C.accent : C.line }}>
                {isDone ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : current ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} /> : null}
              </View>
              <View style={{ flex: 1, height: 3, backgroundColor: i === labels.length - 1 ? 'transparent' : i < done ? C.accent : C.line }} />
            </View>
            {/* Bold means done. The step in progress is marked by its ring, not shown as if finished. */}
            <Text style={{ fontSize: 12, fontWeight: isDone ? '700' : '500', color: isDone ? C.ink : current ? C.ink2 : C.muted }} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}
