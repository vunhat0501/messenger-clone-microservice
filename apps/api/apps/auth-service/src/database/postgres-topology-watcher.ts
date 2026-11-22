import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { env } from 'apps/api/src/config/env.config';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { resolvePostgresTopology } from './pg-topology.resolver';

export const TOPOLOGY_POLL_MS = 5_000;

@Injectable()
export class PostgresTopologyWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresTopologyWatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.check(), TOPOLOGY_POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async check(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const options = this.dataSource.options as PostgresConnectionOptions;
      if (!options.replication) return false;

      const candidates = [
        env.DATABASE_URL,
        env.DATABASE_REPLICA_URL,
        env.DATABASE_REPLICA_2_URL,
      ];
      const topology = await resolvePostgresTopology(candidates);
      const currentMaster = options.replication.master.url;
      if (!topology.primaryDetected || topology.masterUrl === currentMaster) {
        return false;
      }

      this.logger.warn(
        `Primary changed from ${currentMaster} to ${topology.masterUrl}; reconnecting`,
      );
      // The driver reads these options again when the data source is initialised.
      const replication = options.replication as {
        master: { url: string };
        slaves: { url: string }[];
      };
      replication.master = { url: topology.masterUrl };
      replication.slaves = topology.slaveUrls.map((url) => ({ url }));
      if (this.dataSource.isInitialized) await this.dataSource.destroy();
      await this.dataSource.initialize();
      this.logger.log(`Reconnected to the new primary ${topology.masterUrl}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Primary re-resolution failed: ${err.message}`);
      return false;
    } finally {
      this.running = false;
    }
  }
}
