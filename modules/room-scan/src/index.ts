import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** One wall, door, window or opening as a line on the floor plan, in meters. */
export interface ScanSegment {
  x1: number; y1: number; x2: number; y2: number;
  width: number; height: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface RoomScanResult {
  walls: ScanSegment[];
  doors: ScanSegment[];
  windows: ScanSegment[];
  openings: ScanSegment[];
  floorAreaM2?: number;
}

interface NativeRoomScan {
  isAvailable(): boolean;
  scanRoom(): Promise<RoomScanResult>;
}

/** The native scanner, or null where it doesn't exist (web, Android, Expo Go, older builds). */
function load(): NativeRoomScan | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<NativeRoomScan>('RoomScan');
  } catch {
    return null;
  }
}

const native = load();

/** True on an iPhone or iPad with LiDAR, in the installed app (not Expo Go, not the web). */
export function isRoomScanAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

/** Opens Apple's room scanner. Rejects with code CANCELED when the user cancels. */
export function scanRoom(): Promise<RoomScanResult> {
  if (!native) return Promise.reject(Object.assign(new Error('Room scanning is not available here.'), { code: 'UNSUPPORTED' }));
  return native.scanRoom();
}
