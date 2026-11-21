import { lookup as dnsLookup, LookupAddress, LookupOptions } from 'node:dns';
import { isIP } from 'node:net';

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export function parseMongoHostMap(value: string): Map<string, string> {
  return new Map(
    value
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [name, address] = pair.split('=').map((part) => part.trim());
        return [name, address] as [string, string];
      }),
  );
}

export function createMongoHostLookup(hostMap: Map<string, string>) {
  return (
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ) => {
    const mapped = hostMap.get(hostname);
    if (!mapped) {
      dnsLookup(hostname, options, callback as never);
      return;
    }
    if (!isIP(mapped)) {
      dnsLookup(mapped, options, callback as never);
      return;
    }
    const family = isIP(mapped);
    if (options?.all) {
      callback(null, [{ address: mapped, family }]);
    } else {
      callback(null, mapped, family);
    }
  };
}
