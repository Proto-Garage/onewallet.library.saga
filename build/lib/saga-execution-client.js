"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
class SagaExecutionClient {
    constructor(rabbit, saga) {
        this.client = null;
        this.rabbit = rabbit;
        this.saga = saga;
    }
    async execute(...args) {
        if (!this.client) {
            this.client = this.rabbit.createClient(this.saga, {
                noResponse: true,
            });
        }
        const client = await this.client;
        await client({
            type: 'START_SAGA',
            data: {
                eid: uuid_1.v4(),
                arguments: args,
            },
        });
    }
}
exports.default = SagaExecutionClient;
//# sourceMappingURL=saga-execution-client.js.map