/**
 * 블록 노드 렌더 (T-P1B-04): 문단·제목·목록·인용·코드·표·이미지·iframe 카드. 순수 RN View/Text/ScrollView.
 * 블록 안의 인라인 형제는 하나의 Text 로 묶고, 블록 자식은 재귀로 View 를 쌓는다.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { t } from '../i18n';
import { AppText } from '../ui/AppText';
import { RADII, SPACE } from '../ui/tokens/primitive';
import { textStyle } from '../ui/tokens/type';
import { ExternalImagePlaceholder, HtmlImage } from './HtmlImage';
import { isBlankRun, renderInlineRun, type InlineContext } from './htmlInline';
import { BLOCK_TAGS, headingStyle, parseInlineStyle } from './htmlStyles';
import type { HtmlElementNode, HtmlNode } from './parse';
import { EXTERNAL_IMAGE_ATTRIBUTE } from './sanitize';

export interface BlockContext extends InlineContext {
  width: number;
  onImagePress?: (uri: string, alt: string | undefined) => void;
}

function isBlock(node: HtmlNode): node is HtmlElementNode {
  return node.type === 'element' && BLOCK_TAGS.has(node.tag);
}

/** 자식을 인라인 묶음 / 블록으로 나눠 순서대로 그린다. */
export function renderChildren(
  nodes: readonly HtmlNode[],
  ctx: BlockContext,
  override?: StyleProp<TextStyle>,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let run: HtmlNode[] = [];
  const flush = () => {
    if (run.length > 0 && !isBlankRun(run)) {
      out.push(
        <Text key={`t${out.length}`} style={[textStyle('body'), { color: ctx.colors.onSurface }, override]}>
          {renderInlineRun(run, ctx)}
        </Text>,
      );
    }
    run = [];
  };
  for (const node of nodes) {
    if (isBlock(node)) {
      flush();
      out.push(<BlockNode key={`b${out.length}`} node={node} ctx={ctx} />);
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

function BlockNode({ node, ctx }: { node: HtmlElementNode; ctx: BlockContext }) {
  const inlineStyle = ctx.allowStyle ? parseInlineStyle(node.attrs.style) : undefined;
  switch (node.tag) {
    case 'img':
      return <ImageBlock node={node} ctx={ctx} />;
    case 'iframe':
      return <IframeCard src={node.attrs.src} onOpen={ctx.onLinkPress} />;
    case 'hr':
      return <View style={[styles.rule, { backgroundColor: ctx.colors.outlineSubtle }]} />;
    case 'ul':
    case 'ol':
      return <ListBlock node={node} ctx={ctx} />;
    case 'blockquote':
      return (
        <View style={[styles.quote, { borderLeftColor: ctx.colors.outline }]}>
          {renderChildren(node.children, ctx)}
        </View>
      );
    case 'pre':
      return (
        <View style={[styles.pre, { backgroundColor: ctx.colors.surfaceContainer }]}>
          {renderChildren(node.children, ctx, styles.mono)}
        </View>
      );
    case 'table':
      return <TableBlock node={node} ctx={ctx} />;
    default:
      return (
        <View style={[styles.block, inlineStyle?.textAlign ? { alignItems: alignOf(inlineStyle.textAlign) } : null]}>
          {renderChildren(node.children, ctx, [headingStyle(node.tag), inlineStyle])}
        </View>
      );
  }
}

function alignOf(textAlign: TextStyle['textAlign']): 'flex-start' | 'center' | 'flex-end' | 'stretch' {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'stretch';
}

function ImageBlock({ node, ctx }: { node: HtmlElementNode; ctx: BlockContext }) {
  const external = node.attrs[EXTERNAL_IMAGE_ATTRIBUTE];
  if (external) return <ExternalImagePlaceholder url={external} alt={node.attrs.alt} onOpen={ctx.onLinkPress} />;
  if (!node.attrs.src) return null;
  return <HtmlImage uri={node.attrs.src} alt={node.attrs.alt} width={ctx.width} onPress={ctx.onImagePress} />;
}

function ListBlock({ node, ctx }: { node: HtmlElementNode; ctx: BlockContext }) {
  const items = node.children.filter(
    (child): child is HtmlElementNode => child.type === 'element' && child.tag === 'li',
  );
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[textStyle('body'), styles.bullet, { color: ctx.colors.onSurfaceSecondary }]}>
            {node.tag === 'ol' ? `${index + 1}.` : '•'}
          </Text>
          <View style={styles.listBody}>{renderChildren(item.children, ctx)}</View>
        </View>
      ))}
    </View>
  );
}

/** 한 번에 그리는 표 행 상한 — 가상화 없는 ScrollView 라 수천 행은 UI 스레드를 멈춘다. */
export const MAX_TABLE_ROWS = 200;

function TableBlock({ node, ctx }: { node: HtmlElementNode; ctx: BlockContext }) {
  const allRows = collectRows(node);
  const rows = allRows.slice(0, MAX_TABLE_ROWS);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll} testID="html-table">
      <View style={[styles.table, { borderColor: ctx.colors.outlineSubtle }]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { borderColor: ctx.colors.outlineSubtle }]}>
            {row.map((cell, cellIndex) => (
              <View
                key={cellIndex}
                style={[
                  styles.cell,
                  { borderColor: ctx.colors.outlineSubtle },
                  cell.tag === 'th' ? { backgroundColor: ctx.colors.surfaceContainer } : null,
                ]}
              >
                {renderChildren(cell.children, ctx, cell.tag === 'th' ? { fontWeight: '700' } : undefined)}
              </View>
            ))}
          </View>
        ))}
        {allRows.length > rows.length ? (
          <AppText variant="caption" tone="onSurfaceCaption" testID="html-table-truncated">
            {t('html.table_truncated', { shown: rows.length, total: allRows.length })}
          </AppText>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** table > (thead|tbody)? > tr > td|th — 중간 래퍼는 건너뛴다. */
function collectRows(table: HtmlElementNode): HtmlElementNode[][] {
  const rows: HtmlElementNode[][] = [];
  const visit = (nodes: readonly HtmlNode[]) => {
    for (const node of nodes) {
      if (node.type !== 'element') continue;
      if (node.tag === 'tr') {
        rows.push(
          node.children.filter((c): c is HtmlElementNode => c.type === 'element' && (c.tag === 'td' || c.tag === 'th')),
        );
      } else {
        visit(node.children);
      }
    }
  };
  visit(table.children);
  return rows;
}

const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

export function youtubeThumbnail(src: string | undefined): string | undefined {
  const id = src ? YOUTUBE_ID.exec(src)?.[1] : undefined;
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

const IFRAME_THUMBNAIL_WIDTH = 320;

/** content 정책 iframe(youtube/vimeo) — MVP 는 썸네일 + 외부 열기 카드. */
function IframeCard({ src, onOpen }: { src: string | undefined; onOpen?: (href: string) => void }) {
  if (!src) return null;
  const thumbnail = youtubeThumbnail(src);
  return (
    <Pressable
      onPress={onOpen ? () => onOpen(src) : undefined}
      accessibilityRole="link"
      accessibilityLabel={t('html.open_external')}
      style={styles.iframe}
      testID="html-iframe-card"
    >
      {thumbnail ? <HtmlImage uri={thumbnail} width={IFRAME_THUMBNAIL_WIDTH} /> : null}
      <AppText variant="label" tone="link">
        {t('html.open_external')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { marginVertical: SPACE[1] },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: SPACE[3] },
  quote: { borderLeftWidth: 3, paddingLeft: SPACE[3], marginVertical: SPACE[2] },
  pre: { borderRadius: RADII.sm, padding: SPACE[3], marginVertical: SPACE[2] },
  mono: { fontFamily: 'monospace' },
  list: { marginVertical: SPACE[1], gap: SPACE[1] },
  listItem: { flexDirection: 'row', gap: SPACE[2] },
  bullet: { minWidth: 18 },
  listBody: { flex: 1 },
  tableScroll: { marginVertical: SPACE[2] },
  table: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { minWidth: 96, maxWidth: 240, padding: SPACE[2], borderRightWidth: StyleSheet.hairlineWidth },
  iframe: { gap: SPACE[2], marginVertical: SPACE[2], alignItems: 'flex-start' },
});
