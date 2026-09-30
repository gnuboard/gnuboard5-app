import { getStateFromPath } from '@react-navigation/native';
import { linkingConfig, shouldIgnoreLinkPath } from '../navigation/linkingConfig';

describe('linkingConfig', () => {
  test('Toss app-return and dangerous URLs never touch navigation state', () => {
    expect(shouldIgnoreLinkPath('')).toBe(true);
    expect(shouldIgnoreLinkPath('/')).toBe(true);
    expect(shouldIgnoreLinkPath('tosspayments://return')).toBe(true);
    expect(shouldIgnoreLinkPath('javascript:alert(1)')).toBe(true);
    expect(shouldIgnoreLinkPath('settings')).toBe(false);
    expect(linkingConfig.filter?.('tosspayments://return')).toBe(false);
    expect(linkingConfig.filter?.('sirsoft-g5://post/free/1')).toBe(true);
    expect(linkingConfig.getStateFromPath?.('', linkingConfig.config)).toBeUndefined();
    expect(linkingConfig.getStateFromPath?.('post/free/1', linkingConfig.config)?.routes.at(-1)).toMatchObject({
      name: 'PostDetail',
    });
  });

  test('routes tab links into the nested MainTabs state', () => {
    const settings = getStateFromPath('settings', linkingConfig.config);
    expect(settings?.routes[0]).toMatchObject({
      name: 'MainTabs',
      state: { routes: [{ name: 'MyTab', state: { routes: [{ name: 'My' }] } }] },
    });
    const cart = getStateFromPath('cart?utm=test', linkingConfig.config);
    expect(cart?.routes[0]).toMatchObject({ name: 'MainTabs', state: { routes: [{ name: 'CartTab' }] } });
    const home = getStateFromPath('', linkingConfig.config);
    expect(home?.routes[0]).toMatchObject({ name: 'MainTabs' });
  });

  test('detail links keep MainTabs beneath them so back returns to the tabs', () => {
    const state = getStateFromPath('post/free/42', linkingConfig.config);
    expect(state?.routes.map((r) => r.name)).toEqual(['MainTabs', 'PostDetail']);
  });

  test('parses post detail ids with strict positive integer rules', () => {
    const valid = getStateFromPath('post/free/42', linkingConfig.config);
    expect(valid?.routes[1]).toMatchObject({
      name: 'PostDetail',
      params: { board: 'free', wr_id: 42 },
    });

    for (const path of ['post/free/1e3', 'post/free/3.5', 'post/free/0', 'post/free/9007199254740993']) {
      const state = getStateFromPath(path, linkingConfig.config);
      expect(state?.routes[1]).toMatchObject({
        name: 'PostDetail',
        params: { board: 'free', wr_id: undefined },
      });
    }
  });
});
