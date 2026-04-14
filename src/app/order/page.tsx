// 'use client'

// import { useEffect, useState } from 'react'
// import { useRouter } from 'next/navigation'
// import { supabase } from '@/lib/supabase'
// import type { OrderItem } from '@/types'

// export default function OrderPage() {
//   const router = useRouter()
//   const [cart, setCart] = useState<OrderItem[]>([])
//   const [tableNumber, setTableNumber] = useState(1)
//   const [submitted, setSubmitted] = useState(false)
//   const [loading, setLoading] = useState(false)

//   useEffect(() => {
//     const savedCart = sessionStorage.getItem('cart')
//     const savedTable = sessionStorage.getItem('tableNumber')
//     if (savedCart) setCart(JSON.parse(savedCart))
//     if (savedTable) setTableNumber(Number(savedTable))
//   }, [])

//   const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0)

//   const submitOrder = async () => {
//     setLoading(true)
//     const { error } = await supabase.from('orders').insert({
//       table_number: tableNumber,
//       items: cart,
//       total_price: totalPrice,
//       status: 'pending'
//     })
//     if (!error) {
//       setSubmitted(true)
//       sessionStorage.clear()
//     }
//     setLoading(false)
//   }

//   if (submitted) {
//     return (
//       <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
//         <div className="text-5xl">✅</div>
//         <h2 className="text-xl font-bold">주문이 접수됐어요!</h2>
//         <p className="text-gray-500 text-sm text-center">
//           입금 확인 후 조리를 시작합니다. 잠시만 기다려주세요.
//         </p>
//         <button
//           onClick={() => router.push(`/menu?table=${tableNumber}`)}
//           className="mt-4 px-6 py-3 bg-[#189ad3] text-white rounded-xl font-medium"
//         >
//           메뉴판으로 돌아가기
//         </button>
//       </div>
//     )
//   }

//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="bg-white px-4 py-3 shadow-sm">
//         <h1 className="font-bold text-lg text-black">주문 확인</h1>
//         <p className="text-xs text-gray-700">{tableNumber}번 테이블</p>
//       </div>

//       <div className="p-4 flex flex-col gap-3">
//         {/* 주문 내역 */}
//         <div className="bg-white rounded-xl p-4">
//           <h2 className="font-medium mb-3 text-black">주문 내역</h2>
//           {cart.map(item => (
//             <div key={item.menu_id} className="flex justify-between text-gray-600 text-sm py-2 border-b last:border-0">
//               <span>{item.name} × {item.quantity}</span>
//               <span className="font-medium text-gray-600">
//                 {(item.price * item.quantity).toLocaleString()}원
//               </span>
//             </div>
//           ))}
//           <div className="flex justify-between font-bold text-base mt-3 text-gray-800">
//             <span>합계</span>
//             <span className="text-[#189ad3]">{totalPrice.toLocaleString()}원</span>
//           </div>
//         </div>

//         {/* 토스 QR */}
//         <div className="bg-white rounded-xl p-5 flex flex-col items-center gap-3">
//           <h2 className="font-medium text-black">토스로 송금해주세요</h2>
//           <p className="text-2xl font-bold text-[#189ad3]">
//             {totalPrice.toLocaleString()}원
//           </p>
//           <img
//             src="/toss-qr.jpg"
//             alt="토스 QR"
//             className="w-48 h-48 rounded-xl"
//             />
//           <p className="text-xs text-gray-500 text-center">
//             QR 스캔 후 금액을 확인하고 송금해주세요
//           </p>
//         </div>

//         <button
//           onClick={submitOrder}
//           disabled={loading}
//           className="w-full py-4 bg-[#189ad3] text-white rounded-xl font-bold disabled:opacity-50"
//         >
//           {loading ? '처리 중...' : '입금 완료 → 주문 접수'}
//         </button>
//         <p className="text-center text-xs text-gray-500">
//           송금 후 버튼을 눌러주세요
//         </p>
//       </div>
//     </div>
//   )
// }



'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { OrderItem } from '@/types'

export default function OrderPage() {
  const router = useRouter()
  const [cart, setCart] = useState<OrderItem[]>([])
  const [tableNumber, setTableNumber] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const ACCOUNT = '3333-28-8709289'
  const BANK = '카카오뱅크'
  const OWNER = '김세현'

  useEffect(() => {
    const savedCart = sessionStorage.getItem('cart')
    const savedTable = sessionStorage.getItem('tableNumber')
    if (savedCart) setCart(JSON.parse(savedCart))
    if (savedTable) setTableNumber(Number(savedTable))
  }, [])

  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0)

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
      status: 'pending'
    })
    if (!error) {
      setSubmitted(true)
      sessionStorage.clear()
    }
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold">주문이 접수됐어요!</h2>
        <p className="text-gray-500 text-sm text-center">
          입금 확인 후 조리를 시작합니다. 잠시만 기다려주세요.
        </p>
        <button
          onClick={() => router.push(`/menu?table=${tableNumber}`)}
          className="mt-4 px-6 py-3 bg-[#189ad3] text-white rounded-xl font-medium"
        >
          메뉴판으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-4 py-3 shadow-sm">
        <h1 className="font-bold text-lg text-black">주문 확인</h1>
        <p className="text-xs text-gray-700">{tableNumber}번 테이블</p>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* 주문 내역 */}
        <div className="bg-white rounded-xl p-4">
          <h2 className="font-medium mb-3 text-black">주문 내역</h2>
          {cart.map(item => (
            <div key={item.menu_id} className="flex justify-between text-gray-600 text-sm py-2 border-b last:border-0">
              <span>{item.name} × {item.quantity}</span>
              <span className="font-medium text-gray-600">
                {(item.price * item.quantity).toLocaleString()}원
              </span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-base mt-3 text-gray-700">
            <span>합계</span>
            <span className="text-[#189ad3]">{totalPrice.toLocaleString()}원</span>
          </div>
        </div>

        {/* 계좌 송금 */}
        <div className="bg-white rounded-xl p-5 flex flex-col gap-4">
          <h2 className="font-medium text-center text-black">계좌로 송금해주세요</h2>

          <div className="text-3xl font-bold text-[#189ad3] text-center">
            {totalPrice.toLocaleString()}원
          </div>

          <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">은행</span>
              <span className="font-medium text-gray-800">{BANK}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">계좌번호</span>
              <span className="font-medium text-gray-800">{ACCOUNT}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">예금주</span>
              <span className="font-medium text-gray-800">{OWNER}</span>
            </div>
          </div>

          <button
            onClick={copyAccount}
            className={`w-full py-3 rounded-xl font-medium text-sm transition
              ${copied
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700'}`}
          >
            {copied ? '✓ 계좌번호 복사됨!' : '계좌번호 복사'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            복사 후 은행앱에서 붙여넣기 하세요
          </p>
        </div>

        <button
          onClick={submitOrder}
          disabled={loading}
          className="w-full py-4 bg-[#189ad3] text-white rounded-xl font-bold disabled:opacity-50"
        >
          {loading ? '처리 중...' : '입금 완료 → 주문 접수'}
        </button>
        <p className="text-center text-xs text-gray-400">
          송금 후 버튼을 눌러주세요
        </p>
      </div>
    </div>
  )
}