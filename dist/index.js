"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodes = void 0;
const RedisStreamsTrigger_node_1 = require("./RedisStreamsTrigger.node");
const RedisStreams_node_1 = require("./RedisStreams.node");
// export * from './credentials/Redis.credentials';
exports.nodes = [
    RedisStreamsTrigger_node_1.RedisStreamsTrigger,
    RedisStreams_node_1.RedisStreams,
];
//# sourceMappingURL=index.js.map