/**
 * XSS 코퍼스 (PLAN T-P0-12, ARCH §9 "새니타이즈"). sanitize 단위 테스트와 계약 테스트(작성 후 읽기)가 공유한다.
 * 각 벡터는 어떤 정책으로 새니타이즈해도 `forbidden` 문자열이 출력에 남으면 안 된다(대소문자 무시).
 */
export interface XssVector {
  name: string;
  html: string;
  /** 출력에 절대 남으면 안 되는 부분 문자열(소문자 비교). */
  forbidden: string[];
}

export const XSS_CORPUS: readonly XssVector[] = [
  { name: 'script tag', html: '<p>hi</p><script>alert(1)</script>', forbidden: ['<script', 'alert(1)'] },
  {
    name: 'script mixed case + attrs',
    html: '<ScRiPt src="//evil.test/x.js"></ScRiPt>',
    forbidden: ['script', 'evil.test'],
  },
  { name: 'img onerror', html: '<img src="x" onerror="alert(1)">', forbidden: ['onerror', 'alert(1)'] },
  { name: 'img onload with spaces', html: '<img src="x" onload = "alert(1)">', forbidden: ['onload', 'alert(1)'] },
  { name: 'anchor javascript:', html: '<a href="javascript:alert(1)">x</a>', forbidden: ['javascript:'] },
  { name: 'anchor JavaScript with tab', html: '<a href="java\tscript:alert(1)">x</a>', forbidden: ['script:'] },
  {
    name: 'anchor entity-encoded javascript',
    html: '<a href="&#106;avascript:alert(1)">x</a>',
    forbidden: ['javascript:', 'alert(1)'],
  },
  {
    name: 'anchor data: html',
    html: '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    forbidden: ['data:text/html'],
  },
  { name: 'anchor vbscript', html: '<a href="vbscript:msgbox(1)">x</a>', forbidden: ['vbscript:'] },
  { name: 'svg onload', html: '<svg onload="alert(1)"><circle r="1"/></svg>', forbidden: ['<svg', 'onload'] },
  {
    name: 'math/mathml',
    html: '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    forbidden: ['<math', 'javascript:'],
  },
  {
    name: 'iframe srcdoc',
    html: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    forbidden: ['srcdoc', '<script'],
  },
  { name: 'iframe foreign host', html: '<iframe src="https://evil.test/embed"></iframe>', forbidden: ['evil.test'] },
  { name: 'style expression', html: '<p style="width:expression(alert(1))">x</p>', forbidden: ['expression'] },
  {
    name: 'style url()',
    html: '<p style="background:url(javascript:alert(1))">x</p>',
    forbidden: ['javascript:', 'url('],
  },
  {
    name: 'style tag',
    html: '<style>body{background:url(//evil.test)}</style><p>x</p>',
    forbidden: ['<style', 'evil.test'],
  },
  {
    name: 'meta refresh',
    html: '<meta http-equiv="refresh" content="0;url=https://evil.test">',
    forbidden: ['<meta', 'evil.test'],
  },
  { name: 'base href', html: '<base href="https://evil.test/"><a href="/x">x</a>', forbidden: ['<base', 'evil.test'] },
  {
    name: 'form + input',
    html: '<form action="https://evil.test"><input name="pw"></form>',
    forbidden: ['<form', '<input', 'evil.test'],
  },
  { name: 'object/embed', html: '<object data="x.swf"></object><embed src="x.swf">', forbidden: ['<object', '<embed'] },
  {
    name: 'link stylesheet',
    html: '<link rel="stylesheet" href="https://evil.test/x.css">',
    forbidden: ['<link', 'evil.test'],
  },
  { name: 'template', html: '<template><img src=x onerror=alert(1)></template>', forbidden: ['<template', 'onerror'] },
  { name: 'unclosed tag with event', html: '<img src=x onerror=alert(1)//', forbidden: ['onerror', 'alert(1)'] },
  {
    name: 'attribute breakout',
    html: '<a href="x" title="\'\'><script>alert(1)</script>">x</a>',
    forbidden: ['<script'],
  },
  { name: 'img src javascript', html: '<img src="javascript:alert(1)">', forbidden: ['javascript:'] },
  {
    name: 'img external host',
    html: '<img src="https://evil.test/track.gif">',
    forbidden: ['<img src="https://evil.test'],
  },
  {
    name: 'nested comment trick',
    html: '<!--<img src="--><img src=x onerror=alert(1)//">',
    forbidden: ['onerror', 'alert(1)'],
  },
  {
    name: 'video/audio autoplay',
    html: '<video src="x" onplay="alert(1)" autoplay></video>',
    forbidden: ['<video', 'onplay'],
  },
  {
    name: 'formaction on button',
    html: '<button formaction="javascript:alert(1)">x</button>',
    forbidden: ['formaction', 'javascript:'],
  },
  {
    name: 'xmlns namespace confusion',
    html: '<a xmlns="http://www.w3.org/2000/svg" href="javascript:alert(1)">x</a>',
    forbidden: ['javascript:'],
  },
];
