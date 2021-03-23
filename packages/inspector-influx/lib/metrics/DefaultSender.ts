import "source-map-support/register"
import {
  InfluxDB,
  ClientOptions,
  Point,
  WritePrecisionType,
} from "@influxdata/influxdb-client"
import {
  BucketsAPI,
  OrgsAPI,
  RetentionRules,
} from "@influxdata/influxdb-client-apis"
import { Sender } from "./InfluxMetricReporter"

/**
 * Default implementation for an influxdb sender.
 *
 * @export
 * @class DefaultSender
 * @implements {Sender}
 */
export class DefaultSender implements Sender {
  /**
   * The InfluxDB client instance.
   *
   * @private
   * @type {InfluxDB}
   * @memberof DefaultSender
   */
  private readonly db: InfluxDB
  /**
   * The InfluxDB bucket name
   *
   * @private
   * @type {string}
   * @memberof DefaultSender
   */
  private readonly bucket: string
  /**
   * The InfluxDB org name
   * 
   * @private
   * @type {string}
   * @memberof DefaultSender
   */
  private readonly org: string
  /**
   * The InfluxDB retention rules (optional)
   * 
   * @private
   * @type {RetentionRules}
   * @memberof DefaultSender
   */
  private readonly retentionRules?: RetentionRules
  /**
   * Indicates if he sender is ready to report metrics.
   *
   * @private
   * @type {boolean}
   * @memberof DefaultSender
   */
  private ready: boolean = false
  /**
   * Defines the precision for the write operations.
   *
   * @private
   * @type {WritePrecisionType}
   * @memberof DefaultSender
   */
  private readonly precision: WritePrecisionType

  /**
   * Creates an instance of DefaultSender.
   *
   * @param {ClientOptions} clientOptions
   * @param {string} org The organization name
   * @param {string} bucket The bucket name
   * @param {RetentionRules} [retentionRules] The retention rules
   * @param {WritePrecisionType} [precision="s"] will be passed to write-options
   * @memberof DefaultSender
   */
  public constructor(
    clientOptions: ClientOptions,
    org: string,
    bucket: string,
    retentionRules?: RetentionRules,
    precision: WritePrecisionType = "s"
  ) {
    this.org = org
    this.bucket = bucket
    this.retentionRules = retentionRules
    this.precision = precision
    this.db = new InfluxDB(clientOptions)
  }

  /**
   * Ensures that a bucket exists before sending data.
   *
   * @memberof DefaultSender
   */
  public async init(): Promise<any> {
    const orgsAPI = new OrgsAPI(this.db)
    const {
      orgs: [org],
    } = await orgsAPI.getOrgs({
      org: this.org,
    })

    const bucketsAPI = new BucketsAPI(this.db)
    const {
      buckets: [bucket],
    } = await bucketsAPI.getBuckets({
      orgID: org.id,
      name: this.bucket,
    })

    if (!bucket) {
      await bucketsAPI.postBuckets({
        body: {
          retentionRules: this.retentionRules,
          orgID: org.id,
          name: this.bucket,
        },
      })
    }
    this.ready = true
  }

  /**
   * Gets the ready state.
   *
   * @returns {Promise<boolean>}
   * @memberof DefaultSender
   */
  public async isReady(): Promise<boolean> {
    return this.ready
  }

  /**
   * Sends the specified data points to the DB.
   *
   * @param {Point[]} points
   * @returns {Promise<void>}
   * @memberof DefaultSender
   */
  public async send(points: Point[]): Promise<void> {
    return this.db
      .getWriteApi(this.org, this.bucket, this.precision)
      .writePoints(points)
  }
}
