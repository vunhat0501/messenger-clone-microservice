import { Client } from 'pg';
import { resolvePostgresTopology } from './pg-topology.resolver';

jest.mock('pg', () => ({ Client: jest.fn() }));

const A = 'postgresql://u@localhost:5432/db';
const B = 'postgresql://u@localhost:5433/db';
const C = 'postgresql://u@localhost:5434/db';

/** Each URL answers with the given state, or fails to connect when null. */
function nodes(
  states: Record<string, { recovery: boolean; timeline: number } | null>,
) {
  (Client as unknown as jest.Mock).mockImplementation(
    ({ connectionString }) => {
      const state = states[connectionString];
      return {
        connect: jest.fn(() =>
          state ? Promise.resolve() : Promise.reject(new Error('ECONNREFUSED')),
        ),
        query: jest.fn(() =>
          Promise.resolve({
            rows: [
              { is_in_recovery: state!.recovery, timeline: state!.timeline },
            ],
          }),
        ),
        end: jest.fn(() => Promise.resolve()),
      };
    },
  );
}

describe('resolvePostgresTopology', () => {
  it('uses the only primary and reads from the standbys', async () => {
    nodes({
      [A]: { recovery: true, timeline: 3 },
      [B]: { recovery: false, timeline: 3 },
      [C]: { recovery: true, timeline: 3 },
    });

    await expect(resolvePostgresTopology([A, B, C])).resolves.toEqual({
      masterUrl: B,
      slaveUrls: [A, C],
      primaryDetected: true,
    });
  });

  it('prefers the newer timeline when an old primary comes back read-write', async () => {
    // A was isolated, B was promoted meanwhile: A must neither take writes nor serve reads.
    nodes({
      [A]: { recovery: false, timeline: 5 },
      [B]: { recovery: false, timeline: 6 },
      [C]: { recovery: true, timeline: 6 },
    });

    await expect(resolvePostgresTopology([A, B, C])).resolves.toEqual({
      masterUrl: B,
      slaveUrls: [C],
      primaryDetected: true,
    });
  });

  it('falls back to the first URL when no primary answers', async () => {
    nodes({ [A]: null, [B]: { recovery: true, timeline: 2 }, [C]: null });

    await expect(resolvePostgresTopology([A, B, C])).resolves.toEqual({
      masterUrl: A,
      slaveUrls: [B],
      primaryDetected: false,
    });
  });
});
