/* eslint-disable import/prefer-default-export */
import {
  Connection, Schema, Model, Document,
} from 'mongoose';
import R from 'ramda';

export enum SagaLogType {
  StartSaga = 'START_SAGA',
  EndSaga = 'END_SAGA',
  StartAction = 'START_ACTION',
  EndAction = 'END_ACTION',
  StartCompensateAction = 'START_COMPENSATE_ACTION',
  EndCompensateAction = 'END_COMPENSATE_ACTION',
  DelayCompensateAction = 'DELAY_COMPENSATE_ACTION',
}

export type SagaLog = {
  eid: string;
  saga: string;
} & ({
  type: SagaLogType.StartSaga;
  args: any[];
} | {
  type: SagaLogType.EndSaga;
} | {
  type: SagaLogType.StartAction | SagaLogType.EndAction;
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

const SagaLogSchema = new Schema({
  type: {
    type: String,
    enum: R.values(SagaLogType),
    required: true,
  },
  eid: {
    type: String,
    required: true,
  },
  saga: {
    type: String,
    required: true,
  },
  args: {
    type: [Schema.Types.Mixed],
    required: true,
  },
  index: {
    type: Number,
    default: null,
  },
  retries: {
    type: Number,
    default: null,
  },
  schedule: {
    type: Number,
    default: null,
  },
  dateTimeCreated: {
    type: Date,
    default: Date.now,
  },
});

export class MongooseSagaLogStore implements SagaLogStore {
  private readonly model: Model<Document>;

  public constructor(connection: Connection) {
    this.model = connection.model('SagaLog', SagaLogSchema);
  }

  public async createLog(params: SagaLog) {
    await this.model.create(params);
  }
}
