import { Logger } from '@nestjs/common';
import mongoose from 'mongoose';

export interface MongoTopology {
  primaryUri: string;
  secondaryUris: string[];
}

const logger = new Logger('MongoTopologyResolver');

/**
 * Checks whether a MongoDB endpoint is reachable and whether it is currently a writable primary.
 * Returns:
 *   - 'primary': Node is active writable primary
 *   - 'secondary': Node is secondary
 *   - null: Node is unreachable or error occurred
 */
async function checkMongoNode(uri: string): Promise<'primary' | 'secondary' | null> {
  const conn = mongoose.createConnection();
  try {
    await conn.openUri(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
      directConnection: true,
    });

    if (!conn.db) {
      await conn.close();
      return null;
    }

    const adminDb = conn.db.admin();
    const isMasterResult = await adminDb.command({ isMaster: 1 });
    await conn.close();

    if (isMasterResult.ismaster || isMasterResult.isWritablePrimary) {
      return 'primary';
    }
    return 'secondary';
  } catch (err: any) {
    logger.warn(`Failed to connect or query MongoDB node [${uri}]: ${err.message}`);
    try {
      await conn.close();
    } catch {}
    return null;
  }
}

/**
 * Dynamically resolves the active writable Primary MongoDB endpoint from candidate URIs.
 * If candidate nodes have been promoted/demoted, it identifies the live primary
 * for writes and connections.
 */
export async function resolveMongoTopology(
  candidateUris: (string | undefined)[],
): Promise<MongoTopology> {
  const validUris = Array.from(
    new Set(candidateUris.filter((u): u is string => typeof u === 'string' && u.length > 0)),
  );

  if (validUris.length === 0) {
    throw new Error('No candidate MongoDB URIs provided to MongoTopologyResolver');
  }

  let primaryUri: string | null = null;
  const secondaryUris: string[] = [];

  for (const uri of validUris) {
    const status = await checkMongoNode(uri);
    if (status === 'primary') {
      if (!primaryUri) {
        primaryUri = uri;
        logger.log(`Active MongoDB PRIMARY detected: ${uri}`);
      } else {
        logger.warn(
          `Multiple MongoDB primaries detected! Keeping ${primaryUri}, adding ${uri} as secondary`,
        );
        secondaryUris.push(uri);
      }
    } else if (status === 'secondary') {
      logger.log(`Active MongoDB SECONDARY detected: ${uri}`);
      secondaryUris.push(uri);
    }
  }

  if (!primaryUri) {
    logger.warn(
      `No active MongoDB PRIMARY found. Falling back to default URI: ${validUris[0]}`,
    );
    primaryUri = validUris[0];
  }

  return {
    primaryUri,
    secondaryUris,
  };
}
