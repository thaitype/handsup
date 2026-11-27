// Is the custom domain safe to deploy to? Asks the zone's own name servers, so that a name
// which does not exist yet is not remembered as missing by a caching resolver.
import { Resolver } from "node:dns/promises";

const ABSENT = new Set(["ENOTFOUND", "ENODATA"]);

/**
 * The Cloudflare name servers of the zone holding `domain` (a custom domain needs one). The
 * name itself is asked about last, which is only reached when it is the zone apex.
 */
export async function zoneServers(domain, resolver) {
  const labels = domain.split(".");
  const starts = [...labels.keys()].slice(1, -1).concat(0);
  for (const start of starts) {
    const servers = await resolver.resolveNs(labels.slice(start).join(".")).catch((error) => {
      if (ABSENT.has(error.code)) return [];
      throw error;
    });
    if (servers.some((name) => /\.cloudflare\.com\.?$/i.test(name))) return servers;
  }
  throw new Error("no Cloudflare zone found for the domain");
}

async function records(domain) {
  const system = new Resolver({ timeout: 5000, tries: 2 });
  const servers = await zoneServers(domain, system);
  const authority = new Resolver({ timeout: 5000, tries: 2 });
  authority.setServers(await system.resolve4(servers[0]));
  const found = await Promise.all(
    ["resolve4", "resolve6", "resolveCname"].map((method) =>
      authority[method](domain).catch((error) => {
        if (ABSENT.has(error.code)) return [];
        throw error;
      }),
    ),
  );
  return found.flat();
}

async function isHandsup(domain) {
  try {
    const response = await fetch(`https://${domain}/api/version`, { signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    return response.ok && /^[0-9a-f]{40}$/.test(body.commit);
  } catch {
    return false;
  }
}

/** Why deploying to this domain could overwrite something, or null when it cannot. */
export async function domainBlocker(domain, look = { records, isHandsup }) {
  let found;
  try {
    found = await look.records(domain);
  } catch (error) {
    return `could not check the domain's DNS records (${error.code ?? error.message})`;
  }
  if (found.length === 0 || (await look.isHandsup(domain))) return null;
  return "the domain already has a DNS record and does not answer as handsup";
}
