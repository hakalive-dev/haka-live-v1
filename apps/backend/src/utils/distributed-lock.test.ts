import { redis } from '../config/redis';
import { withSchedulerLock } from './distributed-lock';

beforeEach(async () => {
  await redis.flushall();
});

describe('withSchedulerLock', () => {
  it('runs work when lock is free', async () => {
    let n = 0;
    const r = await withSchedulerLock('t1', 30, async () => {
      n++;
    });
    expect(r).toBe('completed');
    expect(n).toBe(1);
  });

  it('allows sequential runs after release', async () => {
    let n = 0;
    await withSchedulerLock('t2', 30, async () => {
      n++;
    });
    await withSchedulerLock('t2', 30, async () => {
      n++;
    });
    expect(n).toBe(2);
  });

  it('only one parallel execution for the same lock name', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = async () => {
      await withSchedulerLock('t3', 30, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 30));
        concurrent--;
      });
    };
    await Promise.all([run(), run(), run()]);
    expect(maxConcurrent).toBe(1);
  });
});
