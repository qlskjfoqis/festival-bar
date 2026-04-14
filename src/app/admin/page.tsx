'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types'

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    // 기존 주문 불러오기
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setOrders(data)
    }
    fetchOrders()

    // 새 주문 실시간 수신
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders(prev => [payload.new as Order, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const confirmOrder = async (id: number) => {
    await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', id)
    setOrders(prev =>
      prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o)
    )
  }

  const pending = orders.filter(o => o.status === 'pending')
  const confirmed = orders.filter(o => o.status === 'confirmed')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-4 py-3 shadow-sm flex justify-between items-center">
        <h1 className="font-bold text-lg text-black">🔔 주문 관리</h1>
        <div className="flex gap-2 text-sm">
          <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">
            미처리 {pending.length}
          </span>
          <span className="bg-green-100 text-green-600 px-2 py-1 rounded-full font-medium">
            완료 {confirmed.length}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {orders.map(order => (
          <div
            key={order.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4
              ${order.status === 'pending'
                ? 'border-[#61B6C3]'
                : 'border-gray-200 opacity-60'}`}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-bold text-base text-black">
                  {order.table_number}번 테이블
                </span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full
                  ${order.status === 'pending'
                    ? 'bg-orange-100 text-[#189ad3]'
                    : 'bg-gray-100 text-black'}`}
                >
                  {order.status === 'pending' ? '대기중' : '확인됨'}
                </span>
              </div>
              <span className="text-sm text-gray-400">
                {new Date(order.created_at).toLocaleTimeString('ko-KR', {
                  hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>

            <div className="mt-2 text-sm text-black">
              {order.items.map((item, i) => (
                <span key={i}>
                  {item.name} {item.quantity}개{i < order.items.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>

            <div className="mt-3 flex justify-between items-center">
              <span className="font-bold text-[#189ad3]">
                {order.total_price.toLocaleString()}원
              </span>
              {order.status === 'pending' && (
                <button
                  onClick={() => confirmOrder(order.id)}
                  className="px-4 py-1.5 bg-[#189ad3] text-white rounded-lg text-sm font-medium"
                >
                  입금 확인 ✓
                </button>
              )}
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="text-center text-black py-12">
            아직 주문이 없어요
          </div>
        )}
      </div>
    </div>
  )
}