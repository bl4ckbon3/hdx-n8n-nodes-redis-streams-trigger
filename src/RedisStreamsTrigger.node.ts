import {
  ITriggerFunctions,
  ITriggerResponse,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import {createClient, RedisClientType} from 'redis';

export class RedisStreamsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Redis Streams Trigger 3',
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
				description:
					'The name of the redis stream to listen to',
			},
      {
				displayName: 'Group name',
				name: 'groupName',
				type: 'string',
				default: '',
				required: true, 
				description:
					'The name of the redis stream consumer group to use',
			},
      {
				displayName: 'Consumer name',
				name: 'consumerName',
				type: 'string',
				default: '',
				required: true, 
				description:
					'This identifies the consumer inside the group',
			},
    ],
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

    const credentials = await this.getCredentials('redis');

		const	host = credentials.host as string;
		const	port = credentials.port as number;
		const db = credentials.database as number;

    let password = undefined;
		if (credentials.password) {
			password = credentials.password as string;
		}

    const streamName = this.getNodeParameter('streamName') as string;
    const groupName = this.getNodeParameter('groupName') as string;
    const consumerName = this.getNodeParameter('consumerName') as string;

    const redisHelper = new RedisConnectionHelper(this.getMode(), host, port, db, streamName, groupName, consumerName, password);
    

    console.log('Started my workflow in mode: ' + this.getMode());
    const emitMessage = (m: any) => {this.emit([this.helpers.returnJsonArray(m)])};
    const manualTriggerFunction = async () => {
      console.log('Started my trigger function in mode: ' + this.getMode());
      // await new Promise(resolve => {
      //   for (let i = 0; i < 3; i++) {
      //     setTimeout(() => {
      //       this.emit([this.helpers.returnJsonArray({ 'key': 'This is a test ! ' + new Date().toISOString() })])
      //     }, 3000);
      //     resolve(true);
      //   }
      // });
      await redisHelper.listenForEvents(emitMessage);

      // resolve(true);
      return;
    }
    if (this.getMode() === 'trigger') {
      manualTriggerFunction();
		}
    async function closeFunction() {
			redisHelper.closeClient();
		}
    return {closeFunction, manualTriggerFunction};
  }
}

interface MessageResponse {
  name: string;
  messages: {
      id: string;
      message: {
          [x: string]: string;
      };
  }[];
}

export class RedisConnectionHelper {

  mode: string;
  host: string;
  port: number;
  db: number;
  password?: string;
  streamName: string;
  groupName: string;
  consumerName: string;
  client: RedisClientType;
  connected: boolean;
  block = 30 * 1000; // ms to wait to read events from the stream
  constructor(mode:string, host: string, port: number, db: number, streamName: string, groupName: string, consumerName: string, password?: string) {
    this.host = host;
    this.port = port;
    this.db = db;
    if (this.password) {
      this.password = password;
    }
    this.streamName = streamName;
    this.groupName = groupName;
    this.consumerName = consumerName;
    this.client = createClient({
      socket: {
        host: this.host as string,
        port: this.port as number,
      },
      password: this.password as string,
      database: this.db as number,
    });
    this.client.on('error', (err) => console.log('Redis Client Error', err));
    this.connected = false;
    this.mode = mode;

  };

  async listenForEvents(handler: (messages: any) => void) {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    
    const readStream = async () => {
      
        while (this.client.isOpen) {
          console.log('Awaiting message');
          const messages = await this.client.xReadGroup(this.groupName, this.consumerName, {key: this.streamName, id: '>'}, {BLOCK: this.block});
          console.log('After message');
          if (messages) {
            const messageBodies = messages.map(streamMsg => streamMsg.messages).flat().map(m => m.message);
            handler(messageBodies);
          } else {
            console.log('Messages read from redis stream were null');
          }
          if (this.mode === 'manual') {
            await this.closeClient();
          }

        }
      
    };
    console.log('Awaiting read stream');
    await readStream();
    console.log('After read stream');
    // this.client.quit();
  }

  closeClient() {
    console.log('Closing client');
    return this.client.quit();
  }

}

