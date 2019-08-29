"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
var SagaLogType;
(function (SagaLogType) {
    SagaLogType["StartSaga"] = "START_SAGA";
    SagaLogType["EndSaga"] = "END_SAGA";
    SagaLogType["StartAction"] = "START_ACTION";
    SagaLogType["EndAction"] = "END_ACTION";
    SagaLogType["StartCompensateAction"] = "START_COMPENSATE_ACTION";
    SagaLogType["EndCompensateAction"] = "END_COMPENSATE_ACTION";
    SagaLogType["DelayCompensateAction"] = "DELAY_COMPENSATE_ACTION";
})(SagaLogType = exports.SagaLogType || (exports.SagaLogType = {}));
const SagaLogSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: [
            'START_SAGA',
            'START_ACTION',
            'COMPENSATE_ACTION',
            'DELAY_COMPENSATE_ACTION',
        ],
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
        type: [mongoose_1.Schema.Types.Mixed],
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
class MongooseSagaLogStore {
    constructor(connection) {
        this.model = connection.model('SagaLog', SagaLogSchema);
    }
    async createLog(params) {
        await this.model.create(params);
    }
}
exports.MongooseSagaLogStore = MongooseSagaLogStore;
//# sourceMappingURL=saga-log-store.js.map