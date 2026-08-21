"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function ordermanagement() {
  const [orders, setOrders] = useState([
    {
      id: "ORD001",
      user: "John Doe",
      status: "Pending",
    },
    {
      id: "ORD002",
      user: "Jane Smith",
      status: "Pending",
    },
    {
      id: "ORD003",
      user: "Bob Johnson",
      status: "Completed",
    },
    {
      id: "ORD004",
      user: "Sarah Lee",
      status: "Pending",
    },
    {
      id: "ORD005",
      user: "Tom Wilson",
      status: "Completed",
    },
  ])
  const toggleOrderStatus = (index: any) => {
    const updatedOrders = [...orders]
    updatedOrders[index].status = updatedOrders[index].status === "Pending" ? "Completed" : "Pending"
    setOrders(updatedOrders)
  }
  return (
    <div className="bg-background p-6 md:p-8 lg:p-10">
      <h1 className="mb-6 text-2xl font-bold text-primary-foreground">Order Management</h1>
      <div className="overflow-x-auto">
        <table className="w-full border dark:border-none-collapse text-left text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-3 font-medium text-primary-foreground">Order ID</th>
              <th className="px-4 py-3 font-medium text-primary-foreground">User</th>
              <th className="px-4 py-3 font-medium text-primary-foreground">Status</th>
              <th className="px-4 py-3 font-medium text-primary-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
              <tr key={order.id} className="border dark:border-none-b border dark:border-none-muted/40 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-primary-foreground">{order.id}</td>
                <td className="px-4 py-3 text-primary-foreground">{order.user}</td>
                <td className="px-4 py-3 text-primary-foreground">
                  <Badge variant={order.status === "Pending" ? "outline" : "secondary"}>{order.status}</Badge>
                </td>
                <td className="px-4 py-3 text-primary-foreground">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`order-${index}`}
                      checked={order.status === "Completed"}
                      onCheckedChange={() => toggleOrderStatus(index)}
                    />
                    <Label htmlFor={`order-${index}`}>{order.status === "Pending" ? "Complete" : "Pending"}</Label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
