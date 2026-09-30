/**
 * shared/ui 프리미티브 (PLAN T-P0-09): Button 접근성 상태(disabled/loading), Chip selected, Field 오류,
 * ErrorState 재시도 분기, ProductImage 자리표시, Skeleton/Badge/Section 렌더.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ApiError } from '../shared/api/apiError';
import { setLocale } from '../shared/i18n';
import { Badge } from '../shared/ui/Badge';
import { Button } from '../shared/ui/Button';
import { Chip } from '../shared/ui/Chip';
import { EmptyState } from '../shared/ui/EmptyState';
import { ErrorState } from '../shared/ui/ErrorState';
import { Field } from '../shared/ui/Field';
import { ProductImage } from '../shared/ui/ProductImage';
import { Section } from '../shared/ui/Section';
import { Skeleton } from '../shared/ui/Skeleton';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

beforeAll(async () => {
  await setLocale('ko');
});

afterAll(async () => {
  await setLocale(null);
});

function renderThemed(ui: React.ReactElement) {
  return render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>);
}

describe('Button', () => {
  test('exposes role/label/state and fires onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="담기" onPress={onPress} />);
    const button = screen.getByRole('button', { name: '담기' });
    expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled and loading block presses and are announced', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <>
        <Button label="disabled" disabled onPress={onPress} />
        <Button label="saving" loading onPress={onPress} />
      </>,
    );
    const disabled = screen.getByRole('button', { name: 'disabled' });
    const loading = screen.getByRole('button', { name: 'saving' });
    expect(disabled.props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(loading.props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(disabled);
    await fireEvent.press(loading);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByLabelText('loading')).toBeTruthy();
  });
});

describe('Chip / Badge / Section', () => {
  test('chip reports selected state; badge and section render their labels', async () => {
    const onAction = jest.fn();
    await renderThemed(
      <>
        <Chip label="전체" selected />
        <Chip label="상의" />
        <Badge label="테스트 결제" tone="error" />
        <Section title="인기 상품" actionLabel="더보기" onAction={onAction}>
          <Text>child</Text>
        </Section>
      </>,
    );
    expect(screen.getByRole('button', { name: '전체' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: '상의' }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('테스트 결제')).toBeTruthy();
    expect(screen.getByRole('header', { name: '인기 상품' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '더보기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('child')).toBeTruthy();
  });
});

describe('Field', () => {
  test('shows helper, then the error instead, and labels the input', async () => {
    const { rerender } = await renderThemed(<Field label="아이디" helper="영문 소문자" value="" />);
    expect(screen.getByText('영문 소문자')).toBeTruthy();
    expect(screen.getByLabelText('아이디')).toBeTruthy();
    await rerender(
      <ThemeProvider initialPreference="light">
        <Field label="아이디" helper="영문 소문자" error="이미 사용 중" value="" required />
      </ThemeProvider>,
    );
    expect(screen.getByText('이미 사용 중')).toBeTruthy();
    expect(screen.queryByText('영문 소문자')).toBeNull();
    expect(screen.getByText('*')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  test('network error → retry button + support link', async () => {
    const onRetry = jest.fn();
    const onSupport = jest.fn();
    await renderThemed(
      <ErrorState error={ApiError.network(new Error('dns'), 'GET /x')} onRetry={onRetry} onSupport={onSupport} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    await fireEvent.press(screen.getByRole('button', { name: '고객센터 문의' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSupport).toHaveBeenCalledTimes(1);
  });

  test('schema error hides retry; 429 within cooldown hides retry and shows seconds', async () => {
    await renderThemed(
      <>
        <ErrorState error={ApiError.schema('bad', 'GET /x')} onRetry={jest.fn()} testID="schema" />
        <ErrorState error={new ApiError('too many', 429)} onRetry={jest.fn()} cooldownMs={12_000} testID="rate" />
      </>,
    );
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    expect(screen.getByText(/12초/)).toBeTruthy();
  });

  test('EmptyState default title comes from i18n', async () => {
    await renderThemed(<EmptyState />);
    expect(screen.getByText('아직 내용이 없어요')).toBeTruthy();
  });
});

describe('ProductImage / Skeleton', () => {
  test('empty uri renders the placeholder with the first letter; failure falls back too', async () => {
    await renderThemed(
      <>
        <ProductImage uri="" placeholderLabel="올림푸스" />
        <ProductImage uri="https://img.test/a.jpg" placeholderLabel="B" testID="img" />
      </>,
    );
    expect(screen.getByText('올')).toBeTruthy();
    const image = screen.getByTestId('img');
    await act(async () => {
      image.props.onError();
    });
    expect(screen.getAllByTestId('product-image-placeholder')).toHaveLength(2);
  });

  test('skeleton is hidden from accessibility and marked busy', async () => {
    await renderThemed(<Skeleton testID="sk" height={20} />);
    const sk = screen.getByTestId('sk', { includeHiddenElements: true });
    expect(sk.props.accessibilityState).toEqual({ busy: true });
    expect(sk.props.accessibilityElementsHidden).toBe(true);
  });
});
