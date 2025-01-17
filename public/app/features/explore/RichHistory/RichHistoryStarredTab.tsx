import { css } from '@emotion/css';
import React, { useEffect } from 'react';

import { GrafanaTheme, SelectableValue } from '@grafana/data';
import { stylesFactory, useTheme, Select, MultiSelect, FilterInput } from '@grafana/ui';
import {
  createDatasourcesList,
  SortOrder,
  RichHistorySearchFilters,
  RichHistorySettings,
} from 'app/core/utils/richHistory';
import { RichHistoryQuery, ExploreId } from 'app/types/explore';

import { sortOrderOptions } from './RichHistory';
import RichHistoryCard from './RichHistoryCard';

export interface Props {
  queries: RichHistoryQuery[];
  activeDatasourceInstance?: string;
  updateFilters: (filtersToUpdate: Partial<RichHistorySearchFilters>) => void;
  clearRichHistoryResults: () => void;
  richHistorySearchFilters?: RichHistorySearchFilters;
  richHistorySettings: RichHistorySettings;
  exploreId: ExploreId;
}

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  const bgColor = theme.isLight ? theme.palette.gray5 : theme.palette.dark4;
  return {
    container: css`
      display: flex;
    `,
    containerContent: css`
      width: 100%;
    `,
    selectors: css`
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
    `,
    multiselect: css`
      width: 100%;
      margin-bottom: ${theme.spacing.sm};
      .gf-form-select-box__multi-value {
        background-color: ${bgColor};
        padding: ${theme.spacing.xxs} ${theme.spacing.xs} ${theme.spacing.xxs} ${theme.spacing.sm};
        border-radius: ${theme.border.radius.sm};
      }
    `,
    filterInput: css`
      margin-bottom: ${theme.spacing.sm};
    `,
    sort: css`
      width: 170px;
    `,
    footer: css`
      height: 60px;
      margin-top: ${theme.spacing.lg};
      display: flex;
      justify-content: center;
      font-weight: ${theme.typography.weight.light};
      font-size: ${theme.typography.size.sm};
      a {
        font-weight: ${theme.typography.weight.semibold};
        margin-left: ${theme.spacing.xxs};
      }
    `,
  };
});

export function RichHistoryStarredTab(props: Props) {
  const {
    updateFilters,
    clearRichHistoryResults,
    activeDatasourceInstance,
    richHistorySettings,
    queries,
    richHistorySearchFilters,
    exploreId,
  } = props;

  const theme = useTheme();
  const styles = getStyles(theme);

  const listOfDatasources = createDatasourcesList();

  useEffect(() => {
    const datasourceFilters =
      richHistorySettings.activeDatasourceOnly && activeDatasourceInstance
        ? [activeDatasourceInstance]
        : richHistorySettings.lastUsedDatasourceFilters;
    const filters: RichHistorySearchFilters = {
      search: '',
      sortOrder: SortOrder.Descending,
      datasourceFilters,
      from: 0,
      to: richHistorySettings.retentionPeriod,
      starred: true,
    };
    updateFilters(filters);
    return () => {
      clearRichHistoryResults();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!richHistorySearchFilters) {
    return <span>Loading...</span>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.containerContent}>
        <div className={styles.selectors}>
          {!richHistorySettings.activeDatasourceOnly && (
            <MultiSelect
              className={styles.multiselect}
              menuShouldPortal
              options={listOfDatasources.map((ds) => {
                return { value: ds.name, label: ds.name };
              })}
              value={richHistorySearchFilters.datasourceFilters}
              placeholder="Filter queries for data sources(s)"
              aria-label="Filter queries for data sources(s)"
              onChange={(options: SelectableValue[]) => {
                updateFilters({ datasourceFilters: options.map((option) => option.value) });
              }}
            />
          )}
          <div className={styles.filterInput}>
            <FilterInput
              placeholder="Search queries"
              value={richHistorySearchFilters.search}
              onChange={(search: string) => updateFilters({ search })}
            />
          </div>
          <div aria-label="Sort queries" className={styles.sort}>
            <Select
              menuShouldPortal
              value={sortOrderOptions.filter((order) => order.value === richHistorySearchFilters.sortOrder)}
              options={sortOrderOptions}
              placeholder="Sort queries by"
              onChange={(e: SelectableValue<SortOrder>) => updateFilters({ sortOrder: e.value })}
            />
          </div>
        </div>
        {queries.map((q) => {
          const idx = listOfDatasources.findIndex((d) => d.name === q.datasourceName);
          return (
            <RichHistoryCard
              query={q}
              key={q.id}
              exploreId={exploreId}
              dsImg={idx === -1 ? 'public/img/icn-datasource.svg' : listOfDatasources[idx].imgUrl}
              isRemoved={idx === -1}
            />
          );
        })}
        <div className={styles.footer}>The history is local to your browser and is not shared with others.</div>
      </div>
    </div>
  );
}
