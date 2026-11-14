import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { KINDS, reminderAt, timeLabel, type CalEvent } from '@/engine/schedule';

// Show reminders even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export const remindersAvailable = true;

async function allowed(): Promise<boolean> {
  // Android 13+ shows the permission question only once a channel exists.
  // eslint-disable-next-line import/namespace -- the enum is re-exported through `export *`, which the lint rule cannot follow
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Schedules (or moves) the phone reminder for an event. Returns the new reminder id, or undefined when there is
 * no reminder (none chosen, already past, or notifications turned off). Any old reminder is cancelled first.
 */
export async function scheduleReminder(e: CalEvent): Promise<{ id?: string; blocked?: boolean }> {
  if (e.notificationId) await Notifications.cancelScheduledNotificationAsync(e.notificationId).catch(() => {});
  const at = reminderAt(e);
  if (!at || e.done) return {};
  if (!(await allowed())) return { blocked: true };
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: `${KINDS[e.kind].en}: ${e.title}`, body: [timeLabel(e), e.address].filter(Boolean).join(' · '), data: { eventId: e.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
  return { id };
}

export async function cancelReminder(id?: string) {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Clears every scheduled reminder (used when all data is erased or replaced by a backup). */
export async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
