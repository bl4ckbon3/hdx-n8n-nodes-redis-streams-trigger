import { RedisConnectionHelper } from "./RedisStreamsTrigger.node";
console.log('Starting standalone test program');

const f = async () => {
    try {
        const redis_connection = new RedisConnectionHelper('manual', 'redis', 6379, 7, 'stream_name', 'group_name', 'consumer_name')
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