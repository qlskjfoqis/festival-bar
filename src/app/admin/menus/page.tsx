'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Menu } from '@/types'

export default function MenuManagePage() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [uploading, setUploading] = useState<number | null>(null)

  useEffect(() => {
    const fetchMenus = async () => {
      const { data } = await supabase
        .from('menus')
        .select('*')
        .order('category')
      if (data) setMenus(data)
    }
    fetchMenus()
  }, [])

  const uploadImage = async (menu: Menu, file: File) => {
    setUploading(menu.id)
    const ext = file.name.split('.').pop()
    const path = `${menu.id}.${ext}`

    // 기존 이미지 삭제 후 업로드
    await supabase.storage.from('menu-images').remove([path])
    const { error } = await supabase.storage
      .from('menu-images')
      .upload(path, file, { upsert: true })

    if (!error) {
      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(path)
      const image_url = urlData.publicUrl

      await supabase.from('menus').update({ image_url }).eq('id', menu.id)
      setMenus(prev =>
        prev.map(m => m.id === menu.id ? { ...m, image_url } : m)
      )
    }
    setUploading(null)
  }

  const removeImage = async (menu: Menu) => {
    const ext = menu.image_url?.split('.').pop()
    await supabase.storage.from('menu-images').remove([`${menu.id}.${ext}`])
    await supabase.from('menus').update({ image_url: null }).eq('id', menu.id)
    setMenus(prev =>
      prev.map(m => m.id === menu.id ? { ...m, image_url: null } : m)
    )
  }

  const toggleAvailable = async (menu: Menu) => {
    const is_available = !menu.is_available
    await supabase.from('menus').update({ is_available }).eq('id', menu.id)
    setMenus(prev =>
      prev.map(m => m.id === menu.id ? { ...m, is_available } : m)
    )
  }

  const categories = Array.from(new Set(menus.map(m => m.category)))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-4 py-3 shadow-sm">
        <h1 className="font-bold text-lg text-black">🍽 메뉴 관리</h1>
        <p className="text-xs text-gray-400">이미지 업로드 · 품절 처리</p>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {categories.map(cat => (
          <div key={cat}>
            <h2 className="font-bold text-sm text-gray-400 mb-2">{cat}</h2>
            <div className="flex flex-col gap-2">
              {menus.filter(m => m.category === cat).map(menu => (
                <div
                  key={menu.id}
                  className={`bg-white rounded-xl p-4 shadow-sm flex gap-4 items-center
                    ${!menu.is_available ? 'opacity-50' : ''}`}
                >
                  {/* 이미지 영역 */}
                  <div className="relative w-20 h-20 flex-shrink-0">
                    {menu.image_url ? (
                      <>
                        <img
                          src={menu.image_url}
                          alt={menu.name}
                          className="w-20 h-20 rounded-xl object-cover"
                        />
                        <button
                          onClick={() => removeImage(menu)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <label className="w-20 h-20 rounded-xl bg-gray-100 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition">
                        {uploading === menu.id ? (
                          <span className="text-xs text-gray-400">업로드중</span>
                        ) : (
                          <>
                            <span className="text-2xl">📷</span>
                            <span className="text-xs text-gray-400 mt-1">사진 추가</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) uploadImage(menu, file)
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {/* 메뉴 정보 */}
                  <div className="flex-1">
                    <div className="font-medium text-black">{menu.name}</div>
                    <div className="text-sm text-[#189ad3] font-bold mt-0.5">
                      {menu.price.toLocaleString()}원
                    </div>
                  </div>

                  {/* 품절 토글 */}
                  <button
                    onClick={() => toggleAvailable(menu)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
                      ${menu.is_available
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-500'}`}
                  >
                    {menu.is_available ? '판매중' : '품절'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}