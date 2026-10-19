import { Pill } from '@/ui/pill';

import { useReconnectingIndicator } from '../use-connection-state';

/** "Reconnecting…", while live updates have been down for 3 seconds in the foreground (R13.4). */
export function ReconnectingPill() {
  const reconnecting = useReconnectingIndicator();
  return reconnecting ? <Pill label="Reconnecting…" /> : null;
}
