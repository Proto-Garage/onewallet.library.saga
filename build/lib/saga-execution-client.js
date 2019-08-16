"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class SagaExecutionClient {
    constructor(rabbit, saga) {
        this.client = null;
        this.rabbit = rabbit;
        this.saga = saga;
    }
    async execute(...args) {
        if (!this.client) {
            this.client = this.rabbit.createClient(`saga:${this.saga}`);
        }
        const client = await this.client;
        await client({
            type: 'START_SAGA',
            data: {
                saga: this.saga,
                args,
            },
        });
    }
}
exports.default = SagaExecutionClient;
//# sourceMappingURL=saga-execution-client.js.map