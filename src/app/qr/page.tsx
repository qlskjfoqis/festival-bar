'use client'

const BASE_URL = 'https://festival-bar.vercel.app/menu'
const TABLE_COUNT = 34

export default function QRPage() {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
          .qr-grid { gap: 5mm !important; }
          .qr-card { break-inside: avoid; border: 1px solid #e5e7eb; }
        }
      `}</style>

      <div className="no-print p-8 pb-4">
        <h1 className="text-2xl font-bold mb-1">테이블 QR 코드</h1>
        <p className="text-gray-500 text-sm">Ctrl+P 또는 Cmd+P로 인쇄하세요</p>
      </div>

      <div className="qr-grid grid grid-cols-3 gap-4 p-8 print:p-0">
        {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(table => (
          <div
            key={table}
            className="qr-card flex flex-col items-center border rounded-xl p-3 gap-2"
          >
            <p className="font-bold text-lg">{table}번 테이블</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${BASE_URL}?table=${table}`}
              alt={`${table}번 테이블 QR`}
              width={180}
              height={180}
            />
          </div>
        ))}
      </div>
    </>
  )
}
