import { Redirect } from 'expo-router';

// Any unknown address (e.g. when the web version is hosted under another path) goes to the home screen.
export default function NotFound() {
  return <Redirect href="/" />;
}
