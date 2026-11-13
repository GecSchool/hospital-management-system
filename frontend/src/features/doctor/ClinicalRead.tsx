import type { ClinicalVersion } from './clinicalService';
import { dateTimeLabel } from '../staff/format';
export function ClinicalRead({ version }: { version: ClinicalVersion }) {
  return (
    <>
      <p>
        {dateTimeLabel(version.createdAt)} · {version.author.name} ·{' '}
        {version.versionNo === 1
          ? '원본 버전 1'
          : `정정 버전 ${version.versionNo}`}
      </p>
      {(['symptoms', 'diagnosis', 'opinion'] as const).map((k, i) => (
        <div key={k}>
          <h3>{['증상', '진단', '소견'][i]}</h3>
          <p className="clinical-text">{version[k] || '입력 내용 없음'}</p>
        </div>
      ))}
      {version.correctionReason !== null && (
        <div className="clinical-reason">
          <h3>정정 사유</h3>
          <p className="clinical-text">{version.correctionReason}</p>
        </div>
      )}
    </>
  );
}
