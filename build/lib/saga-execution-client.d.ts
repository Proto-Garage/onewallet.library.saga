import Rabbit from 'onewallet.library.rabbit';
export default class SagaExecutionClient<T extends any[] = [Record<string, any>]> {
    private readonly rabbit;
    private readonly saga;
    private clientPromise;
    constructor(rabbit: Rabbit, saga: string);
    private initializeClient;
    execute(...args: T): Promise<void>;
}
//# sourceMappingURL=saga-execution-client.d.ts.map