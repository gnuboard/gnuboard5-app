/**
 * 댓글 앵커 스크롤 — 알림으로 들어온 댓글, 그리고 댓글을 등록·수정한 뒤 그 댓글로 이동한다.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useCommentAnchor } from '../features/community/posts/commentAnchor';
import type { CommentNode } from '../entities/comment/model';

function node(id: number): CommentNode {
  return { comment: { wr_id: id }, depth: 0 } as unknown as CommentNode;
}

async function mount(initialTree: CommentNode[], commentId?: number, focusKey?: number) {
  const scrollToIndex = jest.fn(() => Promise.resolve());
  const hook = await renderHook(
    ({ tree, id, key }: { tree: CommentNode[]; id?: number; key?: number }) => {
      const anchor = useCommentAnchor(tree, id, key);
      (anchor.listRef as { current: unknown }).current = { scrollToIndex };
      return anchor;
    },
    { initialProps: { tree: initialTree, id: commentId, key: focusKey } },
  );
  return { ...hook, scrollToIndex };
}

test('scrolls to the route anchor once the list can measure', async () => {
  const { result, scrollToIndex } = await mount([node(1), node(2), node(3)], 3);
  await act(async () => result.current.onListLoad());
  expect(scrollToIndex).toHaveBeenCalledWith({ index: 2, animated: true, viewPosition: 0.1 });
  await act(async () => result.current.onListLoad());
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
});

test('focusComment scrolls to a saved comment, again even for the same one', async () => {
  const { result, scrollToIndex } = await mount([node(1), node(2)]);
  await act(async () => result.current.onListLoad());
  expect(scrollToIndex).not.toHaveBeenCalled();
  await act(async () => result.current.focusComment(2));
  expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 1, animated: true, viewPosition: 0.1 });
  await act(async () => result.current.focusComment(2));
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
});

test('waits until the new comment is in the tree', async () => {
  const { result, rerender, scrollToIndex } = await mount([node(1)]);
  await act(async () => result.current.focusComment(9));
  expect(scrollToIndex).not.toHaveBeenCalled();
  await rerender({ tree: [node(1), node(9)], id: undefined, key: undefined });
  expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, animated: true, viewPosition: 0.1 });
});

test('a new route focusKey (back from the edit screen) scrolls again', async () => {
  const tree = [node(1), node(2)];
  const { result, rerender, scrollToIndex } = await mount(tree, 2, 1);
  await act(async () => result.current.onListLoad());
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  await rerender({ tree, id: 2, key: 2 });
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
});
