// Is the custom domain safe to deploy to? Asks the zone's own name servers, so that a name
// which does not exist yet is not remembered as missing by a caching resolver.
import { Resolver } from "node:dns/promises";

const ABSENT = new Set(["ENOTFOUND", "ENODATA"]);

async function records(domain) {
  const system = new Resolver({ timeout: 5000, tries: 2 });
  const labels = domain.split(".");
  let servers;
  for (let i = 1; i < labels.length - 1 && !servers; i++) {
    servers = await system.resolveNs(labels.slice(i).join(".")).catch((error) => {
      if (ABSENT.has(error.code)) return undefined;
      throw error;
    });
  }
  if (!servers) throw new Error("no name servers found for the domain's zone");
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
