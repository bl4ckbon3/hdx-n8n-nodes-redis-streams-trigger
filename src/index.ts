import { RedisStreamsTrigger } from './RedisStreamsTrigger.node';
import { RedisStreams } from './RedisStreams.node';

// export * from './credentials/Redis.credentials';

export const nodes = [
    RedisStreamsTrigger,
    RedisStreams,
];
