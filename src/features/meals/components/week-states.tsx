import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';

import { COPY } from '../constants';

// What Meals shows in place of the week when it has no week to draw (§3.4).

/** Loading failed with nothing loaded yet (R30.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState testID="meals-load-error" symbol="exclamationmark.triangle" title={COPY.loadError}>
      <Button label="Retry" onPress={onRetry} />
    </EmptyState>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <EmptyState
      testID="meals-waiting-for-connection"
      symbol="wifi.slash"
      title="Waiting for connection…"
    />
  );
}
