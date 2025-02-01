'use client';

import { useEffect, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from '@/components/ui/dialog'; // Adjusted path if necessary
import { Select } from '@/components/ui/select';

interface MemoryOptionDetails {
    price: number;
}

interface IPStock {
    _id: string;
    name: string;
    memoryOptions: Record<string, MemoryOptionDetails>;
    available: boolean;
}

const ManageIpStock = () => {
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const [currentStock, setCurrentStock] = useState<IPStock | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        const fetchIPStocks = async () => {
            const response = await fetch('/api/ipstock');
            const data = await response.json();
            setIpStocks(data);
        };
        fetchIPStocks();
    }, []);

    const handleEdit = (stock: IPStock) => {
        setCurrentStock({ ...stock });
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/ipstock/update`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: id })
            });
            setIpStocks(prev => prev.filter(stock => stock._id !== id));
            toast.success('IP Stock deleted successfully!');
        } catch (error) {
            toast.error('Failed to delete IP stock');
        }
    };

    const handleUpdate = async () => {
        if (currentStock) {
            try {
                const response = await fetch(`/api/ipstock/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentStock)
                });
                if (response.ok) {
                    setIpStocks(prev => prev.map(stock => stock._id === currentStock._id ? currentStock : stock));
                    toast.success('IP Stock updated successfully!');
                    setIsDialogOpen(false);
                } else {
                    throw new Error('Failed to update IP stock');
                }
            } catch (error) {
                toast.error('Failed to update IP stock');
            }
        }
    };

    const handlePriceChange = (size: keyof MemoryOptionDetails, value: string) => {
        if (currentStock) {
            const updatedPrices = {
                ...currentStock.memoryOptions,
                [size]: { ...currentStock.memoryOptions[size], price: parseFloat(value) }
            };
            setCurrentStock({
                ...currentStock,
                memoryOptions: updatedPrices
            });
        }
    };

    const handleAvailableChange = (value: string) => {
        if (currentStock) {
            setCurrentStock({ ...currentStock, available: value === "true" });
        }
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex gap-2 items-center border-b p-4'>
                <h1 className='text-xl'>Manage IP Stock</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>4 GB</TableHead>
                            <TableHead>8 GB</TableHead>
                            <TableHead>16 GB</TableHead>
                            <TableHead>Edit</TableHead>
                            <TableHead>Delete</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ipStocks.map(stock => (
                            <TableRow key={stock._id}>
                                <TableCell>{stock.name}</TableCell>
                                <TableCell>{stock.available ? 'Yes' : 'No'}</TableCell>
                                {Object.entries(stock.memoryOptions).map(([memory, details]) => (
                                    <TableCell key={memory}>{details.price}</TableCell>
                                ))}
                                <TableCell>
                                    <Button onClick={() => handleEdit(stock)}>Edit</Button>
                                </TableCell>
                                <TableCell>
                                    <Button onClick={() => handleDelete(stock._id)}>Delete</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {isDialogOpen && currentStock && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Edit IP Stock</DialogTitle>
                            </DialogHeader>
                            <DialogDescription>
                                Update the details of the IP stock.
                            </DialogDescription>
                            <Input
                                value={currentStock.name}
                                onChange={(e) => setCurrentStock({ ...currentStock, name: e.target.value })}
                            />
                            <select className='flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1' value={currentStock.available.toString()} onChange={(e) => handleAvailableChange(e.target.value)}>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                            {Object.keys(currentStock.memoryOptions).map((size) => (
                                <div key={size}>
                                    <label>{size} Price:</label>
                                    <Input
                                        type="number"
                                        value={currentStock.memoryOptions[size].price}
                                        onChange={(e) => handlePriceChange(size as keyof MemoryOptionDetails, e.target.value)}
                                    />
                                </div>
                            ))}
                            <DialogFooter>
                                <Button onClick={handleUpdate}>Update</Button>
                                <DialogClose asChild>
                                    <Button>Close</Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </div>
    );
};

export default ManageIpStock;
