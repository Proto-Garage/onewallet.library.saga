import Rabbit from 'onewallet.library.rabbit';

export default class SagaExecutionClient<T extends any[] = [Record<string, any>]> {
  private readonly rabbit: Rabbit;

  private readonly saga: string;

  private client: ReturnType<Rabbit['createClient']> | null = null;

  public constructor(rabbit: Rabbit, saga: string) {
    this.rabbit = rabbit;
    this.saga = saga;
  }

  public async execute(...args: T) {
    if (!this.client) {
      this.client = this.rabbit.createClient(`saga:${this.saga}`, {
        noResponse: true,
      });
    }

    const client = await this.client;

    await client({
      type: 'START_SAGA',
      data: {
        saga: this.saga,
        args,
      },
    });
  }
}
