import symbol from '../../assets/soongsil-symbol.png';

export function HospitalIdentity({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <div className="hospital-identity">
      <img src={symbol} alt="숭실대학교 심벌" width={84} height={36} />
      <div>
        <p className="hospital-identity__name">숭실대 병원</p>
        {subtitle ? (
          <p className="hospital-identity__description">
            진료 예약 및 환자 관리 시스템
          </p>
        ) : null}
      </div>
    </div>
  );
}
