'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
    CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

type MemoryOptions = {
    '4GB': string;
    '8GB': string;
    '16GB': string;
};

type HostycareProductMapping = {
    '4GB': string;
    '8GB': string;
    '16GB': string;
};

type PromoCode = {
    code: string;
    discount: number;
    discountType: 'percentage' | 'fixed';
    isActive: boolean;
};

const IPStockFormWithParams = () => {
    const searchParams = useSearchParams();
    const prefilledProductId = searchParams.get('hostycare_product_id');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [available, setAvailable] = useState('true');
    const [serverType, setServerType] = useState('Linux');
    const [prices, setPrices] = useState<MemoryOptions>({
        '4GB': '',
        '8GB': '',
        '16GB': '',
    });

    // New state for Hostycare product mapping
    const [hostycareProductIds, setHostycareProductIds] = useState<HostycareProductMapping>({
        '4GB': '',
        '8GB': '',
        '16GB': '',
    });

    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [newPromoCode, setNewPromoCode] = useState('');
    const [newPromoDiscount, setNewPromoDiscount] = useState('');
    const [newPromoDiscountType, setNewPromoDiscountType] = useState<'percentage' | 'fixed'>('fixed');

    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');

    const router = useRouter();

    useEffect(() => {
        if (prefilledProductId) {
            // Pre-fill all memory options with the same product ID
            setHostycareProductIds({
                '4GB': prefilledProductId,
                '8GB': prefilledProductId,
                '16GB': prefilledProductId
            });

            toast.info(`Pre-filled with Hostycare Product ID: ${prefilledProductId}`);
        }
    }, [prefilledProductId]);

    const handlePriceChange = (size: keyof MemoryOptions, value: string) => {
        setPrices(prev => ({
            ...prev,
            [size]: value
        }));
    };

    const handleHostycareProductIdChange = (size: keyof HostycareProductMapping, value: string) => {
        setHostycareProductIds(prev => ({
            ...prev,
            [size]: value
        }));
    };

    const addPromoCode = () => {
        if (newPromoCode && newPromoDiscount) {
            const discount = parseFloat(newPromoDiscount);
            if (discount >= 0) {
                if (newPromoDiscountType === 'percentage' && discount > 100) {
                    toast.error('Percentage discount cannot exceed 100%');
                    return;
                }

                setPromoCodes(prev => [...prev, {
                    code: newPromoCode.toUpperCase(),
                    discount,
                    discountType: newPromoDiscountType,
                    isActive: true
                }]);
                setNewPromoCode('');
                setNewPromoDiscount('');
            } else {
                toast.error('Discount must be a positive number');
            }
        }
    };

    const removePromoCode = (index: number) => {
        setPromoCodes(prev => prev.filter((_, i) => i !== index));
    };

    const addTag = () => {
        if (newTag.trim() && !tags.includes(newTag.trim().toLowerCase())) {
            setTags(prev => [...prev, newTag.trim().toLowerCase()]);
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Build memory options with Hostycare product mapping
        const memoryOptions = {
            '4GB': {
                price: parseFloat(prices['4GB']),
                hostycareProductId: hostycareProductIds['4GB'] || null,
                hostycareProductName: hostycareProductIds['4GB'] ? `${name} 4GB` : null
            },
            '8GB': {
                price: parseFloat(prices['8GB']),
                hostycareProductId: hostycareProductIds['8GB'] || null,
                hostycareProductName: hostycareProductIds['8GB'] ? `${name} 8GB` : null
            },
            '16GB': {
                price: parseFloat(prices['16GB']),
                hostycareProductId: hostycareProductIds['16GB'] || null,
                hostycareProductName: hostycareProductIds['16GB'] ? `${name} 16GB` : null
            },
        };

        try {
            const response = await axios.post('/api/ipstock', {
                name,
                description,
                available: available === 'true',
                serverType,
                tags,
                memoryOptions,
                promoCodes,
                defaultConfigurations: {} // Empty for now, can be expanded later
            });

            console.log('Submission Successful:', response.data);

            // Reset form
            setName("");
            setDescription("");
            setServerType('Linux');
            setTags([]);
            setPrices({ '4GB': '', '8GB': '', '16GB': '' });
            setHostycareProductIds({ '4GB': '', '8GB': '', '16GB': '' });
            setPromoCodes([]);

            toast.success("IP Stock created successfully!")
        } catch (error: any) {
            console.error('Failed to submit:', error.response?.data || error.message);
            toast.error('Failed to create IP Stock');
        }
    };

    return (
        <div>
            <div className='p-4 border-b'>
                <h1 className='text-lg '>Admin - Create IP Stock </h1>
            </div>
            <div className='p-4'>
                <Card className="m-4">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Add New IP Stock</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Name:</Label>
                                <Input
                                    type="text"
                                    className="input input-bordered w-full"
                                    placeholder="IP Stock Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Description:</Label>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    placeholder="Describe the server configuration, features, etc."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-1">Server Type:</Label>
                                <Select value={serverType} onValueChange={setServerType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Server Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Linux">Linux</SelectItem>
                                        <SelectItem value="VPS">VPS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-2">Tags:</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        type="text"
                                        placeholder="Add tag (e.g., premium, budget, ssd)"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        className="flex-1"
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                    />
                                    <Button type="button" onClick={addTag}>Add Tag</Button>
                                </div>

                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag, index) => (
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

                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-1">Available:</label>
                                <Select value={available} onValueChange={setAvailable}>
                                    <SelectTrigger className="select-none">
                                        <SelectValue placeholder="Select Availability" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value='true'>Yes</SelectItem>
                                        <SelectItem value='false'>No</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Memory Options with Price and Hostycare Product ID */}
                            <div className="mb-6">
                                <Label className="block text-sm font-medium mb-3 text-base">Memory Configuration & Hostycare Mapping</Label>
                                <div className="bg-ay-50 p-4 rounded-lg border">
                                    {Object.keys(prices).map(size => (
                                        <div key={size} className="mb-4 last:mb-0">
                                            <h4 className="font-medium text-sm mb-2">{size} Configuration</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="block text-xs font-medium mb-1">Price (₹):</Label>
                                                    <Input
                                                        type="number"
                                                        placeholder={`Price for ${size}`}
                                                        value={prices[size as keyof MemoryOptions]}
                                                        onChange={(e) => handlePriceChange(size as keyof MemoryOptions, e.target.value)}
                                                        className="text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="block text-xs font-medium mb-1">Hostycare Product ID:</Label>
                                                    <Input
                                                        type="text"
                                                        placeholder={`Product ID for ${size}`}
                                                        value={hostycareProductIds[size as keyof HostycareProductMapping]}
                                                        onChange={(e) => handleHostycareProductIdChange(size as keyof HostycareProductMapping, e.target.value)}
                                                        className="text-sm"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Leave empty to disable auto-provisioning for this memory size
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Promo Codes Section */}
                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-2">Promo Codes:</Label>
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

                                {promoCodes.length > 0 && (
                                    <div className="border rounded p-2">
                                        <h4 className="text-sm font-medium mb-2">Added Promo Codes:</h4>
                                        {promoCodes.map((promo, index) => (
                                            <div key={index} className="flex justify-between items-center mb-1 p-2 bg-gray-50 rounded">
                                                <span>
                                                    {promo.code} - {promo.discountType === 'fixed' ? `₹${promo.discount} off` : `${promo.discount}% off`}
                                                </span>
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
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="btn btn-primary">Submit</Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
};

// Loading component for Suspense fallback
const IPStockFormLoading = () => (
    <div className='w-full'>
        <div className='h-[63px] flex gap-2 items-center border-b p-4'>
            <h1 className='text-xl'>Add IP Stock</h1>
        </div>
        <div className='mx-12 mt-6'>
            <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-32 bg-gray-200 rounded mb-4"></div>
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
            </div>
        </div>
    </div>
);

// Main component with Suspense wrapper
const AddIPStockPage = () => {
    return (
        <Suspense fallback={<IPStockFormLoading />}>
            <IPStockFormWithParams />
        </Suspense>
    );
};

export default AddIPStockPage;
