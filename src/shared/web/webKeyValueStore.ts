/**
 * 웹 데모용 키-값 저장소 — SecureStore 와 같은 비동기 모양(get/set/delete)으로 localStorage 를 감싼다.
 * 웹에는 SecureStore 가 없어 메모리에만 두던 값(비회원 장바구니 번호 등)을 새로고침 뒤에도 유지하려고 쓴다.
 * 민감한 값(로그인 토큰 등)은 넣지 않는다 — 토큰은 shared/api/sessionStore 가 따로 다룬다.
 * localStorage 가 막힌 브라우저(사생활 보호 모드 등)에서는 조용히 아무것도 하지 않는다.
 */

export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const webKeyValueStore: KeyValueStore = {
  async getItemAsync(key) {
    try {
      return storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItemAsync(key, value) {
    try {
      storage()?.setItem(key, value);
    } catch {
      // 저장 공간 부족·차단 — 메모리 값으로 계속 동작한다.
    }
  },
  async deleteItemAsync(key) {
    try {
      storage()?.removeItem(key);
    } catch {
      // 위와 같음.
    }
  },
};
