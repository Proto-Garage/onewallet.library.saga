import { SagaOptions } from './saga';

export default ({ minDelay, maxDelay, factor }: SagaOptions['backoff'], retries: number) => Math.floor(Math.min(minDelay * (factor ** retries), maxDelay));
