import { Logger } from '@nestjs/common';
import { Client } from 'pg';

export interface PostgresTopology {
  masterUrl: string;
  slaveUrls: string[];
}

const logger = new Logger('PgTopologyResolver');

/**
 * Checks whether a PostgreSQL connection endpoint is in recovery (standby).
 * Returns:
 *   - false: Node is an active read-write PRIMARY
 *   - true: Node is a read-only STANDBY
 *   - null: Node is unreachable or error occurred
 */
async function checkNodeRecovery(connectionString: string): Promise<boolean | null> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 2500,
  });

  try {
    await client.connect();
    const res = await client.query<{ is_in_recovery: boolean }>(
      'SELECT pg_is_in_recovery() AS is_in_recovery;',
    );
    await client.end();
    return res.rows[0]?.is_in_recovery ?? null;
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
 * nodes for reads.
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
  const slaveUrls: string[] = [];

  for (const url of validUrls) {
    const isRecovery = await checkNodeRecovery(url);
    if (isRecovery === false) {
      if (!masterUrl) {
        masterUrl = url;
        logger.log(`Active PRIMARY detected: ${url}`);
      } else {
        logger.warn(`Multiple primaries detected! Keeping ${masterUrl}, adding ${url} as slave`);
        slaveUrls.push(url);
      }
    } else if (isRecovery === true) {
      logger.log(`Active STANDBY detected: ${url}`);
      slaveUrls.push(url);
    }
  }

  // Fallback if no node was currently detected as primary (e.g. during failover transition)
  if (!masterUrl) {
    logger.warn(
      `No active PRIMARY found with pg_is_in_recovery() = false. Falling back to default URL: ${validUrls[0]}`,
    );
    masterUrl = validUrls[0];
  }

  return {
    masterUrl,
    slaveUrls,
  };
}
