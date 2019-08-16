import { expect } from 'chai';

import calculateBackoffDelay from '../../src/lib/calculate-backoff-delay';
import { SagaOptions } from '../../src';

describe('calculateBackoffDelay', () => {
  const examples: {
    input: [SagaOptions['backoff'], number];
    output: number;
  }[] = [
    {
      input: [{
        minDelay: 10,
        maxDelay: 10000,
        factor: 2,
      }, 5],
      output: 320,
    },
    {
      input: [{
        minDelay: 10,
        maxDelay: 10000,
        factor: 2,
      }, 10],
      output: 10000,
    },
    {
      input: [{
        minDelay: 10,
        maxDelay: 10000,
        factor: 2,
      }, 0],
      output: 10,
    }];

  it('should generate correct outputs', () => {
    for (const { input, output } of examples) {
      expect(calculateBackoffDelay(...input)).to.equal(output);
    }
  });
});
