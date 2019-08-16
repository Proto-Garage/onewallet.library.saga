"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ramda_1 = __importDefault(require("ramda"));
const uuid_1 = require("uuid");
const calculate_backoff_delay_1 = __importDefault(require("./calculate-backoff-delay"));
const l = {
    p1: '',
    p2: {
        p4: 'hello',
    },
    p3: [{ p5: '', p6: '' }],
};
console.log(l);
class SagaExecutionCoordinator {
    constructor(rabbit) {
        this.registeredSagas = new Map();
        this.jobs = new Map();
        this.rabbit = rabbit;
    }
    addJob(type, params) {
        if (type === 'EXECUTE_ACTION') {
            const job = (() => {
                const id = uuid_1.v4();
                let stopping = false;
                const promise = (async () => {
                    const { execute } = params.saga.actions[params.index];
                    try {
                        await execute(...params.args);
                    }
                    catch (err) {
                        this.addJob('COMPENSATE_ACTION', Object.assign({}, params, { retries: 0 }));
                        return;
                    }
                    if (params.index < params.saga.actions.length - 1 && !stopping) {
                        this.addJob('EXECUTE_ACTION', Object.assign({}, params, { index: params.index + 1 }));
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
        if (type === 'COMPENSATE_ACTION') {
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
                            this.addJob('DELAY_COMPENSATE_ACTION', Object.assign({}, params, { retries: params.retries + 1 }));
                        }
                        return;
                    }
                    if (params.index > 0 && !stopping) {
                        this.addJob('COMPENSATE_ACTION', Object.assign({}, params, { index: params.index - 1, retries: 0 }));
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
        if (type === 'DELAY_COMPENSATE_ACTION') {
            const job = (() => {
                const id = uuid_1.v4();
                const delay = calculate_backoff_delay_1.default(params.options.backoff, params.retries);
                const timeout = setTimeout(() => {
                    this.addJob('COMPENSATE_ACTION', params);
                }, delay);
                return {
                    id,
                    stop: async () => {
                        clearTimeout(timeout);
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
        const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async ({ type, data }) => {
            if (type === 'START_SAGA') {
                this.addJob('EXECUTE_ACTION', {
                    saga,
                    args: data.args,
                    index: 0,
                    options,
                });
            }
        });
        this.registeredSagas.set(saga.name, {
            saga,
            worker,
        });
    }
    async stop() {
        await Promise.all(Array.from(this.registeredSagas.values()).map(({ worker }) => worker.stop()));
        await Promise.all(Array.from(this.jobs.values()).map(item => item.stop()));
    }
}
exports.default = SagaExecutionCoordinator;
//# sourceMappingURL=saga-execution-coordinator.js.map