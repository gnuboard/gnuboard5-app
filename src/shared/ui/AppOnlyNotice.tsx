/**
 * 웹 데모에서 막는 화면(결제창·본인인증·우편번호 찾기처럼 WebView·네이티브 모듈이 필요한 화면)의 안내.
 * 제목줄(←) + 빈 상태 안내 + 뒤로 버튼.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { EmptyState } from './EmptyState';
import { TopAppBar } from './TopAppBar';
import { useTheme } from './theme/ThemeProvider';

export function AppOnlyNotice({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="app-only-notice">
      <TopAppBar title="" leftIcon="←" onLeftPress={onBack} />
      <EmptyState
        icon="phone-portrait-outline"
        title={t('web.app_only_title')}
        subtitle={t('web.app_only_body')}
        action={{ label: t('common.back'), onPress: onBack, variant: 'outline' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
