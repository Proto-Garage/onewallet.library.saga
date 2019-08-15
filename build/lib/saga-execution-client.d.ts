import Rabbit from 'onewallet.library.rabbit';
export default class SagaExecutionClient<T extends any[] = [Record<string, any>]> {
    private readonly rabbit;
    private readonly saga;
    private client;
    constructor(rabbit: Rabbit, saga: string);
    execute(...args: T): Promise<void>;
}
//# sourceMappingURL=saga-execution-client.d.ts.map