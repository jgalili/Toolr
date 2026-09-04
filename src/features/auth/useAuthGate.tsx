import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { AuthSheet, type AuthReason } from './AuthSheet';
import { useSession } from './session';

type GateApi = {
  /**
   * Run `action` if the person is a member. If they are a guest, open the auth
   * sheet — and run `action` automatically once they are in, so they land back
   * on exactly the thing they were trying to do.
   */
  requireMember(reason: AuthReason, action: () => void): void;
};

const GateContext = createContext<GateApi | null>(null);

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<AuthReason>({ kind: 'default' });
  const pending = useRef<(() => void) | null>(null);

  const requireMember = useCallback(
    (nextReason: AuthReason, action: () => void) => {
      if (session.isMember) {
        action();
        return;
      }
      pending.current = action;
      setReason(nextReason);
      setVisible(true);
    },
    [session.isMember],
  );

  const value = useMemo<GateApi>(() => ({ requireMember }), [requireMember]);

  return (
    <GateContext.Provider value={value}>
      {children}
      <AuthSheet
        visible={visible}
        reason={reason}
        onClose={() => {
          pending.current = null;
          setVisible(false);
        }}
        onSignedIn={() => {
          const action = pending.current;
          pending.current = null;
          setVisible(false);
          action?.();
        }}
      />
    </GateContext.Provider>
  );
}

export function useAuthGate(): GateApi {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error('useAuthGate must be used inside <AuthGateProvider>');
  return ctx;
}
