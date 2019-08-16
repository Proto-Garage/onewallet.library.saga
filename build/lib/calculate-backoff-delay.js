"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ({ minDelay, maxDelay, factor }, retries) => Math.floor(Math.min(minDelay * (factor ** retries), maxDelay));
//# sourceMappingURL=calculate-backoff-delay.js.map