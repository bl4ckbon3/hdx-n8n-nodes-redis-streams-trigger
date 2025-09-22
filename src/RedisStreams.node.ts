import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeApiError,
    NodeOperationError,
    NodeConnectionType,
} from 'n8n-workflow';

import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export class RedisStreams implements INodeType {
    description: INodeTypeDescription = {
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
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
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

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        const credentials = await this.getCredentials('redis');
        const client: RedisClient = createClient({
            url: `redis://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}`,
        });

        client.on('error', (err) => console.error('Redis Client Error', err));
        await client.connect();

        try {
            for (let i = 0; i < items.length; i++) {
                const operation = this.getNodeParameter('operation', i) as string;
                const streamKey = this.getNodeParameter('streamKey', i) as string;

                switch (operation) {
                    case 'xadd': {
                        const id = (this.getNodeParameter('id', i) as string) || '*';
                        const messageSource = this.getNodeParameter('messageSource', i) as 'allFields' | 'jsonField';

                        let payload: Record<string, string>;

                        if (messageSource === 'allFields') {
                            payload = Object.fromEntries(
                                Object.entries(items[i].json).map(([k, v]) => [String(k), String(v)]),
                            );
                        } else {
                            const jsonField = this.getNodeParameter('jsonField', i) as string;
                            const holder = (items[i].json as any)[jsonField];
                            if (holder == null || typeof holder !== 'object' || Array.isArray(holder)) {
                                throw new NodeOperationError(this.getNode(), `Field "${jsonField}" should be a JSON object.`, { itemIndex: i });
                            }
                            payload = Object.fromEntries(
                                Object.entries(holder).map(([k, v]) => [String(k), String(v)]),
                            );
                        }

                        if (Object.keys(payload).length === 0) {
                            throw new NodeOperationError(this.getNode(), 'Empty payload cannot be sent to Redis Stream.', { itemIndex: i });
                        }

                        const addedId = await client.xAdd(streamKey, id, payload);

                        const trimming = this.getNodeParameter('trimming', i) as boolean;
                        if (trimming) {
                            const retentionPeriod = this.getNodeParameter('retentionPeriod', i) as number;
                            const approximate = this.getNodeParameter('approximate', i) as boolean;

                            const now = new Date();

                            now.setDate(now.getDate() - retentionPeriod);

                            await client.xTrim(streamKey, 'MINID', now.getTime(), { strategyModifier: approximate ? '~' : '=' });
                        }

                        returnData.push({
                            json: { success: true, operation: 'xadd', stream: streamKey, id: addedId },
                            pairedItem: { item: i },
                        });
                        break;
                    }

                    default:
                        throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported.`, { itemIndex: i });
                }
            }
        } catch (error: any) {
            throw new NodeApiError(this.getNode(), error);
        } finally {
            if (client.isOpen) {
                await client.quit();
            }
        }

        return this.prepareOutputData(returnData);
    }
}
