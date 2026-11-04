import type { CalEvent } from '@/engine/schedule';

/** Phone reminders only work in the installed app. */
export const remindersAvailable = false;

export async function scheduleReminder(_e: CalEvent): Promise<{ id?: string; blocked?: boolean }> {
  return {};
}

export async function cancelReminder(_id?: string) {}
