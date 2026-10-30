import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedOrigin } from '../src/lib/request-origin';

const request = (origin: string, host = '192.168.1.50:3000', extra: Record<string, string> = {}) => new Request('http://localhost:3000/api/v1/auth/register', {
  method: 'POST', headers: { Origin: origin, Host: host, ...extra },
});

test('aceita a origem do IP da rede mesmo com URL interna localhost', () => {
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000'), ''), true);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000', '192.168.1.50:3000', { 'Sec-Fetch-Site': 'same-origin' }), ''), true);
  assert.equal(trustedOrigin(request('http://[::1]:3000', '[::1]:3000'), ''), true);
});
test('mantém o bloqueio de outras origens e headers encaminhados falsificados', () => {
  assert.equal(trustedOrigin(request('https://hostil.invalid'), ''), false);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3001'), ''), false);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000', '192.168.1.50:3000', { 'Sec-Fetch-Site': 'cross-site' }), ''), false);
  assert.equal(trustedOrigin(request('https://hostil.invalid', '192.168.1.50:3000', { 'X-Forwarded-Host': 'hostil.invalid' }), ''), false);
  assert.equal(trustedOrigin(request('null'), ''), false);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000', 'hostil.invalid@192.168.1.50:3000'), ''), false);
});
test('a origem pública configurada permanece restrita, inclusive atrás de proxy', () => {
  assert.equal(trustedOrigin(request('https://financeiro.example.com'), 'https://financeiro.example.com'), true);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000'), 'https://financeiro.example.com'), false);
  assert.equal(trustedOrigin(request('http://192.168.1.50:3000'), 'origem-invalida'), false);
});
