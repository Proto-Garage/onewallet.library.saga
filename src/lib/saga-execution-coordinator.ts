import Rabbit, { Worker, Client } from 'onewallet.library.rabbit';
import R from 'ramda';
import { v4 as uuid } from 'uuid';

import { Saga, SagaOptions } from './saga';
import calculateBackoffDelay from './calculate-backoff-delay';

type WorkerParams = {
  type: 'START_SAGA';
  data: {
    saga: string;
    args: any[];
  };
} | {
  type: 'START_ACTION';
  data: {
    saga: string;
    args: any[];
    index: number;
  };
}

type JobParams = {
  saga: Saga<any[]>;
  options: SagaOptions;
  index: number;
  args: any[];
  retries: number;
};

export default class SagaExecutionCoordinator {
  private status: 'RUNNING' | 'STOPPING' | 'STOPPED' = 'RUNNING';

  private readonly rabbit: Rabbit;

  private readonly registeredSagas: Map<string, {
    saga: Saga;
    worker: Worker;
  }> = new Map();

  private readonly jobs: Map<string, { id: string; stop: () => Promise<void> }> = new Map();

  private readonly clients: Map<string, Promise<{
    (...args: any[]): Promise<any>;
    client: Client;
  }>> = new Map();

  public constructor(rabbit: Rabbit) {
    this.rabbit = rabbit;
  }

  private async initializeClient(saga: string) {
    let clientPromise = this.clients.get(saga);

    if (!clientPromise) {
      clientPromise = this.rabbit.createClient(`saga:${saga}`, {
        noResponse: true,
      });
      this.clients.set(saga, clientPromise);
    }

    return clientPromise;
  }

  private addJob(type: 'EXECUTE_ACTION', params: Omit<JobParams, 'retries'>): void;

  private addJob(type: 'COMPENSATE_ACTION', params: JobParams): void;

  private addJob(type: 'DELAY_COMPENSATE_ACTION', params: JobParams): void;

  private addJob(
    type: string,
    params: JobParams,
  ) {
    if (type === 'EXECUTE_ACTION') {
      const job = (() => {
        const id = uuid();
        let stopping = false;

        const promise = (async () => {
          const { execute } = params.saga.actions[params.index];
          try {
            await execute(...params.args);
          } catch (err) {
            this.addJob('COMPENSATE_ACTION', {
              ...params,
              retries: 0,
            });
            return;
          }

          if (params.index < params.saga.actions.length - 1) {
            if (stopping) {
              const client = await this.initializeClient(params.saga.name);

              await client({
                type: 'START_ACTION',
                data: {
                  saga: params.saga.name,
                  args: params.args,
                  index: params.index + 1,
                },
              });
            } else {
              this.addJob('EXECUTE_ACTION', {
                ...params,
                index: params.index + 1,
              });
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

    if (type === 'COMPENSATE_ACTION') {
      const job = (() => {
        const id = uuid();
        let stopping = false;

        const promise = (async () => {
          const { compensate } = params.saga.actions[params.index];
          try {
            await compensate(...params.args);
          } catch (err) {
            if (params.retries < params.options.maxRetries) {
              this.addJob('DELAY_COMPENSATE_ACTION', {
                ...params,
                retries: params.retries + 1,
              });
            }
            return;
          }

          if (params.index > 0 && !stopping) {
            this.addJob('COMPENSATE_ACTION', {
              ...params,
              index: params.index - 1,
              retries: 0,
            });
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
        const id = uuid();

        const delay = calculateBackoffDelay(params.options.backoff, params.retries);

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

  public async registerSaga(saga: Saga<any[]>, opts?: RecursivePartial<SagaOptions>) {
    const options = R.mergeDeepLeft(opts || {}, {
      backoff: {
        minDelay: 10,
        maxDelay: 10000,
        factor: 2,
      },
      maxRetries: 10,
    }) as SagaOptions;

    const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async (params: WorkerParams) => {
      if (params.type === 'START_SAGA') {
        this.addJob('EXECUTE_ACTION', {
          saga,
          args: params.data.args,
          index: 0,
          options,
        });
      }
      if (params.type === 'START_ACTION') {
        this.addJob('EXECUTE_ACTION', {
          saga,
          args: params.data.args,
          index: params.data.index,
          options,
        });
      }
    });

    this.registeredSagas.set(saga.name, {
      saga,
      worker,
    });
  }

  public async stop() {
    if (this.status !== 'RUNNING') {
      return;
    }

    this.status = 'STOPPING';
    await Promise.all(Array.from(this.registeredSagas.values()).map(({ worker }) => worker.stop()));
    await Promise.all(Array.from(this.jobs.values()).map(item => item.stop()));
    this.status = 'STOPPED';
  }
}
