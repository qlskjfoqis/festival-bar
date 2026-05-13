'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { Order, OrderItem } from '@/types'

const toKST = (utcString: string) => {
  const date = new Date(utcString)
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

const formatTime = (utcString: string) =>
  toKST(utcString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

const formatDate = (utcString: string) =>
  toKST(utcString).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

const getRelativeTime = (utcString: string) => {
  const diff = Math.floor((Date.now() - toKST(utcString).getTime()) / 1000)
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return formatTime(utcString)
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'stats'>('pending')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>('전체')
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set())
  // menu_id → admin_name, customer name → admin_name (for set constituent lookup)
  const [nameById, setNameById] = useState<Record<number, string>>({})
  const [nameByCustomer, setNameByCustomer] = useState<Record<string, string>>({})

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()

    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (data) setOrders(data)
    }

    const fetchMenuNames = async () => {
      const { data } = await supabase.from('menus').select('id, name, admin_name')
      if (!data) return
      const byId: Record<number, string> = {}
      const byCustomer: Record<string, string> = {}
      for (const m of data) {
        if (m.admin_name) {
          byId[m.id] = m.admin_name
          byCustomer[m.name] = m.admin_name
        }
      }
      setNameById(byId)
      setNameByCustomer(byCustomer)
    }

    fetchOrders()
    fetchMenuNames()

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const order = payload.new as Order
        setOrders(prev => [order, ...prev])
        setNewOrderIds(prev => new Set([...prev, order.id]))
        setTimeout(() => {
          setNewOrderIds(prev => {
            const next = new Set(prev)
            next.delete(order.id)
            return next
          })
        }, 15_000)
        new Audio('https://www.soundjay.com/buttons/sounds/button-09a.mp3').play().catch(() => {})
        if ('serviceWorker' in navigator && Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then(reg =>
            reg.active?.postMessage({
              type: 'NEW_ORDER',
              body: `${order.table_number}번 테이블 · ${order.total_price.toLocaleString()}원`,
            })
          )
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const updated = payload.new as Order
        setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => prev.filter(o => o.id !== (payload.old as Order).id))
      })
      .subscribe()

    // 실시간 연결이 끊겼을 때를 대비한 폴링 (30초마다)
    const poll = setInterval(fetchOrders, 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [])

  const dayOptions = ['전체', ...Array.from(new Set(orders.map(o => formatDate(o.created_at)))).reverse()]
  const filteredOrders = selectedDay === '전체' ? orders : orders.filter(o => formatDate(o.created_at) === selectedDay)
  const pending = filteredOrders.filter(o => o.status === 'pending')
  const confirmed = filteredOrders.filter(o => o.status === 'payment_confirmed' || o.status === 'confirmed')
  // 주문 아이템을 admin_name 기준으로 표시
  // 1순위: 주문에 저장된 admin_name (새 주문)
  // 2순위: menu_id로 menus 테이블 조회 (기존 주문 일반 메뉴)
  // 3순위: 세트 구성 항목 이름을 nameByCustomer로 치환 (기존 주문 세트)
  const getAdminName = (item: OrderItem): string => {
    if (item.admin_name) return item.admin_name

    // 세트 이름 패턴: "세트명 (항목1 · 항목2)"
    const match = item.name.match(/^(.+?)\s*\((.+)\)$/)
    if (match) {
      const setName = nameById[item.menu_id] || match[1]
      const parts = match[2].split(' · ').map(p => nameByCustomer[p.trim()] || p.trim())
      return `${setName} (${parts.join(' · ')})`
    }

    return nameById[item.menu_id] || item.name
  }

  const TABLE_FEE_PER_PERSON = 1000
  const fullyConfirmed = filteredOrders.filter(o => o.status === 'confirmed')
  const totalRevenue = confirmed.reduce((s, o) => s + o.total_price, 0)
  const totalTableFee = confirmed.reduce((s, o) => s + (o.person_count > 0 ? o.person_count * TABLE_FEE_PER_PERSON : 0), 0)
  const totalMenuRevenue = totalRevenue - totalTableFee

  const menuStats = fullyConfirmed
    .flatMap(o => o.items)
    .reduce((acc, item) => {
      const key = getAdminName(item)
      acc[key] = (acc[key] || 0) + item.quantity
      return acc
    }, {} as Record<string, number>)
  const menuStatsSorted = Object.entries(menuStats).sort((a, b) => b[1] - a[1])

  const confirmPayment = async (id: number) => {
    await supabase.from('orders').update({ status: 'payment_confirmed' }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'payment_confirmed' } : o))
  }

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

  const downloadExcel = () => {
    const period = selectedDay === '전체' ? '전체기간' : selectedDay

    // 메뉴별 수량 + 매출 계산
    const menuData: Record<string, { qty: number; revenue: number }> = {}
    fullyConfirmed.forEach(o => {
      o.items.forEach(item => {
        const name = getAdminName(item)
        if (!menuData[name]) menuData[name] = { qty: 0, revenue: 0 }
        menuData[name].qty += item.quantity
        menuData[name].revenue += item.price * item.quantity
      })
    })
    const menuSorted = Object.entries(menuData).sort((a, b) => b[1].qty - a[1].qty)
    const totalQty = menuSorted.reduce((s, [, { qty }]) => s + qty, 0)

    const rows: (string | number)[][] = []

    // 헤더
    rows.push(['게스트하우스융 정산 리포트'])
    rows.push([`기간: ${period}`])
    rows.push([])

    // 매출 요약
    rows.push(['▣ 매출 요약'])
    rows.push(['총 매출', totalRevenue])
    rows.push(['  메뉴 매출', totalMenuRevenue])
    rows.push(['  테이블비', totalTableFee])
    rows.push(['완료 건수', `${confirmed.length}건`])
    rows.push([])

    // 날짜별 매출 (전체 기간일 때만)
    if (selectedDay === '전체') {
      rows.push(['▣ 날짜별 매출'])
      rows.push(['날짜', '완료 건수', '매출'])
      dayOptions.filter(d => d !== '전체').forEach(day => {
        const dayOrders = orders.filter(o => o.status === 'confirmed' && formatDate(o.created_at) === day)
        rows.push([day, dayOrders.length, dayOrders.reduce((s, o) => s + o.total_price, 0)])
      })
      rows.push([])
    }

    // 메뉴별 판매량
    rows.push(['▣ 메뉴별 판매량 (많이 팔린 순)'])
    rows.push(['순위', '메뉴명', '판매 수량', '매출'])
    menuSorted.forEach(([name, { qty, revenue }], i) => {
      rows.push([i + 1, name, qty, revenue])
    })
    rows.push(['합계', '', totalQty, totalMenuRevenue])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 16 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '정산 리포트')
    XLSX.writeFile(wb, `게스트하우스융_${period}.xlsx`)
  }

  const tabs = [
    { key: 'pending', label: '대기중', count: pending.length },
    { key: 'confirmed', label: '완료', count: confirmed.length },
    { key: 'stats', label: '통계', count: null },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 이미지 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="입금 내역"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl bg-black/40 w-10 h-10 rounded-full flex items-center justify-center"
          >
            ×
          </button>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h2 className="font-bold text-lg text-black">주문을 삭제할까요?</h2>
            <p className="text-sm text-gray-500">
              {deleteTarget.table_number}번 테이블 · {deleteTarget.total_price.toLocaleString()}원
            </p>
            <div className="flex flex-wrap gap-1.5">
              {deleteTarget.items.map((item, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {getAdminName(item)} {item.quantity}개
                </span>
              ))}
            </div>
            <p className="text-xs text-red-400">삭제하면 되돌릴 수 없어요.</p>
            <div className="flex gap-2">
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
      <div className="bg-white px-4 py-3.5 shadow-sm sticky top-0 z-20">
        <div className="flex justify-between items-center">
          <h1 className="font-bold text-lg text-black">주문 관리</h1>
          {pending.length > 0 ? (
            <span className="bg-red-500 text-white text-sm px-3 py-1 rounded-full font-bold animate-pulse">
              대기 {pending.length}건
            </span>
          ) : (
            <span className="bg-gray-100 text-gray-400 text-sm px-3 py-1 rounded-full font-medium">
              대기 없음
            </span>
          )}
        </div>
      </div>

      {/* 날짜 필터 */}
      <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto">
        {dayOptions.map(day => (
          <button
            key={day}
            onClick={() => setSelectedDay(day)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap font-medium transition
              ${selectedDay === day ? 'bg-[#189ad3] text-white' : 'bg-gray-100 text-gray-500'}`}
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
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition
              ${activeTab === tab.key ? 'border-[#189ad3] text-[#189ad3]' : 'border-transparent text-gray-400'}`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold
                ${tab.key === 'pending' && tab.count > 0
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-500'}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-4 pb-10">
        {/* 대기중 탭 */}
        {activeTab === 'pending' && (
          <>
            {pending.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">✅</div>
                <p className="font-semibold text-gray-600">대기중인 주문이 없어요</p>
                <p className="text-sm text-gray-400 mt-1">새 주문이 들어오면 알림이 울려요</p>
              </div>
            )}
            {pending.map(order => {
              const isNew = newOrderIds.has(order.id)
              const isAdditional = order.person_count === 0
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl overflow-hidden transition-all
                    ${isNew
                      ? 'ring-2 ring-orange-400 shadow-lg shadow-orange-100'
                      : 'border border-gray-100 shadow-sm'}`}
                >
                  {isNew && (
                    <div className="bg-orange-400 px-4 py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping inline-block" />
                      <span className="text-white text-sm font-bold">새 주문이 들어왔어요!</span>
                    </div>
                  )}

                  <div className="p-5">
                    {/* 테이블 번호 + 시간 */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl font-black text-gray-900 leading-none">
                          {order.table_number}번
                        </span>
                        {isAdditional ? (
                          <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                            추가주문
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 font-medium">{order.person_count}명</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">{getRelativeTime(order.created_at)}</span>
                        <button
                          onClick={() => setDeleteTarget(order)}
                          className="text-gray-900 hover:text-red-400 transition p-1.5 ml-1 text-xl"
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* 메뉴 아이템 칩 */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {order.items.map((item, i) => (
                        <div
                          key={i}
                          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2"
                        >
                          <span className="font-semibold text-gray-800 text-sm">{getAdminName(item)}</span>
                          <span className="bg-[#189ad3] text-white text-xs font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5">
                            {item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* 입금 캡처 */}
                    {order.receipt_url && (
                      <div className="mb-5">
                        <button
                          onClick={() => setLightboxUrl(order.receipt_url!)}
                          className="relative group w-full"
                        >
                          <img
                            src={order.receipt_url}
                            alt="입금 캡처"
                            className="w-full max-h-36 object-cover rounded-xl border border-gray-100"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition rounded-xl flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-xs bg-black/50 px-2 py-1 rounded-full transition">
                              크게 보기
                            </span>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* 금액 + 입금 확인 버튼 */}
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-gray-800">
                        {order.total_price.toLocaleString()}원
                      </span>
                      <button
                        onClick={() => confirmPayment(order.id)}
                        className="flex-1 py-3.5 bg-[#189ad3] hover:bg-[#1588bb] active:scale-95 text-white rounded-xl font-bold text-base transition"
                      >
                        💰 입금 확인
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* 완료 탭 */}
        {activeTab === 'confirmed' && (
          <>
            {confirmed.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📋</div>
                <p className="font-semibold text-gray-500">완료된 주문이 없어요</p>
              </div>
            )}

            {/* 칠판 기재 대기 */}
            {confirmed.filter(o => o.status === 'payment_confirmed').map(order => (
              <div key={order.id} className="bg-sky-50 rounded-2xl overflow-hidden shadow-sm ring-2 ring-[#189ad3]">
                {/* 테이블 번호 + 금액 */}
                <div className="px-5 pt-5 pb-4 flex justify-between items-start">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black text-gray-900 leading-none">{order.table_number}</span>
                      <span className="text-2xl font-black text-gray-600 leading-none">번</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      {order.person_count === 0
                        ? <span className="text-xs bg-blue-50 text-blue-400 px-2.5 py-1 rounded-full font-medium">추가주문</span>
                        : <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                            👤 {order.person_count}명
                          </span>
                      }
                      <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                        🕐 {formatTime(order.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => setDeleteTarget(order)}
                      className="w-8 h-8 rounded-xl bg-gray-400/20 hover:bg-red-100 text-gray-500 hover:text-red-400 transition flex items-center justify-center text-sm"
                    >
                      🗑
                    </button>
                    <span className="text-xl font-black text-[#189ad3]">{order.total_price.toLocaleString()}원</span>
                  </div>
                </div>

                {/* 구분선 */}
                <div className="mx-5 border-t border-gray-100" />

                {/* 메뉴 칩 */}
                <div className="px-5 py-4 flex flex-wrap gap-2">
                  {order.items.map((item, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{getAdminName(item)}</span>
                      <span className="bg-[#189ad3] text-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center leading-none">{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* 주문 확인 버튼 */}
                <div className="px-5 pb-5">
                  <button
                    onClick={() => confirmOrder(order.id)}
                    className="w-full py-4 rounded-2xl font-bold text-base text-white bg-[#189ad3] shadow-lg shadow-[#189ad3]/40 hover:bg-[#1588bb] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#189ad3]/50 active:translate-y-0 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    ✓ 주문 확인
                  </button>
                </div>
              </div>
            ))}

            {/* 완료된 주문 */}
            {confirmed.filter(o => o.status === 'confirmed').length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="text-xs font-semibold text-gray-400">완료</span>
                  <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">
                    {confirmed.filter(o => o.status === 'confirmed').length}
                  </span>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {confirmed.filter(o => o.status === 'confirmed').map(order => (
                    <div key={order.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                          className="flex-1 px-4 py-3.5 flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">{order.table_number}번</span>
                            <span className="text-xs text-gray-400">{formatTime(order.created_at)}</span>
                            {order.person_count === 0
                              ? <span className="text-xs bg-blue-50 text-blue-400 px-1.5 py-0.5 rounded-full">추가</span>
                              : <span className="text-xs text-gray-400">{order.person_count}명</span>
                            }
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                              {order.items.reduce((s, i) => s + i.quantity, 0)}개
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm text-gray-700">{order.total_price.toLocaleString()}원</span>
                            <span className="text-gray-300 text-xs">{expandedId === order.id ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        <button onClick={() => setDeleteTarget(order)} className="pr-4 text-gray-200 hover:text-red-400 transition text-sm">🗑</button>
                      </div>

                      {expandedId === order.id && (
                        <div className="px-4 pb-3 pt-2 bg-gray-50 flex flex-wrap gap-1.5">
                          {order.items.map((item, i) => (
                            <div key={i} className="bg-white border border-gray-100 rounded-lg px-2.5 py-1 flex items-center gap-1">
                              <span className="text-xs text-gray-700">{getAdminName(item)}</span>
                              <span className="text-xs font-bold text-gray-400">×{item.quantity}</span>
                            </div>
                          ))}
                          {order.receipt_url && (
                            <button onClick={() => setLightboxUrl(order.receipt_url!)} className="w-full mt-2">
                              <img src={order.receipt_url} alt="입금 캡처" className="w-full max-h-32 object-cover rounded-lg border border-gray-100" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 통계 탭 */}
        {activeTab === 'stats' && (
          <>
            <div className="bg-white rounded-2xl p-5">
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm text-gray-400">
                  총 매출 ({selectedDay === '전체' ? '전체 기간' : selectedDay} · 입금 확인 기준)
                </p>
                <button
                  onClick={downloadExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-100 hover:bg-sky-200 active:scale-95 text-sky-600 rounded-xl text-xs font-semibold transition"
                >
                  📥 엑셀
                </button>
              </div>
              <p className="text-4xl font-black text-[#189ad3]">{totalRevenue.toLocaleString()}원</p>
              <p className="text-sm text-gray-400 mt-2">완료 {confirmed.length}건 · 대기중 {pending.length}건</p>
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">메뉴 매출</span>
                  <span className="text-sm font-bold text-gray-700">{totalMenuRevenue.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">테이블비</span>
                  <span className="text-sm font-bold text-gray-700">{totalTableFee.toLocaleString()}원</span>
                </div>
              </div>
            </div>

            {selectedDay === '전체' && (
              <div className="bg-white rounded-xl p-4">
                <h2 className="font-semibold mb-3 text-black">날짜별 매출</h2>
                {dayOptions.filter(d => d !== '전체').map(day => {
                  const dayConfirmed = orders.filter(o => o.status === 'confirmed' && formatDate(o.created_at) === day)
                  const dayRevenue = dayConfirmed.reduce((s, o) => s + o.total_price, 0)
                  return (
                    <div key={day} className="flex justify-between items-center py-2.5 border-b last:border-0">
                      <div>
                        <span className="text-sm font-medium text-black">{day}</span>
                        <span className="ml-2 text-xs text-gray-400">완료 {dayConfirmed.length}건</span>
                      </div>
                      <span className="font-bold text-[#189ad3]">{dayRevenue.toLocaleString()}원</span>
                    </div>
                  )
                })}
                <div className="flex justify-between items-center pt-3">
                  <span className="font-bold text-black">전체 합계</span>
                  <span className="font-bold text-lg text-[#189ad3]">
                    {orders.filter(o => o.status === 'confirmed').reduce((s, o) => s + o.total_price, 0).toLocaleString()}원
                  </span>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl p-4">
              <h2 className="font-semibold mb-4 text-black">
                메뉴별 판매량 {selectedDay !== '전체' && `(${selectedDay})`}
              </h2>
              {menuStatsSorted.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">아직 완료된 주문이 없어요</p>
              )}
              {menuStatsSorted.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3 py-2.5 border-b last:border-0">
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
