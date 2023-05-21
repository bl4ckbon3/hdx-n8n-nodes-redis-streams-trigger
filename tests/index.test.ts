import { RedisConnectionHelper } from '../src/RedisStreamsTrigger.node';

describe('Redis', () => {
  let host: string;
  let db: string;
  let helper: RedisConnectionHelper;

  beforeAll(() => {
    host = process.env.REDIS_HOST || 'gisredis';
    db = process.env.REDIS_DB || '7';

    console.log(`Redis host is ${host}`);
    
    // client = createClient({
    //   socket: {
    //     host: host,
    //     port: 6379,
    //   },
    //   database: parseInt(db),
    // });
    // client.connect();
  });

  afterEach(async () => {
    await helper.closeClient();
  });

  test('Redis Connection', async () => {
    expect.assertions(1);
    helper = new RedisConnectionHelper('manual', host, 6379, 7, 'some_test_stream', 'some_consumer_group', 'some_consumer');
    helper.ensureConnection();
    const client = helper.client;
    console.log('Before set');
    await client.set('key', 'value');
    console.log('After set');
    const value = await client.get('key');
    console.log('After get');
    expect(value).toBe('value');

  });

  test('Redis Streams', async () => {
    expect.assertions(2);
    helper = new RedisConnectionHelper('manual', host, 6379, 7, 'some_test_stream', 'some_consumer_group', 'some_consumer');
    await helper.pushEvent({ 'field1': 'value1', 'field2': 'value2' });
    console.log('After pushed event');

    let value1: string = 'some value';
    let value2: string = 'some value';
    try {
      await helper.listenForEvents((messages) => {
        const message = messages[0];
        value1 = message.field1;
        value2 = message.field2;
      });
    } catch (error: any) {
      console.log('Error ' + error.message);
    }

    expect(value1).toBe('value1');
    expect(value2).toBe('value2');
  });

  test('Read events in batches', async () => {
    expect.assertions(2);

    const BATCH_SIZE = 8;
    const EVENTS_NUM = 10;
    expect.assertions(2);
    helper = new RedisConnectionHelper('trigger', host, 6379, 7, 'some_test_stream', 'some_consumer_group', 'some_consumer', undefined, BATCH_SIZE);
    for (let i=0; i<EVENTS_NUM; i++) {
      await helper.pushEvent({ 'field1': 'value1_' + i, 'field2': 'value2_' + i });
    }
    console.log('After pushing all events');

    let value1: string = 'some value';
    let value2: string = 'some value';

    let counter = 0;

    try {
      await helper.listenForEvents((messages) => {
        counter++;
        if (counter === 1) {
          expect(messages.length).toBe(BATCH_SIZE);
        }
        else if (counter === 2) {
          expect(messages.length).toBe(BATCH_SIZE);
        }
        else {
          throw new Error('The callback function should only be called twice');
        }
      });
    } catch (error: any) {
      console.log('Error ' + error.message);
    }

  });
});
