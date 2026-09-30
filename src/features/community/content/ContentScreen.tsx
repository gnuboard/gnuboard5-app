/**
 * 콘텐츠 페이지 (PLAN T-P1B-10, PRD CM-10/CM-F11). 메뉴 `me_link` `/content/{co_id}`·딥링크·seo 슬러그로 진입.
 * `co_content` 는 서버가 처리한 HTML — content 정책(HtmlContent)으로 sanitize 해 그리고 상대 `/data/*` 는 새니타이저가
 * 사이트 오리진으로 절대화한다. 404 는 빈 상태.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useContentQuery, type ContentRef } from '../../../entities/content/queries';
import type { ContentDto } from '../../../entities/content/schema';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { PlainTextBody } from '../../../shared/html/PlainTextBody';
import { t } from '../../../shared/i18n';
import { coIdSchema } from '../../../shared/lib/routeParams';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'Content'>;

const SEO_SLUG = /^[a-z0-9-]{1,120}$/i;
const HORIZONTAL_INSET = SPACE[4] * 2;

/** `co_id` 우선, 없으면 seo 슬러그. 둘 다 형식이 안 맞으면 null(빈 상태). */
export function normalizeContentParams(params: unknown): ContentRef | null {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const coId = coIdSchema.safeParse(record.co_id);
  if (coId.success) return { co_id: coId.data };
  const seo = typeof record.seo === 'string' ? record.seo.trim() : '';
  return SEO_SLUG.test(seo) ? { seo } : null;
}

type ContentQuery = ReturnType<typeof useContentQuery>;

/** 모바일 본문이 있으면 raw 평문(줄바꿈·자동링크), 아니면 서버가 처리한 HTML 을 content 정책으로. */
function ContentText({ content, width }: { content: ContentDto; width: number }) {
  const mobile = content.co_mobile_content?.trim();
  if (mobile) return <PlainTextBody text={mobile} testID="content-mobile" />;
  return <HtmlContent html={content.co_content} width={width} />;
}

function ContentBody({ query, width }: { query: ContentQuery; width: number }) {
  if (query.isPending) {
    return (
      <View style={styles.skeleton} testID="content-skeleton">
        <Skeleton height={28} width="70%" />
        <Skeleton height={240} />
      </View>
    );
  }
  if (query.error) {
    if (isApiError(query.error) && query.error.status === 404) {
      return <EmptyState title={t('content.not_found')} testID="content-not-found" />;
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <ScrollView contentContainerStyle={styles.content} testID="content-scroll">
      <AppText variant="title" accessibilityRole="header" testID="content-subject">
        {query.data.co_subject}
      </AppText>
      <ContentText content={query.data} width={width} />
    </ScrollView>
  );
}

export function ContentScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useFrameDimensions();
  const contentRef = useMemo(() => normalizeContentParams(route.params), [route.params]);
  const query = useContentQuery(contentRef);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="content-screen">
      <TopAppBar title={query.data?.co_subject ?? t('content.title')} leftIcon="←" onLeftPress={goBack} />
      {contentRef ? (
        <ContentBody query={query} width={width - HORIZONTAL_INSET} />
      ) : (
        <EmptyState title={t('content.not_found')} testID="content-not-found" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3], paddingBottom: SPACE[8] },
  skeleton: { padding: SPACE[4], gap: SPACE[3] },
});
