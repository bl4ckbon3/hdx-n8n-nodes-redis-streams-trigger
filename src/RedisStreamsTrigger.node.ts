import {
    INodeType,
    INodeTypeDescription,
    ITriggerFunctions,
    ITriggerResponse,
    NodeApiError,
    NodeConnectionType
} from 'n8n-workflow';

import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export class RedisStreamsTrigger implements INodeType {
    description: INodeTypeDescription = {
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
        outputs: [NodeConnectionType.Main],
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

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
        const credentials = await this.getCredentials('redis');
        const stream = this.getNodeParameter('stream') as string;
        const consumerGroup = this.getNodeParameter('consumerGroup') as string;
        const consumerName = this.getNodeParameter('consumerName') as string;
        const count = this.getNodeParameter('count') as number;
        const readFrom = this.getNodeParameter('readFrom') as string;

        const client: RedisClient = createClient({
            url: `redis://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}`,
        });

        let keepRunning = true;

        client.on('error', (err) => {
            console.error('Redis Client Error', err);
            keepRunning = false;
        });

        await client.connect();

        try {
            await client.xGroupCreate(stream, consumerGroup, readFrom, { MKSTREAM: true });
            console.log(`Consumer group '${consumerGroup}' created or already exists.`);
        } catch (error: any) {
            if (error.message.includes('BUSYGROUP')) {
                console.log(`Consumer group '${consumerGroup}' already exists.`);
            } else {
                await client.quit();
                throw new NodeApiError(this.getNode(), error);
            }
        }

        const manualTrigger = async () => {
            while (keepRunning) {
                try {
                    const response = await client.xReadGroup(
                        consumerGroup,
                        consumerName,
                        { key: stream, id: '>' },
                        { COUNT: count, BLOCK: 5000 },
                    );

                    if (response && response.length > 0) {
                        const returnData = response[0].messages.map((msg) => ({
                            id: msg.id,
                            message: msg.message,
                        }));

                        this.emit([this.helpers.returnJsonArray(returnData)]);

                        const messageIds = returnData.map((msg) => msg.id);
                        await client.xAck(stream, consumerGroup, messageIds);
                    }
                } catch (error: any) {
                    if (!keepRunning) {
                        break;
                    }
                    console.error('Error reading from Redis Stream:', error);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            if (client.isOpen) {
                await client.quit();
            }
        };

        const close = async () => {
            console.log('Stopping Redis trigger and closing connection.');
            keepRunning = false;
            if (client.isOpen) {
                await client.disconnect();
            }
        };

        manualTrigger();

        return {
            closeFunction: close,
        };
    }
}
