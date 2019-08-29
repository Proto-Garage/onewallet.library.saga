import Rabbit from 'onewallet.library.rabbit';
import { v4 as uuid } from 'uuid';

export default class SagaExecutionClient<T extends any[] = [Record<string, any>]> {
  private readonly rabbit: Rabbit;

  private readonly saga: string;

  private clientPromise: ReturnType<Rabbit['createClient']> | null = null;

  public constructor(rabbit: Rabbit, saga: string) {
    this.rabbit = rabbit;
    this.saga = saga;
  }

  private async initializeClient() {
    if (!this.clientPromise) {
      this.clientPromise = this.rabbit.createClient(`saga:${this.saga}`, {
        noResponse: true,
      });
    }

    return this.clientPromise;
  }

  public async execute(...args: T) {
    const client = await this.initializeClient();

    const eid = uuid();

    await client({
      eid,
      type: 'START_SAGA',
      saga: this.saga,
      args,
    });
  }
}
