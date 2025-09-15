'use client';

import React, { useEffect, useState } from 'react';

const AdminOrders = () => {
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const dialogRef = React.useRef(null); // Reference for native <dialog>

    useEffect(() => {
        fetch('/api/orders/all')
            .then(response => response.json())
            .then(data => {
                const sortedOrders = data.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
                setOrders(sortedOrders);
            })
            .catch(error => console.error('Failed to load orders:', error));
    }, []);

    const handleInputChange = (field, value) => {
        setSelectedOrder(prev => (prev ? { ...prev, [field]: value } : null));
    };

    const handleUpdate = () => {
        if (selectedOrder) {
            fetch('/api/orders/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder._id,
                    username: selectedOrder.username,
                    password: selectedOrder.password,
                    ipAddress: selectedOrder.ipAddress,
                })
            })
                .then(response => response.json())
                .then(() => {
                    alert('Order updated successfully');
                    setSelectedOrder(null);
                    dialogRef.current.close();
                })
                .catch(error => console.error('Error updating order:', error));
        }
    };

    return (
        <div>
            <h1 style={styles.header}>All Orders - Update Credentials</h1>
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th>Payment ID</th>
                            <th>Product Name</th>
                            <th>Memory</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order._id}>
                                <td>{order.paymentId}</td>
                                <td>{order.productName}</td>
                                <td>{order.memory}</td>
                                <td>{order.status}</td>
                                <td>
                                    <button style={styles.button} onClick={() => {
                                        setSelectedOrder(order);
                                        dialogRef.current.showModal();
                                    }}>
                                        Update
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedOrder && (
                <dialog ref={dialogRef} style={styles.dialog}>
                    <h2>Update Order</h2>
                    <p>Update IP, Username, and Password for the order.</p>

                    <input
                        type="text"
                        placeholder="IP Address"
                        value={selectedOrder.ipAddress || ''}
                        onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                        style={styles.input}
                    />
                    <input
                        type="text"
                        placeholder="Username"
                        value={selectedOrder.username || ''}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        style={styles.input}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={selectedOrder.password || ''}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        style={styles.input}
                    />

                    <div style={styles.buttonGroup}>
                        <button style={styles.button} onClick={handleUpdate}>Save Changes</button>
                        <button style={styles.buttonClose} onClick={() => dialogRef.current.close()}>Close</button>
                    </div>
                </dialog>
            )}
        </div>
    );
};

export default AdminOrders;

// Native CSS Styles
const styles = {
    header: {
        padding: '16px',
        fontSize: '20px',
        fontWeight: 'bold',
        border dark: border - noneBottom: '2px solid #ddd',
        textAlign: 'center'
    },
    tableContainer: {
        margin: '20px auto',
        width: '90%',
        border dark: border - none: '1px solid #ddd',
        border dark: border - noneRadius: '5px',
        overflow: 'hidden'
    },
    table: {
        width: '100%',
        border dark: border - noneCollapse: 'collapse',
        textAlign: 'left'
    },
    button: {
        padding: '8px 12px',
        margin: '5px',
        backgroundColor: '#007bff',
        color: 'white',
        border dark: border - none: 'none',
        cursor: 'pointer',
        border dark: border - noneRadius: '5px'
    },
    buttonClose: {
        padding: '8px 12px',
        margin: '5px',
        backgroundColor: '#dc3545',
        color: 'white',
        border dark: border - none: 'none',
        cursor: 'pointer',
        border dark: border - noneRadius: '5px'
    },
    dialog: {
        width: '300px',
        padding: '20px',
        border dark: border - noneRadius: '8px',
        border dark: border - none: 'none',
        backgroundColor: 'white',
        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)'
    },
    input: {
        display: 'block',
        width: '100%',
        padding: '8px',
        marginBottom: '10px',
        border dark: border - none: '1px solid #ddd',
        border dark: border - noneRadius: '4px'
    },
    buttonGroup: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '10px'
    }
};
