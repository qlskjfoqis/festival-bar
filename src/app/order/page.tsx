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
  const [submitted, setSubmitted] = useState(false)
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

  const submitOrder = async () => {
    setLoading(true)
    const { error } = await supabase.from('orders').insert({
      table_number: tableNumber,
      items: cart,
      total_price: totalPrice,
      person_count: personCount,
      status: 'pending',
    })
    if (!error) {
      setSubmitted(true)
      sessionStorage.clear()
    }
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1c1208] flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-6xl">🏮</div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-amber-50">주문이 접수됐어요!</h2>
          <p className="text-amber-300/60 text-sm mt-2">직원이 확인하는 동안 잠시만 기다려주세요.</p>
        </div>
        <button
          onClick={() => router.push(`/menu?table=${tableNumber}`)}
          className="px-8 py-4 bg-[#e07640] text-white rounded-2xl font-bold text-base active:scale-95 transition-transform shadow-lg"
        >
          메뉴판으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf5ee]">
      {/* 헤더 */}
      <div className="bg-[#1c1208] px-4 pt-4 pb-3">
        <h1 className="font-bold text-lg text-amber-50 tracking-tight">🏮 게스트하우스융</h1>
        <p className="text-xs text-amber-300/50 mt-0.5">
          {tableNumber}번 테이블 · {isAdditionalOrder ? '추가 주문' : `${personCount}명`} · 주문 확인
        </p>
      </div>

      <div className="p-4 flex flex-col gap-4 pb-8">
        {/* 주문 내역 */}
        <div>
          <div className="flex items-center gap-3 pt-2 pb-3">
            <span className="font-bold text-base text-[#1c1208]">주문 내역</span>
            <div className="flex-1 h-px bg-[#d4a87a]/30" />
          </div>

          <div className="flex flex-col gap-2">
            {cart.map(item => (
              <div
                key={item.menu_id}
                className="bg-white rounded-2xl shadow-sm px-4 py-3.5 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-sm text-[#1c1208]">{item.name}</p>
                  <p className="text-xs text-[#5c3d1e]/50 mt-0.5">
                    {item.price.toLocaleString()}원 × {item.quantity}
                  </p>
                </div>
                <span className="font-bold text-sm text-[#e07640]">
                  {(item.price * item.quantity).toLocaleString()}원
                </span>
              </div>
            ))}

            {!isAdditionalOrder && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm text-[#5c3d1e]">테이블비</p>
                  <p className="text-xs text-amber-700/50 mt-0.5">
                    {personCount}명 × {TABLE_FEE_PER_PERSON.toLocaleString()}원
                  </p>
                </div>
                <span className="font-bold text-sm text-[#e07640]">{tableFee.toLocaleString()}원</span>
              </div>
            )}
          </div>

          <div className="bg-[#1c1208] rounded-2xl px-5 py-4 mt-3 flex justify-between items-center">
            <span className="font-bold text-amber-100">합계</span>
            <span className="text-2xl font-black text-[#e07640]">{totalPrice.toLocaleString()}원</span>
          </div>
        </div>

        {/* 계좌 송금 안내 */}
        <div>
          <div className="flex items-center gap-3 pt-1 pb-3">
            <span className="font-bold text-base text-[#1c1208]">송금 안내</span>
            <div className="flex-1 h-px bg-[#d4a87a]/30" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-5 pb-4 text-center border-b border-[#faf5ee]">
              <p className="text-xs text-[#5c3d1e]/40 mb-1">아래 계좌로 송금해주세요</p>
              <p className="text-3xl font-black text-[#e07640]">{totalPrice.toLocaleString()}원</p>
            </div>

            <div className="bg-amber-50 px-4 py-3 text-center border-b border-amber-100">
              <p className="text-sm text-amber-800 font-semibold">
                입금자명을 <span className="text-[#e07640]">{tableNumber}번</span>으로 보내주세요
              </p>
              <p className="text-xs text-amber-700/50 mt-0.5">직원이 확인 후 주문을 접수해드려요</p>
            </div>

            <div className="divide-y divide-[#faf5ee]">
              <div className="flex justify-between items-center px-4 py-3.5">
                <span className="text-sm text-[#5c3d1e]/50">은행</span>
                <span className="font-semibold text-[#1c1208]">{BANK}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3.5">
                <span className="text-sm text-[#5c3d1e]/50">계좌번호</span>
                <span className="font-semibold text-[#1c1208] tracking-wide">{ACCOUNT}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3.5">
                <span className="text-sm text-[#5c3d1e]/50">예금주</span>
                <span className="font-semibold text-[#1c1208]">{OWNER}</span>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3">
              <button
                onClick={copyAccount}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]
                  ${copied
                    ? 'bg-green-500 text-white'
                    : 'bg-[#faf5ee] text-[#5c3d1e] border border-[#e8d9c5]'}`}
              >
                {copied ? '✓ 계좌번호 복사됨!' : '계좌번호 복사하기'}
              </button>
            </div>
          </div>
        </div>

        {/* 주문 접수 버튼 */}
        <button
          onClick={submitOrder}
          disabled={loading}
          className="w-full py-4 bg-[#1c1208] text-amber-50 rounded-2xl font-bold text-base disabled:opacity-50 active:scale-[0.98] transition shadow-lg"
        >
          {loading ? '처리 중...' : '입금 완료 → 주문 접수하기'}
        </button>
        <p className="text-center text-xs text-[#5c3d1e]/40">
          송금 완료 후 버튼을 눌러주세요
        </p>
      </div>
    </div>
  )
}
