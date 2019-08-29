import { Connection } from 'mongoose';
export declare enum SagaLogType {
    StartSaga = "START_SAGA",
    EndSaga = "END_SAGA",
    StartAction = "START_ACTION",
    EndAction = "END_ACTION",
    StartCompensateAction = "START_COMPENSATE_ACTION",
    EndCompensateAction = "END_COMPENSATE_ACTION",
    DelayCompensateAction = "DELAY_COMPENSATE_ACTION"
}
export declare type SagaLog = {
    eid: string;
    saga: string;
} & ({
    type: SagaLogType.StartSaga;
    args: any[];
} | {
    type: 'END_SAGA';
} | {
    type: SagaLogType.StartAction | SagaLogType.EndSaga;
    index: number;
} | {
    type: SagaLogType.StartCompensateAction | SagaLogType.EndCompensateAction;
    index: number;
    retries: number;
} | {
    type: SagaLogType.DelayCompensateAction;
    index: number;
    retries: number;
    schedule: number;
});
export interface SagaLogStore {
    createLog(params: SagaLog): Promise<void>;
}
export declare class MongooseSagaLogStore implements SagaLogStore {
    private readonly model;
    constructor(connection: Connection);
    createLog(params: SagaLog): Promise<void>;
}
//# sourceMappingURL=saga-log-store.d.ts.map