'use client';

import { useEffect, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

interface MemoryOptionDetails {
    price: number;
}

// Update the PromoCode interface
interface PromoCode {
    code: string;
    discount: number;
    discountType: 'percentage' | 'fixed';
    isActive: boolean;
    createdAt?: string;
}
// Update interface
interface IPStock {
    _id: string;
    name: string;
    memoryOptions: Record<string, MemoryOptionDetails>;
    available: boolean;
    serverType: string;
    tags: string[]; // Add tags field
    promoCodes: PromoCode[];
}



const ManageIpStock = () => {
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const [currentStock, setCurrentStock] = useState<IPStock | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPromoCode, setNewPromoCode] = useState('');
    const [newPromoDiscount, setNewPromoDiscount] = useState('');
    // Add state for discount type in new promo codes
    const [newPromoDiscountType, setNewPromoDiscountType] = useState<'percentage' | 'fixed'>('fixed');
    // In the component, add tag management state
    const [newTag, setNewTag] = useState('');
    useEffect(() => {
        const fetchIPStocks = async () => {
            const response = await fetch('/api/ipstock');
            const data = await response.json();
            setIpStocks(data);
        };
        fetchIPStocks();
    }, []);
    // Add tag management functions
    const addTag = () => {
        if (currentStock && newTag.trim() && !currentStock.tags.includes(newTag.trim().toLowerCase())) {
            setCurrentStock({
                ...currentStock,
                tags: [...currentStock.tags, newTag.trim().toLowerCase()]
            });
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        if (currentStock) {
            setCurrentStock({
                ...currentStock,
                tags: currentStock.tags.filter(tag => tag !== tagToRemove)
            });
        }
    };
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

    // Update the addPromoCode function
    const addPromoCode = () => {
        if (currentStock && newPromoCode && newPromoDiscount) {
            const discount = parseFloat(newPromoDiscount);
            if (discount >= 0) {
                if (newPromoDiscountType === 'percentage' && discount > 100) {
                    toast.error('Percentage discount cannot exceed 100%');
                    return;
                }

                const updatedPromoCodes = [...(currentStock.promoCodes || []), {
                    code: newPromoCode.toUpperCase(),
                    discount,
                    discountType: newPromoDiscountType,
                    isActive: true
                }];
                setCurrentStock({
                    ...currentStock,
                    promoCodes: updatedPromoCodes
                });
                setNewPromoCode('');
                setNewPromoDiscount('');
            } else {
                toast.error('Discount must be a positive number');
            }
        }
    };


    const removePromoCode = (index: number) => {
        if (currentStock) {
            const updatedPromoCodes = currentStock.promoCodes.filter((_, i) => i !== index);
            setCurrentStock({
                ...currentStock,
                promoCodes: updatedPromoCodes
            });
        }
    };

    const togglePromoCodeActive = (index: number) => {
        if (currentStock) {
            const updatedPromoCodes = currentStock.promoCodes.map((promo, i) =>
                i === index ? { ...promo, isActive: !promo.isActive } : promo
            );
            setCurrentStock({
                ...currentStock,
                promoCodes: updatedPromoCodes
            });
        }
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex gap-2 items-center border-b p-4'>
                <h1 className='text-xl'>Manage IP Stock</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    {/* // In the table header, add Server Type column: */}
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead> {/* Add this */}
                            <TableHead>Available</TableHead>
                            <TableHead>4 GB</TableHead>
                            <TableHead>8 GB</TableHead>
                            <TableHead>16 GB</TableHead>
                            <TableHead>Promo Codes</TableHead>
                            <TableHead>Edit</TableHead>
                            <TableHead>Delete</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {ipStocks.map(stock => (
                            <TableRow key={stock._id}>
                                <TableCell>{stock.name}</TableCell>
                                <TableCell>
                                    <Badge variant={stock.serverType === 'VPS' ? 'default' : 'secondary'}>
                                        {stock.serverType}
                                    </Badge>
                                </TableCell> {/* Add this */}
                                <TableCell>{stock.available ? 'Yes' : 'No'}</TableCell>
                                {Object.entries(stock.memoryOptions).map(([memory, details]) => (
                                    <TableCell key={memory}>₹{details.price}</TableCell>
                                ))}

                                <TableCell>
                                    {stock.promoCodes?.length > 0 ? (
                                        <div className="text-xs">
                                            {stock.promoCodes.slice(0, 2).map((promo, idx) => (
                                                <div key={idx}>
                                                    {promo.code} ({promo.discountType === 'fixed' ? `₹${promo.discount}` : `${promo.discount}%`})
                                                </div>
                                            ))}
                                            {stock.promoCodes.length > 2 && (
                                                <div>+{stock.promoCodes.length - 2} more</div>
                                            )}
                                        </div>
                                    ) : (
                                        'No promo codes'
                                    )}
                                </TableCell>


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
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Edit IP Stock</DialogTitle>
                            </DialogHeader>
                            <DialogDescription>
                                Update the details of the IP stock.
                            </DialogDescription>
                            <div className="space-y-4">
                                <div>
                                    <Label>Name:</Label>
                                    <Input
                                        value={currentStock.name}
                                        onChange={(e) => setCurrentStock({ ...currentStock, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label>Available:</Label>
                                    <select
                                        className='flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1'
                                        value={currentStock.available.toString()}
                                        onChange={(e) => handleAvailableChange(e.target.value)}
                                    >
                                        <option value="true">Yes</option>
                                        <option value="false">No</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>Server Type:</Label>
                                    <Select value={currentStock.serverType} onValueChange={(value) => setCurrentStock({ ...currentStock, serverType: value })}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Linux">Linux</SelectItem>
                                            <SelectItem value="VPS">VPS</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {Object.keys(currentStock.memoryOptions).map((size) => (
                                    <div key={size}>
                                        <Label>{size} Price:</Label>
                                        <Input
                                            type="number"
                                            value={currentStock.memoryOptions[size].price}
                                            onChange={(e) => handlePriceChange(size as keyof MemoryOptionDetails, e.target.value)}
                                        />
                                    </div>
                                ))}
                                <div>
                                    <Label className="text-base font-semibold">Tags:</Label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            type="text"
                                            placeholder="Add tag"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            className="flex-1"
                                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                        />
                                        <Button type="button" onClick={addTag}>Add</Button>
                                    </div>

                                    {currentStock.tags && currentStock.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {currentStock.tags.map((tag, index) => (
                                                <Badge
                                                    key={index}
                                                    variant="secondary"
                                                    className="flex items-center gap-1"
                                                >
                                                    {tag}
                                                    <X
                                                        className="h-3 w-3 cursor-pointer"
                                                        onClick={() => removeTag(tag)}
                                                    />
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Promo Codes Management */}
                                <div>
                                    <Label className="text-base font-semibold">Promo Codes:</Label>
                                    <div className="grid grid-cols-12 gap-2 mb-2">
                                        <Input
                                            type="text"
                                            placeholder="Promo Code"
                                            value={newPromoCode}
                                            onChange={(e) => setNewPromoCode(e.target.value)}
                                            className="col-span-4"
                                        />
                                        <Select value={newPromoDiscountType} onValueChange={(value: 'percentage' | 'fixed') => setNewPromoDiscountType(value)}>
                                            <SelectTrigger className="col-span-3">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed">₹ Fixed Amount</SelectItem>
                                                <SelectItem value="percentage">% Percentage</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            placeholder={newPromoDiscountType === 'fixed' ? "Amount in ₹" : "Percentage"}
                                            min="0"
                                            max={newPromoDiscountType === 'percentage' ? "100" : undefined}
                                            value={newPromoDiscount}
                                            onChange={(e) => setNewPromoDiscount(e.target.value)}
                                            className="col-span-3"
                                        />
                                        <Button type="button" onClick={addPromoCode} className="col-span-2">Add</Button>
                                    </div>

                                    {currentStock.promoCodes && currentStock.promoCodes.length > 0 && (
                                        <div className="border rounded p-2 max-h-32 overflow-y-auto">
                                            {currentStock.promoCodes.map((promo, index) => (
                                                <div key={index} className="flex justify-between items-center mb-1 p-2 bg--50 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className={promo.isActive ? '' : 'line-through text-gray-500'}>
                                                            {promo.code} - {promo.discountType === 'fixed' ? `₹${promo.discount} off` : `${promo.discount}% off`}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => togglePromoCodeActive(index)}
                                                        >
                                                            {promo.isActive ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => removePromoCode(index)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
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