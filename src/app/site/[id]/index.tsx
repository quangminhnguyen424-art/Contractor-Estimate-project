import { Redirect, useLocalSearchParams } from 'expo-router';

/** A job site is part of its job now: old links land on the job's "Job site" view. */
export default function SiteRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/job/${id}?tab=photos`} />;
}
