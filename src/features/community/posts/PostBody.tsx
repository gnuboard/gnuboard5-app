/**
 * 글 본문 (T-P1B-05, PRD CM-F03): 그누보드 conv_content 와 같게 html1 → user 정책 RichText, html2 → 줄바꿈을 <br> 로
 * 바꾼 RichText, 그 외 → PlainTextBody(줄바꿈 보존·자동링크). 판정은 shared/html/wrOption.postBodyMode.
 * `wr_link1/2` 는 링크 버튼. 링크 탭은 시스템 브라우저(urlResolver 화면 이동은 P1 tapRouter 에서 연결).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { PostDetailDto } from '../../../entities/post/schema';
import { t } from '../../../shared/i18n';
import { PlainTextBody } from '../../../shared/html/PlainTextBody';
import { RichText, openLinkExternally } from '../../../shared/html/RichText';
import { isSafeLink } from '../../../shared/html/htmlInline';
import { withLineBreaks, type PostBodyMode } from '../../../shared/html/wrOption';
import { Button } from '../../../shared/ui/Button';
import { SPACE } from '../../../shared/ui/tokens/primitive';

export interface PostBodyProps {
  post: PostDetailDto;
  /** wrOption.postBodyMode — html1 → html, html2 → html_br(줄바꿈을 <br>), 그 외 → plain. */
  mode: PostBodyMode;
  onLinkPress?: (href: string) => void;
  onImagePress?: (uri: string, alt: string | undefined) => void;
}

export function postLinks(post: Pick<PostDetailDto, 'wr_link1' | 'wr_link2'>): string[] {
  return [post.wr_link1, post.wr_link2].filter((link): link is string => isSafeLink(link));
}

export function PostBody({ post, mode, onLinkPress = openLinkExternally, onImagePress }: PostBodyProps) {
  const links = postLinks(post);
  const isHtml = mode !== 'plain';
  const html = mode === 'html_br' ? withLineBreaks(post.wr_content) : post.wr_content;
  return (
    <View style={styles.root} testID={isHtml ? 'post-body-html' : 'post-body-plain'}>
      {isHtml ? (
        <RichText html={html} onLinkPress={onLinkPress} onImagePress={onImagePress} />
      ) : (
        <PlainTextBody text={post.wr_content} onLinkPress={onLinkPress} />
      )}
      {links.length > 0 ? (
        <View style={styles.links}>
          {links.map((href, index) => (
            <Button
              key={href}
              label={t('board.link_button', { n: index + 1 })}
              variant="secondary"
              size="compact"
              onPress={() => onLinkPress(href)}
              accessibilityLabel={href}
              testID={`post-link-${index + 1}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[4], gap: SPACE[3] },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
