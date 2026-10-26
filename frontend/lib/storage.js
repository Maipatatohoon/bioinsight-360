const memoryStore = new Map();

// Small identifiers that must survive a page refresh *and* a new tab. Large
// analysis payloads stay in memory/sessionStorage to avoid quota problems.
const PERSISTENT_KEYS = new Set([
    'currentJobId',
    'analysisMode',
    'downstreamSource',
    'activeControlGroup',
    'activeTreatedGroup',
    'consensusFcThreshold',
    'consensusPvalThreshold',
    'consensusPvalMetric',
    'cpmThreshold',
]);

export const Storage = {
    setItem: (key, value) => {
        // Always store in memory for unlimited size (works across Next.js Link navigations)
        memoryStore.set(key, value);
        
        // Try to persist to sessionStorage to survive F5 reloads, but catch quota errors silently
        if (typeof window !== 'undefined') {
          try {
              sessionStorage.setItem(key, value);
          } catch (e) {
              console.warn(`Storage quota exceeded for ${key}. Data stored in memory only. A page refresh will clear this data.`);
          }
          if (PERSISTENT_KEYS.has(key)) {
              try {
                  localStorage.setItem(key, value);
              } catch (e) {
                  // Private-mode / disabled storage: sessionStorage is still enough for a refresh.
              }
          }
        }
    },
    getItem: (key) => {
        // Memory takes precedence
        if (memoryStore.has(key)) {
            return memoryStore.get(key);
        }
        
        // Fallback to sessionStorage, then localStorage for durable identifiers
        if (typeof window !== 'undefined') {
            let val = sessionStorage.getItem(key);
            if (val === null && PERSISTENT_KEYS.has(key)) {
                val = localStorage.getItem(key);
            }
            if (val !== null) {
                memoryStore.set(key, val);
            }
            return val;
        }
        return null;
    },
    removeItem: (key) => {
        memoryStore.delete(key);
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(key);
            if (PERSISTENT_KEYS.has(key)) {
                localStorage.removeItem(key);
            }
        }
    },
    clear: () => {
        memoryStore.clear();
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
        }
    }
};
