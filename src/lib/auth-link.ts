// Browser-only input. Keep tokens in component memory, never persistent storage.
// A second effect initialization sees an already-scrubbed URL (React Strict Mode).
export function resolveAuthLinkToken(hash:string,legacyToken:string,currentToken:string) {
  if (!hash) return legacyToken||currentToken;
  if (hash.length>1024) return '';
  const values=new URLSearchParams(hash.replace(/^#/, '')).getAll('token');
  return values.length===1 ? values[0] : '';
}
