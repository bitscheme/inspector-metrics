/* tslint:disable:no-unused-expression */

import "reflect-metadata";
import "source-map-support/register";

import * as chai from "chai";
import { suite, test } from "mocha-typescript";

import { diff, StdClock, Time } from "../../lib/metrics/clock";

const expect = chai.expect;

@suite("Diff")
export class DiffTest {

    @test("diff with null values")
    public checkDiffWithNullValues(): void {
        expect(diff(null, null)).to.equal(0);
    }

    @test("diff with same value")
    public checkDiffWithSameValues(): void {
        const time: Time = {
            milliseconds: 0,
            nanoseconds: 0,
        };
        expect(diff(time, time)).to.equal(0);
    }

    @test("diff with different nanoseconds")
    public checkDiffWithDifferentNanosecondValues(): void {
        const one: Time = {
            milliseconds: 0,
            nanoseconds: 0,
        };
        const two: Time = {
            milliseconds: 0,
            nanoseconds: 1,
        };
        expect(diff(one, two)).to.equal(1);
    }

    @test("diff with different milliseconds")
    public checkDiffWithDifferentMillisecondValues(): void {
        const one: Time = {
            milliseconds: 0,
            nanoseconds: 0,
        };
        const two: Time = {
            milliseconds: 1,
            nanoseconds: 0,
        };
        expect(diff(one, two)).to.equal(1000000);
    }

    @test("diff with different milliseconds and nanoseconds")
    public checkDiffWithDifferentMillisecondAndNanoseondValues(): void {
        const one: Time = {
            milliseconds: 0,
            nanoseconds: 0,
        };
        const two: Time = {
            milliseconds: 1,
            nanoseconds: 2,
        };
        expect(diff(one, two)).to.equal(1000002);
    }

}

@suite("StdClock")
export class StdClockTest {

    @test("check time function")
    public checkTimeFunction(): void {
        const time = new StdClock().time();
        expect(time).to.be.not.null;
    }

}