import Rabbit, { Worker } from 'onewallet.library.rabbit';
import { v4 as uuid } from 'uuid';

import { Saga } from './saga';
import logger from './logger';

type WorkerParams = {
  type: 'START_SAGA';
  data: {
    saga: string;
    args: any[];
  };
}

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

  private addJob(type: 'EXECUTE_ACTION', params: { saga: Saga<any[]>; index: number; args: any[] }): void;

  private addJob(type: 'COMPENSATE_ACTION', params: { saga: Saga<any[]>; index: number; args: any[]; retries: number }): void;

  private addJob(type: 'DELAY_COMPENSATE_ACTION', params: { saga: Saga<any[]>; index: number; args: any[]; retries: number }): void;

  private addJob(type: string, params: Record<string, any>) {
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
              saga: params.saga,
              args: params.args,
              index: params.index,
              retries: 0,
            });
            return;
          }

          if (params.index < params.saga.actions.length - 1 && !stopping) {
            this.addJob('EXECUTE_ACTION', {
              saga: params.saga,
              args: params.args,
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
            logger.warn(err);
            return;
          }

          if (params.index > 0 && !stopping) {
            this.addJob('COMPENSATE_ACTION', {
              saga: params.saga,
              args: params.args,
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

        const timeout = setTimeout(() => {

        }, 1000);

        clearTimeout(timeout);

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

  public async registerSaga(saga: Saga<any[]>) {
    const worker = await this.rabbit.createWorker(`saga:${saga.name}`, async ({ type, data }: WorkerParams) => {
      if (type === 'START_SAGA') {
        this.addJob('EXECUTE_ACTION', {
          saga,
          args: data.args,
          index: 0,
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
