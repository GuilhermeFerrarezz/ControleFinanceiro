import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NetworkInterfaceInfo } from 'node:os';
import { localDevelopmentOrigins } from '../src/lib/dev-origins';

const address = (value: string, internal = false): NetworkInterfaceInfo => {
  const common = { address: value, internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null };
  return value.includes(':') ? { ...common, family: 'IPv6', scopeid: 0 } : { ...common, family: 'IPv4' };
};
test('permite HMR apenas nos IPs privados presentes nas interfaces locais', () => {
  assert.deepEqual(localDevelopmentOrigins({
    wifi: [address('192.168.100.216'), address('10.0.0.4'), address('172.16.0.2')],
    other: [address('192.168.100.216'), address('172.31.255.1')],
    ignored: [address('127.0.0.1', true), address('8.8.8.8'), address('172.32.0.1'), address('::1', true), address('192.168.300.1')],
  }), ['10.0.0.4', '172.16.0.2', '172.31.255.1', '192.168.100.216']);
  assert.deepEqual(localDevelopmentOrigins({}), []);
});
