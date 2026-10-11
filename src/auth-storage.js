// Session tokens live only in memory. Only the one-use PKCE verifier survives redirect.
export function authStorage(sessionStorage, now=()=>Date.now()) {
  const memory = new Map();
  return {
    getItem(key) {
      if (!key.endsWith('-code-verifier')) return memory.get(key) ?? null;
      const raw=sessionStorage.getItem(key); if (!raw) return null;
      try { const entry=JSON.parse(raw); if (typeof entry.value==='string' && entry.expires>now()) return entry.value; } catch { /* invalid nonce is discarded */ }
      sessionStorage.removeItem(key); return null;
    },
    setItem(key,value) {
      if (key.endsWith('-code-verifier')) sessionStorage.setItem(key,JSON.stringify({value,expires:now()+10*60*1000}));
      else memory.set(key,value);
    },
    removeItem(key) { memory.delete(key); if (key.endsWith('-code-verifier')) sessionStorage.removeItem(key); },
    clear() { memory.clear(); }
  };
}
