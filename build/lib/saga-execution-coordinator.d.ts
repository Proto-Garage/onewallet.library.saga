import Rabbit from 'onewallet.library.rabbit';
import { Saga, SagaOptions } from './saga';
export default class SagaExecutionCoordinator {
    private readonly rabbit;
    private readonly registeredSagas;
    private readonly jobs;
    constructor(rabbit: Rabbit);
    private addJob;
    registerSaga(saga: Saga<any[]>, opts?: RecursivePartial<SagaOptions>): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=saga-execution-coordinator.d.ts.map