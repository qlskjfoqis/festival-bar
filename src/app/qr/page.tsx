'use client'

import { useEffect, useRef } from 'react'

const BASE_URL = 'https://festival-bar.vercel.app/menu'
const TABLE_COUNT = 30

export default function QRPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">테이블 QR 코드</h1>
      <p className="text-gray-500 text-sm mb-8">Ctrl+P 또는 Cmd+P로 인쇄하세요</p>
      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(table => (
          <div
            key={table}
            className="flex flex-col items-center border rounded-xl p-4 gap-3"
          >
            <p className="font-bold text-lg">{table}번 테이블</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${BASE_URL}?table=${table}`}
              alt={`${table}번 테이블 QR`}
              width={200}
              height={200}
            />
            <p className="text-xs text-gray-400">{BASE_URL}?table={table}</p>
          </div>
        ))}
      </div>
    </div>
  )
}