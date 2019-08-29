"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function defer() {
    let resolve = () => { };
    let reject = () => { };
    const promise = new Promise(((...args) => {
        [resolve, reject] = args;
    }));
    return {
        resolve,
        reject,
        promise,
    };
}
exports.default = defer;
//# sourceMappingURL=defer.js.map