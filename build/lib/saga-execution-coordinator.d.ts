import Rabbit from 'onewallet.library.rabbit';
import { Saga } from './saga';
export default class SagaExecutionCoordinator {
    private readonly rabbit;
    private readonly workers;
    private readonly sagas;
    constructor(rabbit: Rabbit);
    registerSaga<T extends any[] = [Record<string, any>]>(saga: Saga<T>): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=saga-execution-coordinator.d.ts.map