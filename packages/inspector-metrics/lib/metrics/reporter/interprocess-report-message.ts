import "source-map-support/register";

import { SerializableMetric } from "../model/metric";
import { Tags } from "../model/taggable";
import { OverallReportContext } from "./overall-report-context";
import { ReportingResult } from "./reporting-result";

/**
 * Interface for reports from reporters in forked processes.
 *
 * @export
 * @interface InterprocessReportMessage
 * @template T
 */
export interface InterprocessReportMessage<T> {
    /**
     * Reporting context from forked process.
     *
     * @type {OverallReportContext}
     * @memberof InterprocessReportMessage
     */
    ctx: OverallReportContext;
    /**
     * Date from report function in forked process.
     *
     * @type {Date}
     * @memberof InterprocessReportMessage
     */
    date: Date;
    /**
     * Tags from originating {@link MetricRegistry}.
     *
     * @type {Tags}
     * @memberof InterprocessReportMessage
     */
    tags: Tags;
    /**
     * Collection of metric reporting results from forked process.
     *
     * @type {{
     *         counters: Array<ReportingResult<SerializableMetric, T>>;
     *         gauges: Array<ReportingResult<SerializableMetric, T>>;
     *         histograms: Array<ReportingResult<SerializableMetric, T>>;
     *         meters: Array<ReportingResult<SerializableMetric, T>>;
     *         monotoneCounters: Array<ReportingResult<SerializableMetric, T>>;
     *         timers: Array<ReportingResult<SerializableMetric, T>>;
     *     }}
     * @memberof InterprocessReportMessage
     */
    metrics: {
        counters: Array<ReportingResult<SerializableMetric, T>>;
        gauges: Array<ReportingResult<SerializableMetric, T>>;
        histograms: Array<ReportingResult<SerializableMetric, T>>;
        meters: Array<ReportingResult<SerializableMetric, T>>;
        monotoneCounters: Array<ReportingResult<SerializableMetric, T>>;
        timers: Array<ReportingResult<SerializableMetric, T>>;
    };
    /**
     * Type of the reported which sent the metrics to the master process.
     *
     * @type {string}
     * @memberof InterprocessReportMessage
     */
    targetReporterType: string;
    /**
     * The type property of the message sent to the master process.
     *
     * @type {string}
     * @memberof InterprocessReportMessage
     */
    type: string;
}

/**
 * Sender abstraction for sending a {@link InterprocessReportMessage} object.
 * Compatible with {@code cluster.worker.send}.
 *
 * @exports
 * @type {(message: InterprocessReportMessage<T>) => any}
 * @template T
 */
export type InterprocessReportMessageSender = <T> (message: InterprocessReportMessage<T>) => any;
