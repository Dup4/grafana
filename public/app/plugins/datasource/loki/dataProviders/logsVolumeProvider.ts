import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  FieldCache,
  FieldColorModeId,
  FieldConfig,
  FieldType,
  LogLevel,
  LogsVolume,
  MutableDataFrame,
  QueryRelatedDataProvider,
  toDataFrame,
} from '@grafana/data';
import { LokiQuery } from '../types';
import { Observable, SubscriptionLike } from 'rxjs';
import { cloneDeep } from 'lodash';
import LokiDatasource, { isMetricsQuery } from '../datasource';
import { getLogLevelFromLabels } from '../../../../features/explore/state/utils';
import { LogLevelColor } from '../../../../core/logs_model';
import { BarAlignment, GraphDrawStyle, StackingMode } from '@grafana/schema';

export class LokiLogsVolumeProvider implements QueryRelatedDataProvider<LogsVolume> {
  private readonly datasource: LokiDatasource;
  private readonly dataQueryRequest: DataQueryRequest<LokiQuery>;
  private rawLogsVolume: DataFrame[] = [];
  private currentSubscription?: SubscriptionLike;

  constructor(datasource: LokiDatasource, dataQueryRequest: DataQueryRequest<LokiQuery>) {
    this.datasource = datasource;
    this.dataQueryRequest = dataQueryRequest;
  }

  getData(): Observable<LogsVolume> {
    if (this.currentSubscription) {
      this.currentSubscription.unsubscribe();
      this.currentSubscription = undefined;
    }

    const histogramRequest = cloneDeep(this.dataQueryRequest);
    histogramRequest.targets = histogramRequest.targets
      .filter((target) => !isMetricsQuery(target.expr))
      .map((target) => {
        // TODO: add level to configuration and use:
        // sum by (level) (count_over_time(${target.expr}[$__interval])
        return {
          ...target,
          expr: `count_over_time(${target.expr}[$__interval])`,
        };
      });

    return new Observable((observer) => {
      observer.next({
        isLoading: true,
        error: undefined,
        data: [],
      });

      this.currentSubscription = this.datasource.query(histogramRequest).subscribe({
        complete: () => {
          const aggregatedLogsVolume = this.aggregateRawLogsVolume();
          observer.next({
            isLoading: false,
            error: undefined,
            data: aggregatedLogsVolume,
          });
          observer.complete();
        },
        next: (dataQueryResponse: DataQueryResponse) => {
          this.rawLogsVolume = this.rawLogsVolume.concat(dataQueryResponse.data.map(toDataFrame));
        },
        error: (error) => {
          observer.next({
            isLoading: false,
            error: error,
            data: [],
          });
        },
      });
      return () => {
        if (this.currentSubscription) {
          this.currentSubscription.unsubscribe();
          this.currentSubscription = undefined;
        }
      };
    });
  }

  private aggregateRawLogsVolume(): DataFrame[] {
    // Aggregate data frames by level
    const logsVolumeByLevelMap: Record<string, DataFrame[]> = {};
    this.rawLogsVolume.forEach((dataFrame) => {
      const valueField = new FieldCache(dataFrame).getFirstFieldOfType(FieldType.number)!;
      const level: LogLevel = valueField.labels ? getLogLevelFromLabels(valueField.labels) : LogLevel.unknown;
      if (!logsVolumeByLevelMap[level]) {
        logsVolumeByLevelMap[level] = [];
      }
      logsVolumeByLevelMap[level].push(dataFrame);
    });

    // Reduce all data frames to a single data frame containing total value
    return Object.keys(logsVolumeByLevelMap).map((level: LogLevel) => {
      const dataFrames = logsVolumeByLevelMap[level];
      const color = LogLevelColor[level];
      const fieldConfig = {
        displayNameFromDS: level,
        color: {
          mode: FieldColorModeId.Fixed,
          fixedColor: color,
        },
        custom: {
          drawStyle: GraphDrawStyle.Bars,
          barAlignment: BarAlignment.Center,
          barWidthFactor: 0.9,
          barMaxWidth: 5,
          lineColor: color,
          pointColor: color,
          fillColor: color,
          lineWidth: 1,
          fillOpacity: 100,
          stacking: {
            mode: StackingMode.Normal,
            group: 'A',
          },
        },
      };
      return aggregateFields(dataFrames, fieldConfig);
    });
  }
}

/**
 * Create a new data frame with a single field and values creating by adding field values
 * from all provided data frames
 */
function aggregateFields(dataFrames: DataFrame[], config: FieldConfig): DataFrame {
  const aggregatedDataFrame = new MutableDataFrame();
  if (!dataFrames.length) {
    return aggregatedDataFrame;
  }

  const totalLength = dataFrames[0].length;
  const timeField = new FieldCache(dataFrames[0]).getFirstFieldOfType(FieldType.time);

  if (!timeField) {
    return aggregatedDataFrame;
  }

  aggregatedDataFrame.addField({ name: 'Time', type: FieldType.time }, totalLength);
  aggregatedDataFrame.addField({ name: 'Value', type: FieldType.number, config }, totalLength);

  dataFrames.forEach((dataFrame) => {
    dataFrame.fields.forEach((field) => {
      if (field.type === FieldType.number) {
        for (let pointIndex = 0; pointIndex < totalLength; pointIndex++) {
          const currentValue = aggregatedDataFrame.get(pointIndex).Value;
          const valueToAdd = field.values.get(pointIndex);
          const totalValue =
            currentValue === null && valueToAdd === null ? null : (currentValue || 0) + (valueToAdd || 0);
          aggregatedDataFrame.set(pointIndex, { Value: totalValue, Time: timeField.values.get(pointIndex) });
        }
      }
    });
  });

  return aggregatedDataFrame;
}
