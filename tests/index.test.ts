import { createClient, RedisClientType } from 'redis';

describe('Redis', () => {
  let client: RedisClientType;

  beforeAll(() => {
    const host = process.env.REDIS_HOST;
    const db = process.env.REDIS_DB || '7';
    
    client = createClient({
      socket: {
        host: host,
        port: 6379,
      },
      database: parseInt(db),
    });
    client.connect();
  });

  afterAll(async () => {
    await client.quit();
  });

  test('Redis Connection', async () => {
    expect.assertions(1);
    console.log('Before set');
    await client.set('key', 'value');
    console.log('After set');
    const value = await client.get('key');
    console.log('After get');

    expect(value).toBe('value');
  });
});
