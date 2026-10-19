import { Redirect } from 'expo-router';

// The app opens at `/`, which lands on Groceries (R1.4). It sits inside (app) so that the root
// guards (§3.3) cover it too.
export default function Index() {
  return <Redirect href="/groceries" />;
}
