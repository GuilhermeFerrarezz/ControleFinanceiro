// Node preload used ONLY by the isolated HTTP test process. Production code
// keeps the fixed Resend endpoint and has no test transport switch.
if (!process.env.TEST_RESEND_ORIGIN) throw new Error('Mock de transporte requer um servidor local de teste.');
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  return originalFetch(url==='https://api.resend.com/emails'?new URL('/emails',process.env.TEST_RESEND_ORIGIN):input,init);
};
