import Rabbit from 'onewallet.library.rabbit';
import { Saga, SagaOptions } from './saga';
import { SagaLogStore } from './saga-log-store';
export declare enum SagaExecutionCoordinatorStatus {
    Running = 0,
    Stopping = 1,
    Stopped = 2
}
export default class SagaExecutionCoordinator {
    private status;
    private readonly rabbit;
    private readonly registeredSagas;
    private readonly jobs;
    private readonly sagaLogStore;
    private readonly clients;
    constructor(rabbit: Rabbit, sagaLogStore?: SagaLogStore);
    private initializeClient;
    private addJob;
    registerSaga(saga: Saga<any[]>, opts?: RecursivePartial<SagaOptions>): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=saga-execution-coordinator.d.ts.map