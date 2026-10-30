import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';

// Allow only private IPv4 addresses actually assigned to this computer.
// Do not allow every host on the network or arbitrary external origins.
export function localDevelopmentOrigins(interfaces = networkInterfaces()) {
  const addresses = Object.values(interfaces).flatMap(entries => entries || []);
  return [...new Set(addresses.filter(entry => {
    if (entry.internal || entry.family !== 'IPv4' || isIP(entry.address) !== 4) return false;
    const [first, second] = entry.address.split('.').map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }).map(entry => entry.address))].sort();
}
