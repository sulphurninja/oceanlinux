'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { X } from 'lucide-react'; // Add this import
import axios from 'axios';
import { toast } from 'sonner';

type MemoryOptions = {
    '4GB': string;
    '8GB': string;
    '16GB': string;
};

type PromoCode = {
    code: string;
    discount: number;
    isActive: boolean;
};

const AddIPStockPage = () => {
    const [name, setName] = useState('');
    const [available, setAvailable] = useState('true');
    const [serverType, setServerType] = useState('Linux');
    const [prices, setPrices] = useState<MemoryOptions>({
        '4GB': '',
        '8GB': '',
        '16GB': '',
    });
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [newPromoCode, setNewPromoCode] = useState('');
    const [newPromoDiscount, setNewPromoDiscount] = useState('');
    
    // Add tags state
    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    
    const router = useRouter();

    const handlePriceChange = (size: keyof MemoryOptions, value: string) => {
        setPrices(prev => ({
            ...prev,
            [size]: value
        }));
    };

    const addPromoCode = () => {
        if (newPromoCode && newPromoDiscount) {
            const discount = parseFloat(newPromoDiscount);
            if (discount >= 0 && discount <= 100) {
                setPromoCodes(prev => [...prev, {
                    code: newPromoCode.toUpperCase(),
                    discount,
                    isActive: true
                }]);
                setNewPromoCode('');
                setNewPromoDiscount('');
            } else {
                toast.error('Discount must be between 0 and 100');
            }
        }
    };

    const removePromoCode = (index: number) => {
        setPromoCodes(prev => prev.filter((_, i) => i !== index));
    };

    // Add tag functions
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
        const memoryOptions = {
            '4GB': { price: parseFloat(prices['4GB']) },
            '8GB': { price: parseFloat(prices['8GB']) },
            '16GB': { price: parseFloat(prices['16GB']) },
        };
        try {
            const response = await axios.post('/api/ipstock', {
                name,
                available: available === 'true',
                serverType,
                tags, // Include tags
                memoryOptions,
                promoCodes,
            });

            console.log('Submission Successful:', response.data);
            setName("");
            setServerType('Linux');
            setTags([]); // Reset tags
            setPrices({ '4GB': '', '8GB': '', '16GB': '' });
            setPromoCodes([]);
            toast.success("IP Stock created successfully!")
        } catch (error: any) {
            console.error('Failed to submit:', error.response?.data || error.message);
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

                            {/* Add Tags Section */}
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

                            {Object.keys(prices).map(size => (
                                <div key={size} className="mb-4">
                                    <Label className="block text-sm font-medium mb-1">Price for {size}:</Label>
                                    <Input
                                        type="number"
                                        className="input input-bordered w-full"
                                        placeholder={`Price for ${size}`}
                                        value={prices[size as keyof MemoryOptions]}
                                        onChange={(e) => handlePriceChange(size as keyof MemoryOptions, e.target.value)}
                                    />
                                </div>
                            ))}
                            
                            {/* Promo Codes Section - keep existing code */}
                            <div className="mb-4">
                                <Label className="block text-sm font-medium mb-2">Promo Codes:</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        type="text"
                                        placeholder="Promo Code"
                                        value={newPromoCode}
                                        onChange={(e) => setNewPromoCode(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Input
                                        type="number"
                                        placeholder="Discount %"
                                        min="0"
                                        max="100"
                                        value={newPromoDiscount}
                                        onChange={(e) => setNewPromoDiscount(e.target.value)}
                                        className="w-24"
                                    />
                                    <Button type="button" onClick={addPromoCode}>Add</Button>
                                </div>
                                
                                {promoCodes.length > 0 && (
                                    <div className="border rounded p-2">
                                        <h4 className="text-sm font-medium mb-2">Added Promo Codes:</h4>
                                        {promoCodes.map((promo, index) => (
                                            <div key={index} className="flex justify-between items-center mb-1 p-2 bg-gray-50 rounded">
                                                <span>{promo.code} - {promo.discount}% off</span>
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

export default AddIPStockPage;