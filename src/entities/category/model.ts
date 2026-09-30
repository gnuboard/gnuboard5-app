/**
 * 쇼핑 카테고리 (PLAN T-P1C-01) — `GET /shop/categories` 는 `children` 이 달린 트리(최대 5단, ca_id 는 단계마다 2자리씩
 * 길어진다: "20" → "2010" → "201010"). 트리는 재귀 스키마로 받고, 화면은 펼친 목록·경로(breadcrumb)를 쓴다.
 */
import { z } from 'zod';
import { numberValue, stringValue } from '../../shared/api/schemaPrimitives';

export const MAX_CATEGORY_DEPTH = 5;
const ID_CHARS_PER_LEVEL = 2;

export interface CategoryNode {
  ca_id: string;
  ca_name: string;
  ca_order: number;
  depth: number;
  item_count: number;
  children: CategoryNode[];
}

export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
  z
    .looseObject({
      ca_id: stringValue,
      ca_name: stringValue,
      ca_order: numberValue,
      depth: numberValue.optional(),
      item_count: numberValue.optional(),
      children: z.array(categoryNodeSchema).optional(),
    })
    .transform((row) => ({
      ca_id: row.ca_id,
      ca_name: row.ca_name,
      ca_order: row.ca_order,
      depth: row.depth ?? Math.ceil(row.ca_id.length / ID_CHARS_PER_LEVEL),
      item_count: row.item_count ?? 0,
      children: row.children ?? [],
    })),
);

export const categoryTreeSchema = z.array(categoryNodeSchema);

/** 깊이 우선으로 펼친다. `MAX_CATEGORY_DEPTH` 보다 깊은 가지는 버린다(서버가 잘못 내려도 화면이 무한히 깊어지지 않게). */
export function flattenCategories(nodes: readonly CategoryNode[], depth = 1): CategoryNode[] {
  if (depth > MAX_CATEGORY_DEPTH) return [];
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children, depth + 1)]);
}

export function findCategory(nodes: readonly CategoryNode[], caId: string): CategoryNode | undefined {
  return flattenCategories(nodes).find((node) => node.ca_id === caId);
}

/** 루트부터 해당 카테고리까지 — ca_id 앞자리(2자리 단위)로 부모를 찾는다. 모르는 id 면 빈 배열. */
export function categoryPath(nodes: readonly CategoryNode[], caId: string): CategoryNode[] {
  const path: CategoryNode[] = [];
  for (let len = ID_CHARS_PER_LEVEL; len <= caId.length; len += ID_CHARS_PER_LEVEL) {
    const node = findCategory(nodes, caId.slice(0, len));
    if (!node) return [];
    path.push(node);
  }
  return path;
}
