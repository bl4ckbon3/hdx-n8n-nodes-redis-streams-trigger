"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStreamsTrigger = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const redis_1 = require("redis");
class RedisStreamsTrigger {
    constructor() {
        this.description = {
            displayName: 'Redis Streams Trigger',
            name: 'redisStreamsTrigger',
            icon: 'file:redis.svg',
            group: ['trigger'],
            version: 1,
            description: 'Triggers a workflow when a new message arrives on a Redis Stream.',
            defaults: {
                name: 'Redis Streams Trigger',
            },
            inputs: [],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                {
                    name: 'redis',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Stream',
                    name: 'stream',
                    type: 'string',
                    required: true,
                    default: '',
                    description: 'The name of the stream to listen to.',
                },
                {
                    displayName: 'Consumer Group',
                    name: 'consumerGroup',
                    type: 'string',
                    required: true,
                    default: 'n8n-group',
                    description: 'The name of the consumer group. It will be created if it does not exist.',
                },
                {
                    displayName: 'Consumer Name',
                    name: 'consumerName',
                    type: 'string',
                    required: true,
                    default: 'n8n-consumer',
                    description: 'A unique name for this consumer within the group.',
                },
                {
                    displayName: 'Read From',
                    name: 'readFrom',
                    type: 'options',
                    required: true,
                    default: '$',
                    description: 'Option when should redis stream read the message.',
                    options: [
                        {
                            name: 'Beginning',
                            value: '0',
                        },
                        {
                            name: 'Consumer Group Created',
                            value: '$',
                        },
                    ],
                },
                {
                    displayName: 'Count',
                    name: 'count',
                    type: 'number',
                    default: 1,
                    description: 'The maximum number of messages to fetch per batch.',
                },
            ],
        };
    }
    trigger() {
        return __awaiter(this, void 0, void 0, function* () {
            const credentials = yield this.getCredentials('redis');
            const stream = this.getNodeParameter('stream');
            const consumerGroup = this.getNodeParameter('consumerGroup');
            const consumerName = this.getNodeParameter('consumerName');
            const count = this.getNodeParameter('count');
            const readFrom = this.getNodeParameter('readFrom');
            const client = (0, redis_1.createClient)({
                url: `redis://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}`,
            });
            let keepRunning = true;
            client.on('error', (err) => {
                console.error('Redis Client Error', err);
                keepRunning = false;
            });
            yield client.connect();
            try {
                yield client.xGroupCreate(stream, consumerGroup, readFrom, { MKSTREAM: true });
                console.log(`Consumer group '${consumerGroup}' created or already exists.`);
            }
            catch (error) {
                if (error.message.includes('BUSYGROUP')) {
                    console.log(`Consumer group '${consumerGroup}' already exists.`);
                }
                else {
                    yield client.quit();
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
                }
            }
            const manualTrigger = () => __awaiter(this, void 0, void 0, function* () {
                while (keepRunning) {
                    try {
                        const response = yield client.xReadGroup(consumerGroup, consumerName, { key: stream, id: '>' }, { COUNT: count, BLOCK: 5000 });
                        if (response && response.length > 0) {
                            const returnData = response[0].messages.map((msg) => ({
                                id: msg.id,
                                message: msg.message,
                            }));
                            this.emit([this.helpers.returnJsonArray(returnData)]);
                            const messageIds = returnData.map((msg) => msg.id);
                            yield client.xAck(stream, consumerGroup, messageIds);
                        }
                    }
                    catch (error) {
                        if (!keepRunning) {
                            break;
                        }
                        console.error('Error reading from Redis Stream:', error);
                        yield new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
                if (client.isOpen) {
                    yield client.quit();
                }
            });
            const close = () => __awaiter(this, void 0, void 0, function* () {
                console.log('Stopping Redis trigger and closing connection.');
                keepRunning = false;
                if (client.isOpen) {
                    yield client.disconnect();
                }
            });
            manualTrigger();
            return {
                closeFunction: close,
            };
        });
    }
}
exports.RedisStreamsTrigger = RedisStreamsTrigger;
//# sourceMappingURL=RedisStreamsTrigger.node.js.map