import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../components/ui';

/** Doctor-only link guard. Successful saves navigate directly without replaying a click. */
export function DraftExit({
  dirty,
  busy = false,
}: {
  dirty: boolean;
  busy?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const approved = useRef(false);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (approved.current) {
        approved.current = false;
        return;
      }
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('a[href], .app-header__logout')
          : null;
      if (
        !element ||
        element.closest('dialog') ||
        (element instanceof HTMLAnchorElement &&
          (element.target === '_blank' || element.hasAttribute('download')))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) setTarget(element);
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, busy]);
  return target ? (
    <Modal
      open
      title="작성 중인 진료를 나갈까요?"
      onClose={() => setTarget(null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => setTarget(null)}>
            계속 작성
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              approved.current = true;
              setTarget(null);
              target.click();
            }}
          >
            나가기
          </Button>
        </>
      }
    >
      <p>완료하지 않은 내용은 저장되지 않습니다.</p>
      <p>계속 작성하거나 화면을 나갈 수 있습니다.</p>
    </Modal>
  ) : null;
}
