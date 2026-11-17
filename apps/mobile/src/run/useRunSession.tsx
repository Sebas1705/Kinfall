// React side of the run session: one session per app, handed down by context and read with
// useSyncExternalStore so every screen re-renders on a new snapshot (and only then).
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import type { RunSession, RunSessionSnapshot } from './session';

const SessionContext = createContext<RunSession | null>(null);

export function RunSessionProvider({ session, children }: { session: RunSession; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useRunSession(): { session: RunSession; snapshot: RunSessionSnapshot } {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useRunSession needs a RunSessionProvider');
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, snapshot };
}
