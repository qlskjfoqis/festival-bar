'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OrderItem } from '@/types'

const TABLE_FEE_PER_PERSON = 1000

export default function OrderPage() {
  const router = useRouter()
  const [cart, setCart] = useState<OrderItem[]>([])
  const [tableNumber, setTableNumber] = useState(1)
  const [personCount, setPersonCount] = useState(1)
  const [step, setStep] = useState<'summary' | 'payment'>('summary')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const ACCOUNT = '3333-37-1544966'
  const BANK = '카카오뱅크'
  const OWNER = '김세현'

  useEffect(() => {
    const savedCart = sessionStorage.getItem('cart')
    const savedTable = sessionStorage.getItem('tableNumber')
    const savedPerson = sessionStorage.getItem('personCount')
    if (savedCart) setCart(JSON.parse(savedCart))
    if (savedTable) setTableNumber(Number(savedTable))
    if (savedPerson) setPersonCount(Number(savedPerson))
  }, [])

  const isAdditionalOrder = personCount === 0
  const tableFee = isAdditionalOrder ? 0 : TABLE_FEE_PER_PERSON * personCount
  const itemsPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const totalPrice = itemsPrice + tableFee

  const copyAccount = () => {
    navigator.clipboard.writeText(ACCOUNT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submitAndPay = async () => {
    setLoading(true)
    const { error } = await supabase.from('orders').insert({
      table_number: tableNumber,
      items: cart,
      total_price: totalPrice,
      person_count: personCount,
      status: 'pending',
    })
    if (!error) {
      sessionStorage.clear()
      setStep('payment')
    }
    setLoading(false)
  }

  // ── 송금 안내 화면 ─────────────────────────────────────────
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-[#1c1208] flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#e07640] flex items-center justify-center text-white text-3xl font-black mx-auto mb-3">💸</div>
          <h2 className="text-xl font-bold text-amber-50">입금 확인 후 주문이 접수됩니다</h2>
          <p className="text-amber-300/60 text-sm mt-1">아래 계좌로 송금해주세요</p>
        </div>

        <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-[#e07640] px-5 py-5 text-center">
            <p className="text-white/70 text-xs mb-1">송금 금액</p>
            <p className="text-white font-black text-4xl">{totalPrice.toLocaleString()}원</p>
            <p className="text-white/80 text-sm mt-2 font-semibold">
              입금자명 → <span className="text-white font-black">{tableNumber}번</span>
            </p>
          </div>

          <div className="divide-y divide-[#f0e8dc]">
            <div className="flex justify-between items-center px-5 py-3.5">
              <span className="text-sm text-[#5c3d1e]/50">은행</span>
              <span className="font-semibold text-[#1c1208]">{BANK}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-3.5">
              <span className="text-sm text-[#5c3d1e]/50">계좌번호</span>
              <span className="font-semibold text-[#1c1208] tracking-wide">{ACCOUNT}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-3.5">
              <span className="text-sm text-[#5c3d1e]/50">예금주</span>
              <span className="font-semibold text-[#1c1208]">{OWNER}</span>
            </div>
          </div>

          <div className="px-5 py-4">
            <button
              onClick={copyAccount}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
                ${copied ? 'bg-green-500 text-white' : 'bg-[#1c1208] text-amber-50'}`}
            >
              {copied ? '✓ 복사됐어요!' : '계좌번호 복사하기'}
            </button>
          </div>
        </div>

        <button
          onClick={() => router.push(`/menu?table=${tableNumber}`)}
          className="text-amber-300/50 text-sm underline underline-offset-4 active:text-amber-300/80 transition"
        >
          메뉴판으로 돌아가기
        </button>
      </div>
    )
  }

  // ── 주문 내역 화면 ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1c1208] flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-center">
        <div className="text-4xl mb-2">🏮</div>
        <h1 className="font-bold text-lg text-amber-50 tracking-tight">게스트하우스융</h1>
        <p className="text-amber-300/50 text-xs mt-0.5">
          {tableNumber}번 테이블 · {isAdditionalOrder ? '추가 주문' : `${personCount}명`}
        </p>
      </div>

      <div className="w-full max-w-md bg-[#faf5ee] rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 pt-5 pb-3">
          <p className="text-xs font-semibold text-[#5c3d1e]/40 uppercase tracking-widest mb-3">주문 내역</p>
          <div className="flex flex-col gap-3">
            {cart.map(item => (
              <div key={item.menu_id} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#1c1208] break-keep">{item.name}</p>
                  <p className="text-xs text-[#5c3d1e]/40 mt-0.5">×{item.quantity}</p>
                </div>
                <span className="font-bold text-sm text-[#5c3d1e] shrink-0">
                  {(item.price * item.quantity).toLocaleString()}원
                </span>
              </div>
            ))}

            {!isAdditionalOrder && (
              <div className="flex items-center gap-4 pt-1">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#5c3d1e]">테이블비</p>
                  <p className="text-xs text-[#5c3d1e]/40 mt-0.5">{personCount}명 × 1,000원</p>
                </div>
                <span className="font-bold text-sm text-[#5c3d1e] shrink-0">{tableFee.toLocaleString()}원</span>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6 my-3 h-px bg-[#d4a87a]/30" />

        <div className="px-6 pb-5 flex justify-between items-center">
          <span className="font-bold text-[#1c1208]">합계</span>
          <span className="text-3xl font-black text-[#e07640]">{totalPrice.toLocaleString()}원</span>
        </div>
      </div>

      <div className="w-full max-w-md flex flex-col gap-2">
        <button
          onClick={submitAndPay}
          disabled={loading}
          className="w-full py-5 bg-[#e07640] text-white rounded-2xl font-black text-xl disabled:opacity-50 active:scale-[0.98] transition shadow-lg"
        >
          {loading ? '처리 중...' : '💸 송금하기'}
        </button>
        <p className="text-center text-xs text-amber-300/40">
          버튼을 누르면 주문이 접수되고 계좌 정보가 표시돼요
        </p>
      </div>
    </div>
  )
}
