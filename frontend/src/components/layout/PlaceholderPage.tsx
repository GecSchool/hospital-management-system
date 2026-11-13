import { PageHeader } from './PageHeader';

export interface PlaceholderPageProps {
  title: string;
  description?: string;
  figmaNodeId?: string;
}

export function PlaceholderPage({
  title,
  description,
  figmaNodeId,
}: PlaceholderPageProps) {
  return (
    <section data-figma-node={figmaNodeId}>
      <PageHeader title={title} description={description} />
      <p className="page-placeholder">화면을 준비하고 있습니다.</p>
    </section>
  );
}
