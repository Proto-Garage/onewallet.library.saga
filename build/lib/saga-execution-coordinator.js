"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ramda_1 = __importDefault(require("ramda"));
const uuid_1 = require("uuid");
const calculate_backoff_delay_1 = __importDefault(require("./calculate-backoff-delay"));
const defer_1 = __importDefault(require("./defer"));
const saga_log_store_1 = require("./saga-log-store");
var SagaExecutionCoordinatorStatus;
(function (SagaExecutionCoordinatorStatus) {
    SagaExecutionCoordinatorStatus[SagaExecutionCoordinatorStatus["Running"] = 0] = "Running";
    SagaExecutionCoordinatorStatus[SagaExecutionCoordinatorStatus["Stopping"] = 1] = "Stopping";
    SagaExecutionCoordinatorStatus[SagaExecutionCoordinatorStatus["Stopped"] = 2] = "Stopped";
})(SagaExecutionCoordinatorStatus = exports.SagaExecutionCoordinatorStatus || (exports.SagaExecutionCoordinatorStatus = {}));
class SagaExecutionCoordinator {
    constructor(rabbit, sagaLogStore) {
        this.status = SagaExecutionCoordinatorStatus.Running;
        this.registeredSagas = new Map();
        this.jobs = new Map();
        this.clients = new Map();
        this.rabbit = rabbit;
        this.sagaLogStore = sagaLogStore || {
            createLog: () => Promise.resolve(),
        };
    }
    async initializeClient(saga) {
        let clientPromise = this.clients.get(saga);
        if (!clientPromise) {
            clientPromise = this.rabbit.createClient(`saga:${saga}`, {
                noResponse: true,
            });
            this.clients.set(saga, clientPromise);
        }
        return clientPromise;
    }
    addJob(type, params) {
        if (type === saga_log_store_1.SagaLogType.StartAction) {
            const job = (() => {
                const id = uuid_1.v4();
                let stopping = false;
                const promise = (async () => {
                    const { execute } = params.saga.actions[params.index];
                    try {
                        await execute(...params.args);
                    }
                    catch (err) {
                        this.addJob(saga_log_store_1.SagaLogType.StartCompensateAction, Object.assign({}, params, { retries: 0 }));
                        return;
                    }
                    if (params.index < params.saga.actions.length - 1) {
                        if (stopping) {
                            const client = await this.initializeClient(params.saga.name);
                            await client(Object.assign({}, ramda_1.default.pick(['eid', 'args'])(params), { type: saga_log_store_1.SagaLogType.StartAction, saga: params.saga.name, index: params.index + 1 }));
                        }
                        else {
                            this.addJob(saga_log_store_1.SagaLogType.StartAction, Object.assign({}, params, { index: params.index + 1 }));
                        }
                    }
                    this.jobs.delete(id);
                })();
                return {
                    id,
                    stop: async () => {
                        stopping = true;
                        await promise;
                    },
                };
            })();
            this.jobs.set(job.id, job);
        }
        if (type === saga_log_store_1.SagaLogType.StartCompensateAction) {
            const job = (() => {
                const id = uuid_1.v4();
                let stopping = false;
                const promise = (async () => {
                    const { compensate } = params.saga.actions[params.index];
                    try {
                        await compensate(...params.args);
                    }
                    catch (err) {
                        if (params.retries < params.options.maxRetries) {
                            this.addJob(saga_log_store_1.SagaLogType.DelayCompensateAction, Object.assign({}, params, { retries: params.retries + 1, schedule: Date.now()
                                    + calculate_backoff_delay_1.default(params.options.backoff, params.retries + 1) }));
                        }
                        else {
                            throw Error('Maximum number of retries reached.');
                        }
                        return;
                    }
                    if (params.index > 0) {
                        if (stopping) {
                            const client = await this.initializeClient(params.saga.name);
                            await client(Object.assign({}, ramda_1.default.pick(['eid', 'args'])(params), { type: saga_log_store_1.SagaLogType.StartCompensateAction, saga: params.saga.name, index: params.index - 1, retries: 0 }));
                        }
                        else {
                            this.addJob(saga_log_store_1.SagaLogType.StartCompensateAction, Object.assign({}, params, { index: params.index - 1, retries: 0 }));
                        }
                    }
                    this.jobs.delete(id);
                })();
                return {
                    id,
                    stop: async () => {
                        stopping = true;
                        await promise;
                    },
                };
            })();
            this.jobs.set(job.id, job);
        }
        if (type === saga_log_store_1.SagaLogType.DelayCompensateAction) {
            const job = (() => {
                const id = uuid_1.v4();
                let stopping = false;
                const delay = Math.max(params.schedule - Date.now(), 0);
                const deferred = defer_1.default();
                const timeout = setTimeout(async () => {
                    deferred.resolve();
                    if (stopping) {
                        const client = await this.initializeClient(params.saga.name);
                        await client(Object.assign({}, ramda_1.default.pick(['eid', 'args', 'index', 'retries'])(params), { type: saga_log_store_1.SagaLogType.StartCompensateAction, saga: params.saga.name }));
                    }
                    else {
                        this.addJob(saga_log_store_1.SagaLogType.StartCompensateAction, ramda_1.default.omit(['schedule'], params));
                    }
                }, delay);
                return {
                    id,
                    stop: async () => {
                        stopping = true;
                        const remaining = Math.max(params.schedule - Date.now(), 0);
                        if (remaining < 5000) {
                            await deferred.promise;
                        }
                        else {
                            clearTimeout(timeout);
                            const client = await this.initializeClient(params.saga.name);
                            await client(Object.assign({}, ramda_1.default.pick(['eid', 'args', 'index', 'retries', 'schedule'], params), { type: saga_log_store_1.SagaLogType.DelayCompensateAction, saga: params.saga.name }));
                        }
                    },
                };
            })();
            this.jobs.set(job.id, job);
        }
    }
    async registerSaga(saga, opts) {
        const options = ramda_1.default.mergeDeepLeft(opts || {}, {
            backoff: {
                minDelay: 10,
                maxDelay: 10000,
                factor: 2,
            },
            maxRetries: 10,
        });
        const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async (params) => {
            if (params.type === saga_log_store_1.SagaLogType.StartSaga) {
                this.sagaLogStore.createLog(params);
                this.addJob(saga_log_store_1.SagaLogType.StartAction, Object.assign({}, ramda_1.default.pick(['eid', 'args'])(params), { saga,
                    options, index: 0 }));
            }
            if (params.type === saga_log_store_1.SagaLogType.StartAction) {
                this.addJob(saga_log_store_1.SagaLogType.StartAction, Object.assign({}, ramda_1.default.pick(['eid', 'args', 'index'], params), { saga,
                    options }));
            }
            if (params.type === saga_log_store_1.SagaLogType.StartCompensateAction) {
                this.addJob(saga_log_store_1.SagaLogType.StartCompensateAction, Object.assign({}, ramda_1.default.pick(['eid', 'args', 'index', 'retries'], params), { saga,
                    options }));
            }
            if (params.type === saga_log_store_1.SagaLogType.DelayCompensateAction) {
                this.addJob(saga_log_store_1.SagaLogType.DelayCompensateAction, Object.assign({}, ramda_1.default.pick(['eid', 'args', 'index', 'retries', 'schedule'], params), { saga,
                    options }));
            }
        });
        this.registeredSagas.set(saga.name, {
            saga,
            worker,
        });
    }
    async stop() {
        if (this.status !== SagaExecutionCoordinatorStatus.Running) {
            return;
        }
        this.status = SagaExecutionCoordinatorStatus.Stopping;
        await Promise.all(Array.from(this.registeredSagas.values()).map(({ worker }) => worker.stop()));
        await Promise.all(Array.from(this.jobs.values()).map(item => item.stop()));
        this.status = SagaExecutionCoordinatorStatus.Stopped;
    }
}
exports.default = SagaExecutionCoordinator;
//# sourceMappingURL=saga-execution-coordinator.js.map