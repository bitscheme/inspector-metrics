import "source-map-support/register";

import { Clock, StdClock } from "../clock";
import { Counter, MonotoneCounter } from "../counter";
import { Gauge } from "../gauge";
import { Histogram } from "../histogram";
import { Meter } from "../meter";
import { MetricRegistry } from "../metric-registry";
import { MILLISECOND, TimeUnit } from "../time-unit";
import { Timer } from "../timer";
import { Logger } from "./logger";
import { ReportingContext, ReportingResult } from "./metric-reporter";
import { MetricType } from "./metric-type";
import { ScheduledMetricReporter, ScheduledMetricReporterOptions, Scheduler } from "./scheduled-reporter";

/**
 * Helper interface to abstract a log-line.
 *
 * @interface LogLine
 */
interface LogLine {
    /**
     * Message string passed to the logger instance.
     *
     * @type {string}
     * @memberof LogLine
     */
    message: string;
    /**
     * Metadata passed to the logger instance as second parameter.
     *
     * @type {*}
     * @memberof LogLine
     */
    metadata: any;
}

/**
 * Helper interface for the reporting context.
 *
 * @interface LoggerReportingContext
 * @extends {ReportingContext<M>}
 * @template M
 */
interface LoggerReportingContext<M> extends ReportingContext<M> {
    /**
     * Common log metadata to extend.
     *
     * @type {*}
     * @memberof LoggerReportingContext
     */
    readonly logMetadata: any;
}

/**
 * Options for {@link LoggerReporter}.
 *
 * @export
 * @class LoggerReporterOptions
 * @implements {ScheduledMetricReporterOptions}
 */
export interface LoggerReporterOptions extends ScheduledMetricReporterOptions {
    /**
     * The logger instance used to report metrics.
     *
     * @type {Logger}
     * @memberof LoggerReporterOptions
     */
    log: Logger;
}

/**
 * Standard implementation of a {@link MetricReporter} that uses a {@link Logger} instance.
 *
 * @export
 * @class LoggerReporter
 * @extends {MetricReporter}
 */
export class LoggerReporter extends ScheduledMetricReporter<LoggerReporterOptions, LogLine> {

    /**
     * The metadata object passed to the {@link Logger} instance.
     *
     * @private
     * @type {*}
     * @memberof LoggerReporter
     */
    private logMetadata: any;

    /**
     * Creates an instance of LoggerReporter.
     *
     * @memberof LoggerReporter
     */
    public constructor({
        log = console,
        reportInterval = 1000,
        unit = MILLISECOND,
        clock = new StdClock(),
        scheduler = setInterval,
        minReportingTimeout = 1,
        tags = new Map(),
    }: {
        /**
         * The logger instance used to report metrics.
         * @type {Logger}
         */
        log?: Logger,
        /**
         * Reporting interval in the time-unit of {@link #unit}.
         * @type {number}
         */
        reportInterval?: number;
        /**
         * The time-unit of the reporting interval.
         * @type {TimeUnit}
         */
        unit?: TimeUnit;
        /**
         * The clock instance used determine the current time.
         * @type {Clock}
         */
        clock?: Clock;
        /**
         * The scheduler function used to trigger reporting.
         * @type {Scheduler}
         */
        scheduler?: Scheduler;
        /**
         * The timeout in which a metrics gets reported wether it's value has changed or not.
         * @type {number}
         */
        minReportingTimeout?: number;
        /**
         * Common tags for this reporter instance.
         * @type {Map<string, string>}
         */
        tags?: Map<string, string>;
    }) {
        super({
            clock,
            log,
            minReportingTimeout,
            reportInterval,
            scheduler,
            tags,
            unit,
        });
        this.logMetadata = {
            reportInterval,
            tags,
            unit,
        };
    }

    /**
     * Gets the {@link Logger} instance.
     *
     * @returns {Logger}
     * @memberof LoggerReporter
     */
    public getLog(): Logger {
        return this.options.log;
    }

    /**
     * Sets the {@link Logger} instance.
     *
     * @param {Logger} log
     * @memberof LoggerReporter
     */
    public setLog(log: Logger): void {
        this.options.log = log;
    }

    /**
     * Creates a new {@link LoggerReportingContext} using the speicifed arguments.
     *
     * @protected
     * @param {MetricRegistry} registry
     * @param {Date} date
     * @param {MetricType} type
     * @returns {LoggerReportingContext<any>}
     * @memberof LoggerReporter
     */
    protected createReportingContext(
        registry: MetricRegistry, date: Date, type: MetricType): LoggerReportingContext<any> {
        const logMetadata = Object.assign({}, this.logMetadata, {
            measurement: "",
            measurement_type: type,
            timestamp: date,
        });
        return {
            date,
            logMetadata,
            metrics: [],
            registry,
            type,
        };
    }

    /**
     * Logs each result at 'info' level using the logger instance specified in the options.
     *
     * @protected
     * @param {MetricRegistry} registry
     * @param {Date} date
     * @param {MetricType} type
     * @param {Array<ReportingResult<any, LogLine>>} results
     * @returns {Promise<void>}
     * @memberof LoggerReporter
     */
    protected handleResults(
        registry: MetricRegistry,
        date: Date,
        type: MetricType,
        results: Array<ReportingResult<any, LogLine>>): Promise<void> {
        for (const logLine of results) {
            this.options.log.info(logLine.result.message, logLine.result.metadata);
        }
        return Promise.resolve();
    }

    /**
     * Builds the log message for the given {@link Counter} or {@link MonotoneCounter} if the value of
     * {@link Counter#getCount()} or {@link MonotoneCounter#getCount()} is a valid number.
     *
     * Reported fields:
     * - count
     *
     * Also the metadata (tags, metric group, metric name) and the date is included.
     *
     * @protected
     * @param {(MonotoneCounter | Counter)} counter
     * @param {(LoggerReportingContext<MonotoneCounter | Counter>)} ctx
     * @returns {LogLine}
     * @memberof LoggerReporter
     */
    protected reportCounter(
        counter: MonotoneCounter | Counter, ctx: LoggerReportingContext<MonotoneCounter | Counter>): LogLine {
        if (!isNaN(counter.getCount())) {
            const name = counter.getName();
            ctx.logMetadata.measurement = name;
            ctx.logMetadata.group = counter.getGroup();
            ctx.logMetadata.tags = this.buildTags(ctx.registry, counter);
            return {
                message: `${ctx.date} - counter ${name}: ${counter.getCount()}`,
                metadata: Object.assign({}, ctx.logMetadata),
            };
        }
        return null;
    }

    /**
     * Builds the log message for the given {@link Gauge} if the gauge's
     * value is a valid number.
     *
     * Reported fields:
     * - value
     *
     * Also the metadata (tags, metric group, metric name) and the date is included.
     *
     * @protected
     * @param {Gauge<any>} gauge
     * @param {LoggerReportingContext<Gauge<any>>} ctx
     * @returns {LogLine}
     * @memberof LoggerReporter
     */
    protected reportGauge(gauge: Gauge<any>, ctx: LoggerReportingContext<Gauge<any>>): LogLine {
        if (!isNaN(gauge.getValue())) {
            const name = gauge.getName();
            ctx.logMetadata.measurement = name;
            ctx.logMetadata.group = gauge.getGroup();
            ctx.logMetadata.tags = this.buildTags(ctx.registry, gauge);
            return {
                message: `${ctx.date} - gauge ${name}: ${gauge.getValue()}`,
                metadata: Object.assign({}, ctx.logMetadata),
            };
        }
        return null;
    }

    /**
     * Builds the log message for the given {@link Histogram} if the value of
     * {@link Histogram#getCount()} is a valid number.
     *
     * Reported fields:
     * - count
     * - max (max value)
     * - mean (mean value)
     * - min (min value)
     * - p50 (value of the 50% boundary)
     * - p75 (value of the 75% boundary)
     * - p95 (value of the 95% boundary)
     * - p98 (value of the 98% boundary)
     * - p99 (value of the 99% boundary)
     * - p999 (value of the 99.9% boundary)
     * - stddev (average deviation among the values)
     *
     * Also the metadata (tags, metric group, metric name) and the date is included.
     *
     * @protected
     * @param {Histogram} histogram
     * @param {LoggerReportingContext<Histogram>} ctx
     * @returns {LogLine}
     * @memberof LoggerReporter
     */
    protected reportHistogram(histogram: Histogram, ctx: LoggerReportingContext<Histogram>): LogLine {
        if (!isNaN(histogram.getCount())) {
            const name = histogram.getName();
            const snapshot = histogram.getSnapshot();

            ctx.logMetadata.measurement = name;
            ctx.logMetadata.group = histogram.getGroup();
            ctx.logMetadata.tags = this.buildTags(ctx.registry, histogram);
            return {
                message: `${ctx.date} - histogram ${name}\
                            \n\tcount: ${histogram.getCount()}\
                            \n\tmax: ${this.getNumber(snapshot.getMax())}\
                            \n\tmean: ${this.getNumber(snapshot.getMean())}\
                            \n\tmin: ${this.getNumber(snapshot.getMin())}\
                            \n\tp50: ${this.getNumber(snapshot.getMedian())}\
                            \n\tp75: ${this.getNumber(snapshot.get75thPercentile())}\
                            \n\tp95: ${this.getNumber(snapshot.get95thPercentile())}\
                            \n\tp98: ${this.getNumber(snapshot.get98thPercentile())}\
                            \n\tp99: ${this.getNumber(snapshot.get99thPercentile())}\
                            \n\tp999: ${this.getNumber(snapshot.get999thPercentile())}\
                            \n\tstddev: ${this.getNumber(snapshot.getStdDev())}`,
                metadata: Object.assign({}, ctx.logMetadata),
            };
        }
        return null;
    }

    /**
     * Builds the log message for the given {@link Meter} if the value of
     * {@link Meter#getCount()} is a valid number.
     *
     * Reported fields:
     * - count
     * - m15_rate (15 min rate)
     * - m5_rate (5 min rate)
     * - m1_rate (1 min rate)
     * - mean_rate
     *
     * Also the metadata (tags, metric group, metric name) and the date is included.
     *
     * @protected
     * @param {Meter} meter
     * @param {LoggerReportingContext<Meter>} ctx
     * @returns {LogLine}
     * @memberof LoggerReporter
     */
    protected reportMeter(meter: Meter, ctx: LoggerReportingContext<Meter>): LogLine {
        if (!isNaN(meter.getCount())) {
            const name = meter.getName();

            ctx.logMetadata.measurement = name;
            ctx.logMetadata.group = meter.getGroup();
            ctx.logMetadata.tags = this.buildTags(ctx.registry, meter);
            return {
                message: `${ctx.date} - meter ${name}\
                            \n\tcount: ${meter.getCount()}\
                            \n\tm15_rate: ${this.getNumber(meter.get15MinuteRate())}\
                            \n\tm5_rate: ${this.getNumber(meter.get5MinuteRate())}\
                            \n\tm1_rate: ${this.getNumber(meter.get1MinuteRate())}\
                            \n\tmean_rate: ${this.getNumber(meter.getMeanRate())}`,
                metadata: Object.assign({}, ctx.logMetadata),
            };
        }
        return null;
    }

    /**
     * Builds the log message for the given {@link Timer} if the value of
     * {@link Timer#getCount()} is a valid number.
     *
     * Reported fields:
     * - count
     * - max (max value)
     * - mean (mean value)
     * - min (min value)
     * - p50 (value of the 50% boundary)
     * - p75 (value of the 75% boundary)
     * - p95 (value of the 95% boundary)
     * - p98 (value of the 98% boundary)
     * - p99 (value of the 99% boundary)
     * - p999 (value of the 99.9% boundary)
     * - stddev (average deviation among the values)
     * - m15_rate (15 min rate)
     * - m5_rate (5 min rate)
     * - m1_rate (1 min rate)
     * - mean_rate
     *
     * Also the metadata (tags, metric group, metric name) and the date is included.
     *
     * @protected
     * @param {Timer} timer
     * @param {LoggerReportingContext<Timer>} ctx
     * @returns {LogLine}
     * @memberof LoggerReporter
     */
    protected reportTimer(timer: Timer, ctx: LoggerReportingContext<Timer>): LogLine {
        if (!isNaN(timer.getCount())) {
            const name = timer.getName();
            const snapshot = timer.getSnapshot();

            ctx.logMetadata.measurement = name;
            ctx.logMetadata.group = timer.getGroup();
            ctx.logMetadata.tags = this.buildTags(ctx.registry, timer);
            return {
                message: `${ctx.date} - timer ${name}\
                            \n\tcount: ${timer.getCount()}\
                            \n\tm15_rate: ${this.getNumber(timer.get15MinuteRate())}\
                            \n\tm5_rate: ${this.getNumber(timer.get5MinuteRate())}\
                            \n\tm1_rate: ${this.getNumber(timer.get1MinuteRate())}\
                            \n\tmean_rate: ${this.getNumber(timer.getMeanRate())}\
                            \n\tmax: ${this.getNumber(snapshot.getMax())}\
                            \n\tmean: ${this.getNumber(snapshot.getMean())}\
                            \n\tmin: ${this.getNumber(snapshot.getMin())}\
                            \n\tp50: ${this.getNumber(snapshot.getMedian())}\
                            \n\tp75: ${this.getNumber(snapshot.get75thPercentile())}\
                            \n\tp95: ${this.getNumber(snapshot.get95thPercentile())}\
                            \n\tp98: ${this.getNumber(snapshot.get98thPercentile())}\
                            \n\tp99: ${this.getNumber(snapshot.get99thPercentile())}\
                            \n\tp999: ${this.getNumber(snapshot.get999thPercentile())}\
                            \n\tstddev: ${this.getNumber(snapshot.getStdDev())}`,
                metadata: Object.assign({}, ctx.logMetadata),
            };
        }
        return null;
    }

}
