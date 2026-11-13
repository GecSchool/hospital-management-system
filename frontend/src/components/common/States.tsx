import { Button } from '../ui/Button';

export function Loading({
  message = '불러오는 중입니다.',
}: {
  message?: string;
}) {
  return (
    <p className="ui-state" role="status">
      {message}
    </p>
  );
}

export function EmptyState({
  title = '조회된 항목이 없습니다.',
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="ui-state">
      <p>{title}</p>
      {description ? (
        <p className="ui-state-description">{description}</p>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message = '요청을 처리하지 못했습니다.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-state" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="compact" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}
