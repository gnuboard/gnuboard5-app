/**
 * 상품 목록 필터 (PLAN T-P1C-03) — 가로 칩 두 줄: 정렬(하나 선택) · 상품 유형(여러 개) + 가격 구간(하나, 다시 누르면 해제).
 * 품절 포함 토글은 없다 — 서버가 항상 빼므로 목록 위 안내 문구로 알린다.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { ProductListFilter, ProductSort } from '../../../entities/product/model';
import { t } from '../../../shared/i18n';
import { Chip } from '../../../shared/ui/Chip';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { PRICE_RANGES, PRODUCT_TYPES, activePriceRange, toggleType, withPriceRange } from './productListModel';

const VISIBLE_SORTS: readonly ProductSort[] = ['default', 'latest', 'popular', 'price_asc', 'price_desc', 'reviews'];

interface Props {
  filter: ProductListFilter;
  onChange: (next: ProductListFilter) => void;
}

function ChipRow({ children, testID }: { children: React.ReactNode; testID: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID={testID}>
      {children}
    </ScrollView>
  );
}

/** 정렬 칩 한 줄 — 상품 목록과 기획전 상세가 함께 쓴다. */
export function SortChips({
  sort,
  onChange,
  testID = 'product-sort-chips',
}: {
  sort: ProductSort;
  onChange: (next: ProductSort) => void;
  testID?: string;
}) {
  return (
    <ChipRow testID={testID}>
      {VISIBLE_SORTS.map((option) => (
        <Chip
          key={option}
          testID={`product-sort-${option}`}
          label={t(`shop.sort_${option}`)}
          selected={sort === option}
          onPress={() => onChange(option)}
        />
      ))}
    </ChipRow>
  );
}

export function ProductFilterBar({ filter, onChange }: Props) {
  const sort = filter.sort ?? 'default';
  const price = activePriceRange(filter);
  return (
    <>
      <SortChips sort={sort} onChange={(next) => onChange({ ...filter, sort: next })} />
      <ChipRow testID="product-type-chips">
        {PRODUCT_TYPES.map((type) => (
          <Chip
            key={type}
            testID={`product-type-${type}`}
            label={t(`shop.type_${type}`)}
            selected={filter.types?.includes(type) ?? false}
            onPress={() => onChange(toggleType(filter, type))}
          />
        ))}
        {PRICE_RANGES.map((range) => (
          <Chip
            key={range.key}
            testID={`product-price-${range.key}`}
            label={t(`shop.price_${range.key}`)}
            selected={price?.key === range.key}
            onPress={() => onChange(withPriceRange(filter, price?.key === range.key ? null : range))}
          />
        ))}
      </ChipRow>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACE[2], paddingHorizontal: SPACE[4], paddingVertical: SPACE[1] },
});
