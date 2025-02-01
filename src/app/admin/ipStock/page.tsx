'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Card,
    CardHeader,
    CardContent,
    CardFooter,
    CardTitle,
} from '@/components/ui/card'; // Ensure these components are imported correctly
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';

type MemoryOptions = {
    '4GB': string;
    '8GB': string;
    '16GB': string;
};

const AddIPStockPage = () => {
    const [name, setName] = useState('');
    const [available, setAvailable] = useState('true');
    const [prices, setPrices] = useState<MemoryOptions>({
        '4GB': '',
        '8GB': '',
        '16GB': '',
    });
    const router = useRouter();

    const handlePriceChange = (size: keyof MemoryOptions, value: string) => {
        setPrices(prev => ({
            ...prev,
            [size]: value
        }));
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
                memoryOptions,
            });

            // Handle success
            console.log('Submission Successful:', response.data);
            setName("");
            setPrices({ '4GB': '', '8GB': '', '16GB': '' })
            toast.success("IP Stock created successfully!")
        } catch (error: any) {
            // Handle error
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
                                <label className="block text-sm font-medium mb-1">Available:</label>
                                <Select>
                                    <SelectTrigger className="select-none">
                                        <SelectValue placeholder="Select Availability" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value='Yes' onSelect={() => setAvailable('true')}>Yes</SelectItem>
                                        <SelectItem value='No' onSelect={() => setAvailable('false')}>No</SelectItem>
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
                                        onChange={(e) => handlePriceChange(size as keyof MemoryOptions, e.target.value)} // Same assertion here
                                    />
                                </div>
                            ))}
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
