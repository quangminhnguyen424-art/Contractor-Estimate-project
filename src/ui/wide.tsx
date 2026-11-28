import { Platform, useWindowDimensions } from 'react-native';

/** A computer's browser window: from this width the web app stops looking like a phone and lays out like a web app. */
export const WIDE = 960;
/** Room for a second column beside the page (the chat on Home, the day beside the calendar). */
export const ROOMY = 1240;

/** True in a browser window wide enough for the desktop layout. Always false in the phone apps. */
export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE;
}

export function useRoomy(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= ROOMY;
}

/** Colors only the desktop layout uses: a dark rail on the left, a pale canvas, white surfaces on it. */
export const D = {
  canvas: '#F3F5F9',
  rail: '#0B1324',
  railInk: '#E6EAF2',
  railMuted: '#93A0B5',
  railOn: 'rgba(255,255,255,0.10)',
  railLine: 'rgba(255,255,255,0.08)',
  surfaceLine: '#E3E7ED',
  shadow: { shadowColor: '#0B1324', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
};

/** Things only a mouse does: a pointer cursor over what can be clicked. */
export const clickable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null;

/** A Pressable style that also knows when the mouse is over it (browsers only; phones never hover). */
export const hoverStyle = <S,>(fn: (hovered: boolean, pressed: boolean) => S) =>
  (state: { pressed: boolean }): S => fn(!!(state as { hovered?: boolean }).hovered, state.pressed);
