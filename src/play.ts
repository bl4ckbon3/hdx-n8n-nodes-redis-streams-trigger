import { RedisConnectionHelper } from "./RedisStreamsTrigger.node";
console.log('Starting standalone test program');

const f = async () => {
    try {
        const redis_connection = new RedisConnectionHelper('manual', 'gisredis', 6379, 7, 'hdx_event_stream', 'default_group22', 'ts_consumer')
        await redis_connection.listenForEvents((messages) => {
            console.log('In handler');
            console.log('Message: ' + JSON.stringify(messages));
        });
    } catch (error: any) {
        console.log('Error ' + error.message);
    }
}
f();

console.log('END!');