import { createContext, useContext, useState, type ReactNode } from "react";

const OverlayHostContext = createContext<HTMLElement | null>(null);

export function ContentOverlayHost({ className, children }: { className?: string; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return <OverlayHostContext.Provider value={host}>
    {children}
    <div ref={setHost} className={className} />
  </OverlayHostContext.Provider>;
}

export function useContentOverlayHost() {
  return useContext(OverlayHostContext);
}

let leaveDiscard: (() => void) | null = null;

export function setLeaveDiscard(discard: (() => void) | null) {
  leaveDiscard = discard;
}

export function peekLeaveDiscard() {
  return leaveDiscard;
}
