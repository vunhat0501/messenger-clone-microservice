import { Logger } from '@nestjs/common';
import { Client } from 'pg';

export interface PostgresTopology {
  masterUrl: string;
  slaveUrls: string[];
  primaryDetected: boolean;
}

const logger = new Logger('PgTopologyResolver');

interface NodeState {
  /** false: read-write PRIMARY, true: read-only STANDBY. */
  isInRecovery: boolean;
  /** Timeline of the last checkpoint; a promotion starts a higher one. */
  timeline: number;
}

/**
 * Asks a PostgreSQL endpoint whether it is in recovery and which timeline it is on.
 * Returns null when the node is unreachable or the query fails.
 */
async function checkNode(connectionString: string): Promise<NodeState | null> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 2500,
    query_timeout: 2500,
  });

  try {
    await client.connect();
    const res = await client.query<{ is_in_recovery: boolean; timeline: number | null }>(
      'SELECT pg_is_in_recovery() AS is_in_recovery, (SELECT timeline_id FROM pg_control_checkpoint()) AS timeline;',
    );
    await client.end();
    const row = res.rows[0];
    if (!row) return null;
    return { isInRecovery: row.is_in_recovery, timeline: Number(row.timeline ?? 0) };
  } catch (err: any) {
    logger.warn(`Failed to connect or query node [${connectionString}]: ${err.message}`);
    try {
      await client.end();
    } catch {}
    return null;
  }
}

/**
 * Dynamically resolves the active master and slave nodes from candidate URLs.
 * If candidate nodes have been promoted/demoted, it identifies the live primary
 * (pg_is_in_recovery() = false) for writes, and assigns all remaining standby
 * nodes for reads. When an old primary comes back still read-write next to a
 * promoted one (split brain), the node on the highest timeline wins and the stale
 * one is left out entirely: its writes would be discarded when it is fenced.
 */
export async function resolvePostgresTopology(
  candidateUrls: (string | undefined)[],
): Promise<PostgresTopology> {
  const validUrls = Array.from(
    new Set(candidateUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)),
  );

  if (validUrls.length === 0) {
    throw new Error('No candidate PostgreSQL URLs provided to PgTopologyResolver');
  }

  let masterUrl: string | null = null;
  let primaryDetected = true;
  const slaveUrls: string[] = [];
  const primaries: { url: string; timeline: number }[] = [];

  const states = await Promise.all(validUrls.map((url) => checkNode(url)));
  validUrls.forEach((url, i) => {
    const state = states[i];
    if (!state) return;
    if (state.isInRecovery) {
      logger.log(`Active STANDBY detected: ${url}`);
      slaveUrls.push(url);
    } else {
      primaries.push({ url, timeline: state.timeline });
    }
  });

  if (primaries.length > 0) {
    // Stable sort: candidate order breaks ties.
    const winner = [...primaries].sort((a, b) => b.timeline - a.timeline)[0]!;
    masterUrl = winner.url;
    logger.log(`Active PRIMARY detected: ${winner.url} (timeline ${winner.timeline})`);
    for (const stale of primaries.filter((p) => p !== winner)) {
      logger.warn(
        `Multiple primaries detected! Ignoring ${stale.url} (timeline ${stale.timeline}) in favour of ${winner.url}`,
      );
    }
  }

  // Fallback if no node was currently detected as primary (e.g. during failover transition)
  if (!masterUrl) {
    primaryDetected = false;
    logger.warn(
      `No active PRIMARY found with pg_is_in_recovery() = false. Falling back to default URL: ${validUrls[0]}`,
    );
    masterUrl = validUrls[0];
  }

  return {
    masterUrl,
    slaveUrls,
    primaryDetected,
  };
}
