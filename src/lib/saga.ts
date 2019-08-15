export type SagaAction<T extends any[]> = {
  execute: (...args: T) => Promise<void>;
  compensate: (...args: T) => Promise<void>;
}

export type Saga<T extends any[] = [Record<string, any>]> = {
  name: string;
  actions: SagaAction<T>[];
  options?: {
    backoff?: {
      minDelay?: number;
      maxDelay?: number;
    };
    maxRetries?: number;
  };
}
