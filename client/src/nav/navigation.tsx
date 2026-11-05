import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface NavigationValue {
  /** Current screen path, e.g. `/home`. */
  path: string;
  /** Navigate to a screen path (leading slash optional). */
  navigate: (to: string) => void;
}

const FALLBACK_PATH = '/home';

const NavigationContext = createContext<NavigationValue>({
  path: FALLBACK_PATH,
  navigate: () => undefined,
});

function normalize(to: string): string {
  const withoutHash = to.startsWith('#') ? to.slice(1) : to;
  if (!withoutHash || withoutHash === '/') return FALLBACK_PATH;
  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
}

function readHashPath(): string {
  if (typeof window === 'undefined') return FALLBACK_PATH;
  return normalize(window.location.hash);
}

/**
 * Hash router: no dependency, deep-linkable, and immune to server rewrite
 * rules (the invite-link flows in Phase 3 reuse the same mechanism).
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(readHashPath);

  useEffect(() => {
    const onHashChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = normalize(to);
    if (window.location.hash === `#${target}`) return;
    window.location.hash = target;
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  return useContext(NavigationContext);
}
