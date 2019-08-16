import Rabbit, { Worker } from 'onewallet.library.rabbit';
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
}

type JobParams = {
  saga: Saga<any[]>;
  options: SagaOptions;
  index: number;
  args: any[];
  retries: number;
};

export default class SagaExecutionCoordinator {
  private readonly rabbit: Rabbit;

  private readonly registeredSagas: Map<string, {
    saga: Saga;
    worker: Worker;
  }> = new Map();

  private readonly jobs: Map<string, { id: string; stop: () => Promise<void> }> = new Map();

  public constructor(rabbit: Rabbit) {
    this.rabbit = rabbit;
  }

  private addJob(type: 'EXECUTE_ACTION', params: Omit<JobParams, 'retries'>): void;

  private addJob(type: 'COMPENSATE_ACTION', params: JobParams): void;

  private addJob(
    type: 'DELAY_COMPENSATE_ACTION',
    params: JobParams,
  ): void;

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

          if (params.index < params.saga.actions.length - 1 && !stopping) {
            this.addJob('EXECUTE_ACTION', {
              ...params,
              index: params.index + 1,
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

    const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async ({ type, data }: WorkerParams) => {
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

  public async stop() {
    await Promise.all(Array.from(this.registeredSagas.values()).map(({ worker }) => worker.stop()));

    await Promise.all(Array.from(this.jobs.values()).map(item => item.stop()));
  }
}
