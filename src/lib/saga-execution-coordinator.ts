import Rabbit, { Worker, Client } from 'onewallet.library.rabbit';
import R from 'ramda';
import { v4 as uuid } from 'uuid';

import { Saga, SagaOptions } from './saga';
import calculateBackoffDelay from './calculate-backoff-delay';
import defer from './defer';
import { SagaLogStore, SagaLogType } from './saga-log-store';

type WorkerParams = {
  eid: string;
  saga: string;
  args: any[];
} & ({
  type: SagaLogType.StartSaga;
} | {
  type: SagaLogType.StartAction;
  index: number;
} | {
  type: SagaLogType.StartCompensateAction;
  index: number;
  retries: number;
} | {
  type: SagaLogType.DelayCompensateAction;
  index: number;
  retries: number;
  schedule: number;
});

type CommonJobParams = {
  eid: string;
  saga: Saga<any[]>;
  options: SagaOptions;
  index: number;
  args: any[];
};

export enum SagaExecutionCoordinatorStatus {
  Running,
  Stopping,
  Stopped,
}

export default class SagaExecutionCoordinator {
  private status: SagaExecutionCoordinatorStatus = SagaExecutionCoordinatorStatus.Running;

  private readonly rabbit: Rabbit;

  private readonly registeredSagas: Map<string, {
    saga: Saga;
    worker: Worker;
  }> = new Map();

  private readonly jobs: Map<string, { id: string; stop: () => Promise<void> }> = new Map();

  private readonly sagaLogStore: SagaLogStore;

  private readonly clients: Map<string, Promise<{
    (...args: any[]): Promise<any>;
    client: Client;
  }>> = new Map();

  public constructor(rabbit: Rabbit, sagaLogStore?: SagaLogStore) {
    this.rabbit = rabbit;
    this.sagaLogStore = sagaLogStore || {
      createLog: () => Promise.resolve(),
    };
  }

  private async initializeClient(saga: string): Promise<(params: WorkerParams) => Promise<void>> {
    let clientPromise = this.clients.get(saga);

    if (!clientPromise) {
      clientPromise = this.rabbit.createClient(`saga:${saga}`, {
        noResponse: true,
      });

      this.clients.set(saga, clientPromise);
    }

    return clientPromise;
  }

  private addJob(
    type: SagaLogType.StartAction,
    params: CommonJobParams,
  ): void;

  private addJob(
    type: SagaLogType.StartCompensateAction,
    params: CommonJobParams & { retries: number },
  ): void;

  private addJob(
    type: SagaLogType.DelayCompensateAction,
    params: CommonJobParams & { retries: number; schedule: number },
  ): void;

  private addJob(
    type: string,
    params: CommonJobParams & { retries: number; schedule: number },
  ) {
    if (type === SagaLogType.StartAction) {
      const job = (() => {
        const id = uuid();
        let stopping = false;

        const promise = (async () => {
          const { execute } = params.saga.actions[params.index];
          try {
            await this.sagaLogStore.createLog({
              ...R.pick(['eid', 'index'])(params),
              type: SagaLogType.StartAction,
              saga: params.saga.name,
            });

            await execute(...params.args);

            await this.sagaLogStore.createLog({
              ...R.pick(['eid', 'index'])(params),
              type: SagaLogType.EndAction,
              saga: params.saga.name,
            });
          } catch (err) {
            this.addJob(SagaLogType.StartCompensateAction, {
              ...params,
              retries: 0,
            });
            return;
          }

          if (params.index < params.saga.actions.length - 1) {
            if (stopping) {
              const client = await this.initializeClient(params.saga.name);

              await client({
                ...R.pick(['eid', 'args'])(params),
                type: SagaLogType.StartAction,
                saga: params.saga.name,
                index: params.index + 1,
              });
            } else {
              this.addJob(SagaLogType.StartAction, {
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

    if (type === SagaLogType.StartCompensateAction) {
      const job = (() => {
        const id = uuid();
        let stopping = false;

        const promise = (async () => {
          const { compensate } = params.saga.actions[params.index];
          try {
            await this.sagaLogStore.createLog({
              ...R.pick(['eid', 'index', 'retries'])(params),
              type: SagaLogType.StartCompensateAction,
              saga: params.saga.name,
            });

            await compensate(...params.args);

            await this.sagaLogStore.createLog({
              ...R.pick(['eid', 'index', 'retries'])(params),
              type: SagaLogType.EndCompensateAction,
              saga: params.saga.name,
            });
          } catch (err) {
            if (params.retries < params.options.maxRetries) {
              this.addJob(SagaLogType.DelayCompensateAction, {
                ...params,
                retries: params.retries + 1,
                schedule: Date.now()
                  + calculateBackoffDelay(params.options.backoff, params.retries + 1),
              });
            } else {
              throw Error('Maximum number of retries reached.');
            }

            return;
          }

          if (params.index > 0) {
            if (stopping) {
              const client = await this.initializeClient(params.saga.name);

              await client({
                ...R.pick(['eid', 'args'])(params),
                type: SagaLogType.StartCompensateAction,
                saga: params.saga.name,
                index: params.index - 1,
                retries: 0,
              });
            } else {
              this.addJob(SagaLogType.StartCompensateAction, {
                ...params,
                index: params.index - 1,
                retries: 0,
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

    if (type === SagaLogType.DelayCompensateAction) {
      const job = (() => {
        const id = uuid();
        let stopping = false;

        const delay = Math.max(params.schedule - Date.now(), 0);

        const deferred = defer();
        const timeout = setTimeout(async () => {
          deferred.resolve();
          if (stopping) {
            const client = await this.initializeClient(params.saga.name);

            await client({
              ...R.pick(['eid', 'args', 'index', 'retries'])(params),
              type: SagaLogType.StartCompensateAction,
              saga: params.saga.name,
            });
          } else {
            this.addJob(SagaLogType.StartCompensateAction, R.omit(['schedule'], params));
          }
        }, delay);

        return {
          id,
          stop: async () => {
            stopping = true;
            const remaining = Math.max(params.schedule - Date.now(), 0);
            if (remaining < 5000) {
              await deferred.promise;
            } else {
              clearTimeout(timeout);
              const client = await this.initializeClient(params.saga.name);

              await client({
                ...R.pick(['eid', 'args', 'index', 'retries', 'schedule'], params),
                type: SagaLogType.DelayCompensateAction,
                saga: params.saga.name,
              });
            }
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
      if (params.type === SagaLogType.StartSaga) {
        this.sagaLogStore.createLog(params);

        this.addJob(SagaLogType.StartAction, {
          ...R.pick(['eid', 'args'])(params),
          saga,
          options,
          index: 0,
        });
      }
      if (params.type === SagaLogType.StartAction) {
        this.addJob(SagaLogType.StartAction, {
          ...R.pick(['eid', 'args', 'index'], params),
          saga,
          options,
        });
      }

      if (params.type === SagaLogType.StartCompensateAction) {
        this.addJob(SagaLogType.StartCompensateAction, {
          ...R.pick(['eid', 'args', 'index', 'retries'], params),
          saga,
          options,
        });
      }

      if (params.type === SagaLogType.DelayCompensateAction) {
        this.addJob(SagaLogType.DelayCompensateAction, {
          ...R.pick(['eid', 'args', 'index', 'retries', 'schedule'], params),
          saga,
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
    if (this.status !== SagaExecutionCoordinatorStatus.Running) {
      return;
    }

    this.status = SagaExecutionCoordinatorStatus.Stopping;
    await Promise.all(Array.from(this.registeredSagas.values()).map(({ worker }) => worker.stop()));
    await Promise.all(Array.from(this.jobs.values()).map(item => item.stop()));
    this.status = SagaExecutionCoordinatorStatus.Stopped;
  }
}
