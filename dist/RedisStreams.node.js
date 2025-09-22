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
exports.RedisStreams = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const redis_1 = require("redis");
class RedisStreams {
    constructor() {
        this.description = {
            displayName: 'Redis Streams',
            name: 'redisStreams',
            icon: 'file:redis.svg',
            group: ['input'],
            version: 1,
            description: 'Interact with Redis Streams.',
            subtitle: '={{$parameter["operation"]}}',
            defaults: {
                name: 'Redis Streams',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                {
                    name: 'redis',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'XAdd - Add Message',
                            value: 'xadd',
                            description: 'Adds a new message to a stream',
                            action: 'Add a message to a stream',
                        }
                    ],
                    default: 'xadd',
                },
                {
                    displayName: 'Stream',
                    name: 'streamKey',
                    type: 'string',
                    required: true,
                    default: '',
                    description: 'The name of the stream to publish to.',
                },
                {
                    displayName: 'Message Source',
                    name: 'messageSource',
                    type: 'options',
                    displayOptions: {
                        show: {
                            operation: ['xadd']
                        },
                    },
                    options: [
                        {
                            name: 'All Item Fields',
                            value: 'allFields',
                            description: 'Use all fields from the item as key-values for XADD.',
                        },
                        {
                            name: 'From JSON Field',
                            value: 'jsonField',
                            description: 'Get a JSON object from a specific field on an item.',
                        },
                    ],
                    default: 'allFields',
                    description: 'Data source to form key-values sent to the stream.',
                },
                {
                    displayName: 'JSON Field',
                    name: 'jsonField',
                    type: 'string',
                    default: 'message',
                    displayOptions: {
                        show: {
                            operation: ['xadd'],
                            messageSource: ['jsonField'],
                        },
                    },
                    description: 'The name of the field on the item that contains the JSON object to send.',
                },
                {
                    displayName: 'ID',
                    name: 'id',
                    type: 'string',
                    default: '*',
                    description: 'Message ID. Use "*" to have Redis auto-fill the timestamp.',
                    displayOptions: {
                        show: {
                            operation: ['xadd']
                        },
                    },
                },
                {
                    displayName: 'Trimming',
                    name: 'trimming',
                    type: 'boolean',
                    default: false,
                    description: 'Trim the stream after retention period.',
                    displayOptions: {
                        show: {
                            operation: ['xadd']
                        },
                    },
                },
                {
                    displayName: 'Retention Period',
                    name: 'retentionPeriod',
                    type: 'number',
                    typeOptions: { minValue: 1 },
                    default: 7,
                    displayOptions: {
                        show: {
                            operation: ['xadd'],
                            trimming: [true],
                        },
                    },
                    description: 'Set the retention period in days',
                },
                {
                    displayName: 'Approximate Trimming (~)',
                    name: 'approximate',
                    type: 'boolean',
                    default: true,
                    displayOptions: {
                        show: {
                            operation: ['xadd'],
                            trimming: [true],
                        },
                    },
                    description: 'Use the "~" approximate trimming strategy to make it faster.',
                },
            ],
        };
    }
    execute() {
        return __awaiter(this, void 0, void 0, function* () {
            const items = this.getInputData();
            const returnData = [];
            const credentials = yield this.getCredentials('redis');
            const client = (0, redis_1.createClient)({
                url: `redis://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}`,
            });
            client.on('error', (err) => console.error('Redis Client Error', err));
            yield client.connect();
            try {
                for (let i = 0; i < items.length; i++) {
                    const operation = this.getNodeParameter('operation', i);
                    const streamKey = this.getNodeParameter('streamKey', i);
                    switch (operation) {
                        case 'xadd': {
                            const id = this.getNodeParameter('id', i) || '*';
                            const messageSource = this.getNodeParameter('messageSource', i);
                            let payload;
                            if (messageSource === 'allFields') {
                                payload = Object.fromEntries(Object.entries(items[i].json).map(([k, v]) => [String(k), String(v)]));
                            }
                            else {
                                const jsonField = this.getNodeParameter('jsonField', i);
                                const holder = items[i].json[jsonField];
                                if (holder == null || typeof holder !== 'object' || Array.isArray(holder)) {
                                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Field "${jsonField}" should be a JSON object.`, { itemIndex: i });
                                }
                                payload = Object.fromEntries(Object.entries(holder).map(([k, v]) => [String(k), String(v)]));
                            }
                            if (Object.keys(payload).length === 0) {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Empty payload cannot be sent to Redis Stream.', { itemIndex: i });
                            }
                            const addedId = yield client.xAdd(streamKey, id, payload);
                            const trimming = this.getNodeParameter('trimming', i);
                            if (trimming) {
                                const retentionPeriod = this.getNodeParameter('retentionPeriod', i);
                                const approximate = this.getNodeParameter('approximate', i);
                                const now = new Date();
                                now.setDate(now.getDate() - retentionPeriod);
                                yield client.xTrim(streamKey, 'MINID', now.getTime(), { strategyModifier: approximate ? '~' : '=' });
                            }
                            returnData.push({
                                json: { success: true, operation: 'xadd', stream: streamKey, id: addedId },
                                pairedItem: { item: i },
                            });
                            break;
                        }
                        default:
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `The operation "${operation}" is not supported.`, { itemIndex: i });
                    }
                }
            }
            catch (error) {
                throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
            }
            finally {
                if (client.isOpen) {
                    yield client.quit();
                }
            }
            return this.prepareOutputData(returnData);
        });
    }
}
exports.RedisStreams = RedisStreams;
//# sourceMappingURL=RedisStreams.node.js.map