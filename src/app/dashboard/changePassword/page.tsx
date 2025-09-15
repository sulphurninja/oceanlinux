'use client'

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LockKeyhole } from 'lucide-react';

const ChangePassword = () => {
  const [passwords, setPasswords] = useState({ oldPassword: '', newPassword: '' });

  const handleChangePassword = async () => {
    const response = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwords)
    });
    const data = await response.json();
    if (response.ok) {
      toast.success('Password changed successfully!');
    } else {
      alert(data.message);
    }
  };

  return (
    <div className='w-full'>
      <div className='h-[63px] flex items-center border dark:border-none-b gap-2 p-4'>
        <LockKeyhole />
        <h1 className='text-xl'>Change Password</h1>
      </div>
      <div className='mx-12 mt-6'>
        <Card className='p-4 space-y-4'>
          <Label>Old Password</Label>
          <Input type="password" value={passwords.oldPassword} onChange={(e) => setPasswords({ ...passwords, oldPassword: e.target.value })} />
          <Label>New Password</Label>
          <Input type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
          <Button onClick={handleChangePassword}>Change Password</Button>
        </Card>
      </div>
    </div>
  );
};

export default ChangePassword;
