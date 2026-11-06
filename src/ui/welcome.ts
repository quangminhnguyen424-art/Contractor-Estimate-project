// "Welcomed on this phone": the welcome video, setup walk-through and quick tour run once per account per phone.
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (uid: string) => `estimating-app/welcomed/${uid}`;

export async function isWelcomed(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(uid))) === '1';
  } catch {
    return true; // storage trouble: don't trap anyone in the tour
  }
}

export const markWelcomed = (uid: string) => AsyncStorage.setItem(key(uid), '1').catch(() => {});

// Set when setup was just finished, so the tour that follows doesn't replay the video and setup.
let fresh = false;
export const isFreshSetup = () => fresh;
export const markFreshSetup = () => { fresh = true; };
export const clearFreshSetup = () => { fresh = false; };
