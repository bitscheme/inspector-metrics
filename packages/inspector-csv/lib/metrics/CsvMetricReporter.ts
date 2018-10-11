import "source-map-support";

import {
    Clock,
    Counter,
    Gauge,
    Histogram,
    Meter,
    Metric,
    MetricRegistry,
    MetricReporter,
    MILLISECOND,
    MonotoneCounter,
    Scheduler,
    StdClock,
    Taggable,
    Timer,
    TimeUnit,
} from "inspector-metrics";

/**
 * Enumeration of all metric types.
 */
export type MetricType = "counter" | "gauge" | "histogram" | "meter" | "timer";

/**
 * Utility interface to track report-timestamps and -values of metric instances.
 * This is directly linked to the minimum-reporting timeout, which ensures
 * that a certain value gets reported at least in a certain amount of time
 * e.g. every minute without the value being having changed. On the other hand
 * to not report values that haven't changed.
 *
 * @interface MetricEntry
 */
interface MetricEntry {
    /**
     * timestamp of the latest report.
     *
     * @type {number}
     * @memberof MetricEntry
     */
    lastReport: number;
    /**
     * value that got reported as latest.
     *
     * @type {number}
     * @memberof MetricEntry
     */
    lastValue: number;
}

export type ColumnType = "date" | "name" | "field" | "group" | "description" | "value" | "tags" | "type" | "metadata";
export type Row = string[];
export type Rows = Row[];

export enum ExportMode {
    ALL_IN_ONE_COLUMN,
    EACH_IN_OWN_COLUMN,
}

export interface CsvFileWriter {
    init(dir: string, file: string, header: Row): Promise<void>;
    writeRow(metric: Metric, values: Row): Promise<void>;
}

export class CsvMetricReporterOptions {

    public readonly writer: CsvFileWriter;
    public readonly interval: number;
    public readonly unit: TimeUnit;
    public readonly writeHeaders: boolean;
    public readonly useSingleQuotes: boolean;
    public readonly tagExportMode: ExportMode;
    public readonly metadataExportMode: ExportMode;
    public readonly delimiter: string;
    public readonly tagColumnPrefix: string;
    public readonly metadataColumnPrefix: string;
    public readonly columns: ColumnType[];
    public readonly encoding: string;
    public readonly filename: () => Promise<string>;
    public readonly dir: () => Promise<string>;
    public readonly tagFilter: (metric: Metric, tag: string, value: string) => Promise<boolean>;
    public readonly metadataFilter: (metric: Metric, key: string, value: any) => Promise<boolean>;

    public constructor({
        writer,
        interval = 1000,
        unit = MILLISECOND,
        writeHeaders = true,
        useSingleQuotes = false,
        tagExportMode = ExportMode.ALL_IN_ONE_COLUMN,
        metadataExportMode = ExportMode.ALL_IN_ONE_COLUMN,
        delimiter = ",",
        tagColumnPrefix = "tag_",
        metadataColumnPrefix = "meta_",
        columns = [],
        encoding = "utf8",
        filename = async () => "metrics.csv",
        dir = async () => "/tmp",
        tagFilter = async () => true,
        metadataFilter = async () => true,
    }: {
        writer: CsvFileWriter,
        interval?: number,
        unit?: TimeUnit,
        writeHeaders?: boolean,
        useSingleQuotes?: boolean,
        tagExportMode?: ExportMode,
        metadataExportMode?: ExportMode,
        delimiter?: string,
        tagColumnPrefix?: string,
        metadataColumnPrefix?: string,
        columns?: ColumnType[],
        encoding?: string,
        filename?: () => Promise<string>,
        dir?: () => Promise<string>,
        tagFilter?: (metric: Metric, tag: string, value: string) => Promise<boolean>,
        metadataFilter?: (metric: Metric, key: string, value: any) => Promise<boolean>,
    }) {
        this.writer = writer;
        this.interval = interval;
        this.unit = unit;
        this.writeHeaders = writeHeaders;
        this.useSingleQuotes = useSingleQuotes;
        this.tagExportMode = tagExportMode;
        this.metadataExportMode = metadataExportMode;
        this.delimiter = delimiter;
        this.tagColumnPrefix = tagColumnPrefix;
        this.metadataColumnPrefix = metadataColumnPrefix;
        this.columns = columns;
        this.encoding = encoding;
        this.filename = filename;
        this.dir = dir;
        this.tagFilter = tagFilter;
        this.metadataFilter = metadataFilter;
    }
}

/**
 * Metric reporter for csv files.
 *
 * @export
 * @class CsvMetricReporter
 * @extends {MetricReporter}
 */
export class CsvMetricReporter extends MetricReporter {

    private readonly options: CsvMetricReporterOptions;
    private tags: Map<string, string>;
    private clock: Clock;
    private minReportingTimeout: number;
    private scheduler: Scheduler;
    private timer: NodeJS.Timer;
    private metricStates: Map<number, MetricEntry> = new Map();
    private header: Row;

    /**
     * Creates an instance of CsvMetricReporter.
     *
     * @param {Map<string, string>} [tags=new Map()]
     * @param {Clock} [clock=new StdClock()]
     * @param {number} [minReportingTimeout=1]
     *     timeout in minutes a metric need to be included in the report without having changed
     * @memberof CsvMetricReporter
     */
    public constructor(
        options: CsvMetricReporterOptions,
        tags: Map<string, string> = new Map(),
        clock: Clock = new StdClock(),
        minReportingTimeout = 1,
        scheduler: Scheduler = setInterval) {
        super();

        this.options = options;
        // this.tags = tags;
        this.clock = clock;
        this.minReportingTimeout = minReportingTimeout;
        this.scheduler = scheduler;
    }

    public getTags(): Map<string, string> {
        return this.tags;
    }

    public setTags(tags: Map<string, string>): void {
        this.tags = tags;
    }

    public async start(): Promise<void> {
        const interval: number = this.options.unit.convertTo(this.options.interval, MILLISECOND);
        if (this.metricRegistries && this.metricRegistries.length > 0) {
            this.header = await this.buildHeaders();
        }
        this.timer = this.scheduler(() => this.report(), interval);
    }

    public stop(): void {
        if (this.timer) {
            this.timer.unref();
        }
    }

    private async report() {
        if (this.metricRegistries && this.metricRegistries.length > 0) {
            const dir = await this.options.dir();
            const file = await this.options.filename();

            this.options.writer.init(dir, file, this.header);
            this.metricRegistries.forEach((registry) => this.reportMetricRegistry(registry));
        }
    }

    private async buildHeaders(): Promise<Row> {
        const headers: Row = [];

        for (const columnType of this.options.columns) {
            if (columnType === "metadata") {
                if (this.options.metadataExportMode === ExportMode.ALL_IN_ONE_COLUMN) {
                    headers.push(columnType);
                } else {
                    const metadataNames = new Set();
                    this.metricRegistries
                        .map((registry) => registry.getMetricList())
                        .map((metrics) => metrics.map((metric) => metric.getMetadataMap()))
                        .forEach((metadataMapArray) => {
                            metadataMapArray.forEach((metadataMap) => {
                                for (const metadataName of metadataMap.keys()) {
                                    metadataNames.add(metadataName);
                                }
                            });
                        });
                    const tasks: Array<Promise<any>> = [];
                    metadataNames.forEach((metadataName) => {
                        tasks.push((async () => {
                            if (
                                !this.options.metadataFilter ||
                                await this.options.metadataFilter(null, metadataName, null)) {
                                headers.push(`${this.options.metadataColumnPrefix}${metadataName}`);
                            }
                        })());
                    });
                    await Promise.all(tasks);
                }
            } else if (columnType === "tags") {
                if (this.options.tagExportMode === ExportMode.ALL_IN_ONE_COLUMN) {
                    headers.push(columnType);
                } else {
                    const tags = new Set();
                    this.tags.forEach((value, tag) => tags.add(tag));
                    this.metricRegistries
                        .map((registry) => registry.getMetricList())
                        .map((metrics) => metrics.map((metric) => this.buildTags(metric)))
                        .forEach((metricTagsArray) => {
                            metricTagsArray.forEach((metricTags) => {
                                Object.keys(metricTags).forEach((tag) => tags.add(tag));
                            });
                        });
                    const tasks: Array<Promise<any>> = [];
                    tags.forEach((tag) => {
                        tasks.push((async () => {
                            if (!this.options.tagFilter || await this.options.tagFilter(null, tag, null)) {
                                headers.push(`${this.options.tagColumnPrefix}${tag}`);
                            }
                        })());
                    });
                    await Promise.all(tasks);
                }
            } else {
                headers.push(columnType);
            }
        }

        return headers;
    }

    private reportMetricRegistry(registry: MetricRegistry): void {
        const now: Date = new Date(this.clock.time().milliseconds);

        this.reportMetrics(registry.getMonotoneCounterList(), now, "counter",
            (counter: MonotoneCounter, date: Date) => this.reportCounter(counter, date),
            (counter: MonotoneCounter) => counter.getCount());
        this.reportMetrics(registry.getCounterList(), now, "counter",
            (counter: Counter, date: Date) => this.reportCounter(counter, date),
            (counter: Counter) => counter.getCount());
        this.reportMetrics(registry.getGaugeList(), now, "gauge",
            (gauge: Gauge<any>, date: Date) => this.reportGauge(gauge, date),
            (gauge: Gauge<any>) => gauge.getValue());
        this.reportMetrics(registry.getHistogramList(), now, "histogram",
            (histogram: Histogram, date: Date) => this.reportHistogram(histogram, date),
            (histogram: Histogram) => histogram.getCount());
        this.reportMetrics(registry.getMeterList(), now, "meter",
            (meter: Meter, date: Date) => this.reportMeter(meter, date),
            (meter: Meter) => meter.getCount());
        this.reportMetrics(registry.getTimerList(), now, "timer",
            (timer: Timer, date: Date) => this.reportTimer(timer, date),
            (timer: Timer) => timer.getCount());
    }

    private reportMetrics<T extends Metric>(
        metrics: T[],
        date: Date,
        type: MetricType,
        reportFunction: (metric: Metric, date: Date) => Rows,
        lastModifiedFunction: (metric: Metric) => number): void {

        metrics.forEach((metric) => {
            const metricId = (metric as any).id;
            let changed = true;
            if (metricId) {
                changed = this.hasChanged(metricId, lastModifiedFunction(metric), date);
            }

            if (changed) {
                const rows = reportFunction(metric, date);
                if (rows.length > 0) {
                    this.writeRows(metric, rows, type);
                }
            }
        });
    }

    private hasChanged(metricId: number, lastValue: number, date: Date): boolean {
        let changed = true;
        let metricEntry = {
            lastReport: 0,
            lastValue,
        };
        if (this.metricStates.has(metricId)) {
            metricEntry = this.metricStates.get(metricId);
            changed = metricEntry.lastValue !== lastValue;
            if (!changed) {
                changed = metricEntry.lastReport + this.minReportingTimeout < date.getTime();
            }
        }
        if (changed) {
            metricEntry.lastReport = date.getTime();
        }
        this.metricStates.set(metricId, metricEntry);
        return changed;
    }

    private reportCounter(timer: MonotoneCounter, date: Date): Rows {
        // TODO:
        return [];
    }

    private reportGauge(gauge: Gauge<any>, date: Date): Rows {
        // TODO:
        return [];
    }

    private reportHistogram(histogram: Histogram, date: Date): Rows {
        // TODO:
        return [];
    }

    private reportMeter(meter: Meter, date: Date): Rows {
        // TODO:
        return [];
    }

    private reportTimer(timer: Timer, date: Date): Rows {
        // TODO:
        return [];
    }

    private writeRows<T extends Metric>(metric: T, rows: Rows, type: MetricType): void {
        for (const row of rows) {
            this.options.writer.writeRow(metric, row);
        }
    }

    private buildTags(taggable: Taggable): { [key: string]: string } {
        const tags: { [x: string]: string } = {};
        this.tags.forEach((tag, key) => tags[key] = tag);
        taggable.getTags().forEach((tag, key) => tags[key] = tag);
        return tags;
    }

    // private getNumber(value: number): number {
    //     if (isNaN(value)) {
    //         return 0;
    //     }
    //     return value;
    // }

}