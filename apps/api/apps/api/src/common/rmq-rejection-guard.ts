import { Logger } from '@nestjs/common';

const logger = new Logger('RmqRejectionGuard');

/** True for the errors amqplib raises when the broker connection or channel drops under a pending publish. */
export function isBrokerConnectionLoss(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /channel closed|connection closed|heartbeat timeout|ECONNRESET|socket closed/i.test(
    message,
  );
}

/**
 * Nest's RMQ server publishes replies without awaiting the returned promise. When the broker disappears at that
 * moment the promise rejects with "channel closed" and nobody handles it, so Node terminates the whole service
 * (observed when RabbitMQ was killed or partitioned under load). The connection manager reconnects by itself, so
 * log those rejections and keep running; any other unhandled rejection still stops the process.
 */
export function installRmqRejectionGuard(): void {
  process.on('unhandledRejection', (reason) => {
    if (isBrokerConnectionLoss(reason)) {
      const message = reason instanceof Error ? reason.message : String(reason);
      logger.warn(`RabbitMQ connection lost, reply dropped: ${message}`);
      return;
    }
    logger.error(
      `Unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    );
    process.exit(1);
  });
}
