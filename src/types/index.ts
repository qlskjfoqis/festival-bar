export type Menu = {
  id: number
  name: string
  admin_name: string | null
  description: string | null
  price: number
  category: string
  is_available: boolean
  image_url: string | null
}

export type OrderItem = {
  menu_id: number
  name: string
  admin_name?: string
  price: number
  quantity: number
}

export type Order = {
  id: number
  table_number: number
  items: OrderItem[]
  total_price: number
  person_count: number
  status: 'pending' | 'payment_confirmed' | 'confirmed'
  created_at: string
  receipt_url?: string
}
