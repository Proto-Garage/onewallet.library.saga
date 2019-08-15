"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class SagaExecutionCoordinator {
    constructor(rabbit) {
        this.workers = [];
        this.sagas = new Map();
        this.rabbit = rabbit;
    }
    async registerSaga(saga) {
        const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async (params) => {
            console.log(params);
        });
        this.sagas.set(saga.name, saga);
        this.workers.push(worker);
    }
    async stop() {
        await Promise.all(this.workers.map(worker => worker.stop()));
    }
}
exports.default = SagaExecutionCoordinator;
//# sourceMappingURL=saga-execution-coordinator.js.map