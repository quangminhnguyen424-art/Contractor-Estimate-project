import { View } from 'react-native';

import { jobSteps, type Job } from '@/engine/job';

import { Text } from '../text';
import { C } from '../theme';

/** Where the job is: Estimate → Sent → Signed → Finished. A thin four-part bar: done steps in dark ink, the current one blue. */
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
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${Math.min(done + 1, 4)} of 4: ${labels[Math.min(done, 3)]}`} style={{ flexDirection: 'row', gap: 4 }}>
      {labels.map((label, i) => {
        const isDone = i < done;
        const current = i === done;
        return (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: isDone ? C.ink : current ? C.accent : C.line }} />
            <Text style={{ fontSize: 12, fontWeight: current ? '600' : '400', color: isDone || current ? C.ink : C.muted }} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}
