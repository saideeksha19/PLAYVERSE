import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface Preferences {
  reduceMotion: boolean;
  highContrast: boolean;
}

export const PREFERENCES_KEY = 'playverse.preferences';

const DEFAULTS: Preferences = { reduceMotion: false, highContrast: false };

function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      reduceMotion: Boolean(parsed.reduceMotion),
      highContrast: Boolean(parsed.highContrast),
    };
  } catch {
    return DEFAULTS;
  }
}

function applyPreferences(preferences: Preferences): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
  document.documentElement.dataset.highContrast = String(preferences.highContrast);
}

export interface PreferencesValue extends Preferences {
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Local-only display preferences; no account or server round-trip needed. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

  useEffect(() => {
    applyPreferences(preferences);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Storage may be unavailable in private mode; the session still works.
    }
  }, [preferences]);

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const resetPreferences = useCallback(() => setPreferences(DEFAULTS), []);

  const value = useMemo<PreferencesValue>(
    () => ({ ...preferences, setPreference, resetPreferences }),
    [preferences, setPreference, resetPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}
