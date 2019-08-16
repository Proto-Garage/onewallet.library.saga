/* eslint-disable no-unused-expressions */
import Rabbit from 'onewallet.library.rabbit';
import R from 'ramda';
import sinon from 'sinon';
import { delay } from 'highoutput-utilities';
import { expect } from 'chai';

import { SagaExecutionCoordinator, SagaExecutionClient, Saga } from '../src';

const rabbit = new Rabbit({
  uri: 'amqp://localhost',
});

const createFakeCoordinator = async (
  sagaActions: (() => Promise<void>)[],
  sagaCompensationActions: (() => Promise<void>)[],
) => {
  const coordinator = new SagaExecutionCoordinator(rabbit);

  const saga: Saga<[{ value: number }]> = {
    name: 'TestSaga',
    actions: R.times(index => ({
      compensate: sagaCompensationActions[index],
      execute: sagaActions[index],
    }))(sagaActions.length),
  };

  await coordinator.registerSaga(saga, { backoff: { minDelay: 1 } });

  return coordinator;
};

describe('SagaExecutionCoordinator', () => {
  describe('Given saga actions A[0], A[1] and A[2] and saga compensation actions C[0], C[1] and C[2]', () => {
    describe('Given all saga actions execute successfully', () => {
      before(async function () {
        this.A = R.times(() => sinon.fake.resolves(undefined), 3);
        this.C = R.times(() => sinon.fake.resolves(undefined), 3);

        this.coordinator = await createFakeCoordinator(this.A, this.C);

        const client = new SagaExecutionClient<[{ value: number }]>(rabbit, 'TestSaga');
        await client.execute({ value: Math.random() });
        await delay(100);
      });

      after(async function () {
        await this.coordinator.stop();
      });

      it('should execute all saga actions', function () {
        for (const item of this.A) {
          expect(item.calledOnce).to.be.true;
        }
      });

      it('should not execute all saga compensation actions', function () {
        for (const item of this.C) {
          expect(item.calledOnce).to.be.false;
        }
      });
    });

    describe('Given A[1] fails', () => {
      before(async function () {
        this.A = R.times(() => sinon.fake.resolves(undefined), 3);
        this.C = R.times(() => sinon.fake.resolves(undefined), 3);
        this.A[1] = sinon.fake.rejects(new Error('Failed'));

        this.coordinator = await createFakeCoordinator(this.A, this.C);

        const client = new SagaExecutionClient<[{ value: number }]>(rabbit, 'TestSaga');
        await client.execute({ value: Math.random() });
        await delay(100);
      });

      after(async function () {
        await this.coordinator.stop();
      });

      it('should execute A[0]', function () {
        expect(this.A[0].calledOnce).to.be.true;
      });

      it('should not execute A[2]', function () {
        expect(this.A[2].calledOnce).to.be.false;
      });

      it('should execute C[0] and C[1]', function () {
        expect(this.C[0].calledOnce).to.be.true;
        expect(this.C[1].calledOnce).to.be.true;
      });

      it('should not execute C[2]', function () {
        expect(this.C[2].calledOnce).to.be.false;
      });
    });

    describe('Given A[1] fails and C[1] fails for the first 2 runs', () => {
      before(async function () {
        this.A = R.times(() => sinon.fake.resolves(undefined), 3);
        this.C = R.times(() => sinon.fake.resolves(undefined), 3);
        this.A[1] = sinon.fake.rejects(new Error('Failed'));
        this.C[1] = (() => {
          let counter = 0;

          return sinon.fake(async () => {
            counter += 1;

            if (counter < 3) {
              throw new Error('Failed');
            }
          });
        })();

        this.coordinator = await createFakeCoordinator(this.A, this.C);

        const client = new SagaExecutionClient<[{ value: number }]>(rabbit, 'TestSaga');
        await client.execute({ value: Math.random() });
        await delay(100);
      });

      it('should execute C[1] 3 times', function () {
        expect(this.C[1].callCount).to.equal(3);
      });
    });
  });
});
