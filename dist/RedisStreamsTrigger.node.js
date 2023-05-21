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
exports.RedisConnectionHelper = exports.RedisStreamsTrigger = void 0;
const redis_1 = require("redis");
class RedisStreamsTrigger {
    constructor() {
        this.description = {
            displayName: 'Redis Streams Trigger',
            name: 'redisStreamsTrigger',
            group: ['trigger'],
            version: 1,
            description: 'Triggers a workflow when a new message is added to a Redis stream',
            defaults: {
                name: 'Redis Streams Trigger',
                color: '#772244',
            },
            inputs: [],
            outputs: ['main'],
            credentials: [
                {
                    name: 'redis',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Stream name',
                    name: 'streamName',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'The name of the redis stream to listen to',
                },
                {
                    displayName: 'Group name',
                    name: 'groupName',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'The name of the redis stream consumer group to use',
                },
                {
                    displayName: 'Consumer name',
                    name: 'consumerName',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'This identifies the consumer inside the group',
                },
                {
                    displayName: 'Options',
                    name: 'options',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Batch',
                            name: 'batchSize',
                            type: 'number',
                            default: 0,
                            description: 'The maximum number of events to read from the redis stream at one time',
                        },
                    ],
                },
            ],
        };
    }
    trigger() {
        return __awaiter(this, void 0, void 0, function* () {
            const credentials = yield this.getCredentials('redis');
            const host = credentials.host;
            const port = credentials.port;
            const db = credentials.database;
            let password = undefined;
            if (credentials.password) {
                password = credentials.password;
            }
            const streamName = this.getNodeParameter('streamName');
            const groupName = this.getNodeParameter('groupName');
            const consumerName = this.getNodeParameter('consumerName');
            const options = this.getNodeParameter('options');
            const batchSize = options.batchSize;
            const redisHelper = new RedisConnectionHelper(this.getMode(), host, port, db, streamName, groupName, consumerName, password, batchSize);
            console.log('Started my workflow in mode: ' + this.getMode());
            const emitMessage = (m) => { this.emit([this.helpers.returnJsonArray(m)]); };
            const manualTriggerFunction = () => __awaiter(this, void 0, void 0, function* () {
                console.log('Started my trigger function in mode: ' + this.getMode());
                // await new Promise(resolve => {
                //   for (let i = 0; i < 3; i++) {
                //     setTimeout(() => {
                //       this.emit([this.helpers.returnJsonArray({ 'key': 'This is a test ! ' + new Date().toISOString() })])
                //     }, 3000);
                //     resolve(true);
                //   }
                // });
                yield redisHelper.listenForEvents(emitMessage);
                // resolve(true);
                return;
            });
            if (this.getMode() === 'trigger') {
                manualTriggerFunction();
            }
            function closeFunction() {
                return __awaiter(this, void 0, void 0, function* () {
                    redisHelper.closeClient();
                });
            }
            return { closeFunction, manualTriggerFunction };
        });
    }
}
exports.RedisStreamsTrigger = RedisStreamsTrigger;
class RedisConnectionHelper {
    constructor(mode, host, port, db, streamName, groupName, consumerName, password, batchSize) {
        this.block = 30 * 1000; // ms to wait to read events from the stream
        this.host = host;
        this.port = port;
        this.db = db;
        if (this.password) {
            this.password = password;
        }
        this.streamName = streamName;
        this.groupName = groupName;
        this.consumerName = consumerName;
        this.client = (0, redis_1.createClient)({
            socket: {
                host: this.host,
                port: this.port,
            },
            password: this.password,
            database: this.db,
        });
        this.client.on('error', (err) => console.log('Redis Client Error', err));
        this.mode = mode;
        this.connected = false;
        this.batchSize = batchSize;
    }
    ;
    listenForEvents(handler) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureConnection();
            yield this.createConsumerGroup();
            const readStream = () => __awaiter(this, void 0, void 0, function* () {
                const groupOptions = {
                    BLOCK: this.block,
                    COUNT: this.batchSize ? this.batchSize : undefined
                };
                while (this.client.isOpen) {
                    console.log('Awaiting message');
                    const messages = yield this.client.xReadGroup(this.groupName, this.consumerName, { key: this.streamName, id: '>' }, groupOptions);
                    console.log('After message');
                    if (messages) {
                        const messageBodies = messages.map(streamMsg => streamMsg.messages).flat().map(m => m.message);
                        handler(messageBodies);
                    }
                    else {
                        console.log('Messages read from redis stream were null');
                    }
                    if (this.mode === 'manual') {
                        yield this.closeClient();
                    }
                }
            });
            console.log('Awaiting read stream');
            yield readStream();
            console.log('After read stream');
            // this.client.quit();
        });
    }
    createConsumerGroup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureConnection();
            try {
                yield this.client.xGroupCreate(this.streamName, this.groupName, '0');
            }
            catch (error) {
                let msg = error.message;
                if (msg.includes('BUSYGROUP')) {
                    console.log(`The consumer group ${this.groupName} already exists so it couldn't be created.`);
                }
                else {
                    throw error;
                }
            }
        });
    }
    ensureConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.connected) {
                yield this.client.connect();
                this.connected = true;
            }
        });
    }
    pushEvent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureConnection();
            yield this.client.xAdd(this.streamName, '*', event);
        });
    }
    closeClient() {
        if (this.client.isOpen) {
            console.log('Closing client');
            return this.client.quit();
        }
    }
}
exports.RedisConnectionHelper = RedisConnectionHelper;
//# sourceMappingURL=RedisStreamsTrigger.node.js.map