const memoryStore = new Map();

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
        }
    },
    getItem: (key) => {
        // Memory takes precedence
        if (memoryStore.has(key)) {
            return memoryStore.get(key);
        }
        
        // Fallback to sessionStorage
        if (typeof window !== 'undefined') {
            const val = sessionStorage.getItem(key);
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
        }
    },
    clear: () => {
        memoryStore.clear();
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
        }
    }
};
