'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';

const MyAccount = () => {
    const [user, setUser] = useState({ name: '', email: '' });
    const router = useRouter();

    useEffect(() => {
        fetch('/api/users/me')
            .then(res => res.json())
            .then(data => setUser({ name: data.name, email: data.email }))
            .catch(err => console.error('Error fetching user data:', err));
    }, []);

    const handleUpdate = async () => {
        try {
            const response = await fetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
            const data = await response.json();
            if (response.ok) {
                toast.success('Profile updated successfully!');
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('Error updating profile:', error);
        }
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex items-center gap-2 border dark:border-none-b p-4'>
                <User />
                <h1 className='text-xl'>My Account</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Card className='p-4 space-y-4 mt-4'>
                    <Label>Name</Label>
                    <Input value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />
                    <Label className=''>Email</Label>
                    <Input value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
                    <Button onClick={handleUpdate}>Update Profile</Button>
                </Card>
            </div>
        </div>
    );
};

export default MyAccount;
