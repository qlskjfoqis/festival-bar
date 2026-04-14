'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types'

// UTC → KST 변환
const toKST = (utcString: string) => {
  const date = new Date(utcString)
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

const formatTime = (utcString: string) => {
  return toKST(utcString).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDate = (utcString: string) => {
  return toKST(utcString).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'stats'>('pending')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>('전체')
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (data) setOrders(data)
    }
    if (Notification.permission === 'default') {
    Notification.requestPermission()
    }
    fetchOrders()

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders(prev => [payload.new as Order, ...prev])
          // 브라우저 알림
        if (Notification.permission === 'granted') {
        const order = payload.new as Order
        new Notification('🔔 새 주문이 들어왔어요!', {
            body: `${order.table_number}번 테이블 · ${order.total_price.toLocaleString()}원`,
            icon: '/icon.png',
            badge: '/icon.png',
            tag: 'new-order',
        })
        }

        // 소리 알림
        const audio = new Audio('https://www.soundjay.com/buttons/sounds/button-09a.mp3')
        audio.play().catch(() => {})
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // 날짜별 그룹 (KST 기준)
  const dayOptions = ['전체', ...Array.from(
    new Set(orders.map(o => formatDate(o.created_at)))
  ).reverse()]

  const filteredOrders = selectedDay === '전체'
    ? orders
    : orders.filter(o => formatDate(o.created_at) === selectedDay)

  const pending = filteredOrders.filter(o => o.status === 'pending')
  const confirmed = filteredOrders.filter(o => o.status === 'confirmed')

  // 통계
  const totalRevenue = confirmed.reduce((s, o) => s + o.total_price, 0)
  const menuStats = confirmed
    .flatMap(o => o.items)
    .reduce((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + item.quantity
      return acc
    }, {} as Record<string, number>)
  const menuStatsSorted = Object.entries(menuStats).sort((a, b) => b[1] - a[1])

  const confirmOrder = async (id: number) => {
    await supabase.from('orders').update({ status: 'confirmed' }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o))
  }

  const deleteOrder = async () => {
    if (!deleteTarget) return
    await supabase.from('orders').delete().eq('id', deleteTarget.id)
    setOrders(prev => prev.filter(o => o.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const tabs = [
    { key: 'pending', label: '대기중', count: pending.length },
    { key: 'confirmed', label: '완료', count: confirmed.length },
    { key: 'stats', label: '통계', count: null },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 삭제 확인 팝업 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h2 className="font-bold text-lg text-black">주문을 삭제할까요?</h2>
            <p className="text-sm text-gray-500">
              {deleteTarget.table_number}번 테이블 · {deleteTarget.total_price.toLocaleString()}원
            </p>
            <div className="text-sm text-gray-600">
              {deleteTarget.items.map((item, i) => (
                <span key={i}>
                  {item.name} {item.quantity}개{i < deleteTarget.items.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-red-400">삭제하면 되돌릴 수 없어요.</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-medium text-sm"
              >
                취소
              </button>
              <button
                onClick={deleteOrder}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium text-sm"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
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

      {/* 날짜 필터 */}
      <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto">
        {dayOptions.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition
              ${selectedDay === day
                ? 'bg-[#189ad3] text-white'
                : 'bg-gray-100 text-gray-600'}`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* 탭 */}
      <div className="bg-white border-b flex">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition
              ${activeTab === tab.key
                ? 'border-[#189ad3] text-[#189ad3]'
                : 'border-transparent text-gray-400'}`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs
                ${tab.key === 'pending' && tab.count > 0
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-500'}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* 대기중 탭 */}
        {activeTab === 'pending' && (
          <>
            {pending.length === 0 && (
              <div className="text-center text-black py-12">대기중인 주문이 없어요</div>
            )}
            {pending.map(order => (
              <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#61B6C3]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-base text-black">{order.table_number}번 테이블</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-[#189ad3]">
                      대기중
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">{formatTime(order.created_at)}</span>
                    <button
                      onClick={() => setDeleteTarget(order)}
                      className="text-gray-300 hover:text-red-400 transition text-base"
                    >
                      🗑
                    </button>
                  </div>
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
                  <button
                    onClick={() => confirmOrder(order.id)}
                    className="px-4 py-1.5 bg-[#189ad3] text-white rounded-lg text-sm font-medium"
                  >
                    입금 확인 ✓
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* 완료 탭 */}
        {activeTab === 'confirmed' && (
          <>
            {confirmed.length === 0 && (
              <div className="text-center text-black py-12">완료된 주문이 없어요</div>
            )}
            {confirmed.map(order => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center">
                  <button
                    onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    className="flex-1 p-4 flex justify-between items-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-black">{order.table_number}번 테이블</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-black">확인됨</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[#189ad3]">{order.total_price.toLocaleString()}원</span>
                      <span className="text-gray-300 text-sm">{expandedId === order.id ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(order)}
                    className="pr-4 text-gray-300 hover:text-red-400 transition text-base"
                  >
                    🗑
                  </button>
                </div>
                {expandedId === order.id && (
                  <div className="px-4 pb-4 border-t pt-3">
                    <div className="text-sm text-gray-400 mb-2">{formatTime(order.created_at)}</div>
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="text-black">{item.name} × {item.quantity}</span>
                        <span className="font-medium text-black">{(item.price * item.quantity).toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* 통계 탭 */}
        {activeTab === 'stats' && (
        <>
            {/* 날짜별 매출 요약 */}
            {selectedDay === '전체' && (
            <div className="bg-white rounded-xl p-4">
                <h2 className="font-medium mb-3 text-black">날짜별 매출</h2>
                {dayOptions.filter(d => d !== '전체').map(day => {
                const dayConfirmed = orders.filter(
                    o => o.status === 'confirmed' && formatDate(o.created_at) === day
                )
                const dayRevenue = dayConfirmed.reduce((s, o) => s + o.total_price, 0)
                return (
                    <div key={day} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                        <span className="text-sm font-medium text-black">{day}</span>
                        <span className="ml-2 text-xs text-gray-400">완료 {dayConfirmed.length}건</span>
                    </div>
                    <span className="font-bold text-[#189ad3]">{dayRevenue.toLocaleString()}원</span>
                    </div>
                )
                })}
                <div className="flex justify-between items-center pt-3 mt-1">
                <span className="font-bold text-black">전체 합계</span>
                <span className="font-bold text-lg text-[#189ad3]">
                    {orders.filter(o => o.status === 'confirmed').reduce((s, o) => s + o.total_price, 0).toLocaleString()}원
                </span>
                </div>
            </div>
            )}

            {/* 총 매출 */}
            <div className="bg-white rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">
                총 매출 ({selectedDay === '전체' ? '전체 기간' : selectedDay} · 입금 확인 기준)
            </p>
            <p className="text-3xl font-bold text-[#189ad3]">
                {totalRevenue.toLocaleString()}원
            </p>
            <p className="text-sm text-gray-400 mt-2">
                완료 {confirmed.length}건 · 대기중 {pending.length}건
            </p>
            </div>

            {/* 메뉴별 판매량 */}
            <div className="bg-white rounded-xl p-4">
            <h2 className="font-medium mb-4 text-black">
                메뉴별 판매량 {selectedDay !== '전체' && `(${selectedDay})`}
            </h2>
            {menuStatsSorted.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">아직 완료된 주문이 없어요</p>
            )}
            {menuStatsSorted.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3 py-2 border-b last:border-0">
                <span className="text-gray-300 text-sm w-5">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-black">{name}</span>
                <div className="flex items-center gap-2">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-24">
                    <div
                        className="h-full bg-[#189ad3] rounded-full"
                        style={{ width: `${(count / (menuStatsSorted[0]?.[1] ?? 1)) * 100}%` }}
                    />
                    </div>
                    <span className="text-sm font-bold text-[#189ad3] w-8 text-right">{count}개</span>
                </div>
                </div>
            ))}
            </div>
        </>
        )}
      </div>
    </div>
  )
}