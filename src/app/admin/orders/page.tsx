'use client';

import React, { useEffect, useState } from 'react';

interface Order {
  _id: string;
  user: any;
  productName: string;
  memory: string;
  price: number;
  transactionId: string;
  status: string;
  ipAddress: string;
  username: string;
  password: string;
  os: string;
  updatedAt: Date;
}

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  // 1) Load all orders
  useEffect(() => {
    fetch('/api/orders/all')
      .then(response => response.json())
      .then((data: Order[]) => {
        // Sort by newest updatedAt (if needed)
        const sorted = data.sort((a, b) =>
          new Date(b.updatedAt || '').getTime() - new Date(a.updatedAt || '').getTime()
        );
        setOrders(sorted);
      })
      .catch(error => console.error('Failed to load orders:', error));
  }, []);

  // 2) Update local fields
  const handleInputChange = (field: keyof Order, value: string) => {
    if (!selectedOrder) return;
    setSelectedOrder(prev => prev ? { ...prev, [field]: value } : null);
  };

  // 3) Submit changes to the server
  const handleUpdate = () => {
    if (!selectedOrder) return;

    fetch('/api/orders/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: selectedOrder._id,
        ipAddress: selectedOrder.ipAddress,
        username: selectedOrder.username,
        password: selectedOrder.password,
        status: selectedOrder.status,
        os: selectedOrder.os
      })
    })
      .then(res => res.json())
      .then(() => {
        alert('Order updated successfully');
        setSelectedOrder(null);
        if (dialogRef.current) {
          dialogRef.current.close();
        }
        // Reload the list
        return fetch('/api/orders/all');
      })
      .then(res => res.json())
      .then((updatedList: Order[]) => setOrders(updatedList))
      .catch(error => console.error('Error updating order:', error));
  };

  return (
    <div className="p-4">
      <h1 className="text-center text-xl font-bold border dark:border-none-b -gray-300 pb-4">
        All Orders
      </h1>

      {/* Responsive table container */}
      <div className="my-5 mx-auto w-full max-w-4xl border dark:border-none border dark:border-none-gray-300 rounded overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead className="-gray-200">
            <tr>
              <th className="px-4 py-2">Txn ID</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Memory</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">OS</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order._id} className="border dark:border-none-t">
                <td className="px-4 py-2">{order.transactionId}</td>
                <td className="px-4 py-2">{order.productName}</td>
                <td className="px-4 py-2">{order.memory}</td>
                <td className="px-4 py-2">{order.price}</td>
                <td className="px-4 py-2">{order.status}</td>
                <td className="px-4 py-2">{order.os}</td>
                <td className="px-4 py-2">
                  <button
                    className="px-3 py-2 bg-blue-500 text-white rounded"
                    onClick={() => {
                      setSelectedOrder(order);
                      dialogRef.current?.showModal();
                    }}
                  >
                    Update
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog for updating one order */}
      {selectedOrder && (
        <dialog ref={dialogRef} className="w-full max-w-sm p-4 rounded bg- shadow-md">
          <h2 className="text-lg font-bold mb-2">Update Order</h2>
          <p className="mb-2">Set IP, Username, Password, OS or update status.</p>

          {/* Display the Transaction ID for better readability */}
          <div className="text-center font-bold text-lg mb-2">
            Transaction ID: {selectedOrder.transactionId}
          </div>

          <input
            type="text"
            placeholder="IP Address"
            value={selectedOrder.ipAddress}
            onChange={(e) => handleInputChange('ipAddress', e.target.value)}
            className="w-full px-3 py-2 mb-2 border dark:border-none border dark:border-none-gray-300 rounded"
          />
          <input
            type="text"
            placeholder="Username"
            value={selectedOrder.username}
            onChange={(e) => handleInputChange('username', e.target.value)}
            className="w-full px-3 py-2 mb-2 border dark:border-none border dark:border-none-gray-300 rounded"
          />
          <input
            type="password"
            placeholder="Password"
            value={selectedOrder.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            className="w-full px-3 py-2 mb-2 border dark:border-none border dark:border-none-gray-300 rounded"
          />

          {/* OS Field */}
          <select
            value={selectedOrder.os}
            onChange={(e) => handleInputChange('os', e.target.value)}
            className="w-full px-3 py-2 mb-2 border dark:border-none border dark:border-none-gray-300 rounded"
          >
            <option value="CentOS 7">CentOS 7</option>
            <option value="Ubuntu 22">Ubuntu 22</option>
          </select>

          {/* Status Field */}
          <select
            value={selectedOrder.status}
            onChange={(e) => handleInputChange('status', e.target.value)}
            className="w-full px-3 py-2 mb-2 border dark:border-none border dark:border-none-gray-300 rounded"
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="completed">Completed</option>
            <option value="invalid">Invalid</option>
          </select>

          <div className="flex justify-between mt-4">
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded"
              onClick={handleUpdate}
            >
              Save Changes
            </button>
            <button
              className="px-4 py-2 bg-red-500 text-white rounded"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};

export default AdminOrders;
