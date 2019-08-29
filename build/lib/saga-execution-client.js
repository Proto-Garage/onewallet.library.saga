"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
class SagaExecutionClient {
    constructor(rabbit, saga) {
        this.clientPromise = null;
        this.rabbit = rabbit;
        this.saga = saga;
    }
    async initializeClient() {
        if (!this.clientPromise) {
            this.clientPromise = this.rabbit.createClient(`saga:${this.saga}`, {
                noResponse: true,
            });
        }
        return this.clientPromise;
    }
    async execute(...args) {
        const client = await this.initializeClient();
        const eid = uuid_1.v4();
        await client({
            eid,
            type: 'START_SAGA',
            saga: this.saga,
            args,
        });
    }
}
exports.default = SagaExecutionClient;
//# sourceMappingURL=saga-execution-client.js.map