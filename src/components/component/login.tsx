'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LucideWaves } from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

function Login({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      // Assume the server response includes some form of user session management
      router.push('/dashboard'); // Redirect to a dashboard or another appropriate page
    } else {
      // Handle errors like invalid credentials
      setError(data.message || 'Invalid email or password.');
    }
  };

 

  return (
    <>

      {/* <h1 className='items-center text-center p-4 text-xl font-bold flex gap-2 justify-center'>
        <LucideWaves />
        Ocean Linux
      </h1> */}
      <img src='/bg.gif' className='absolute opacity-30 bg-black w-screen h-screen z-[10]' />
      <div className='flex justify-center'>
        <div className={cn("flex flex-col z-[10] absolute items-center justify-center min-h-screen", className)} {...props}>
          <Card className='w-96'>
            <div className='flex justify-center items-center'>
              <div className='text-center'>
                <DotLottieReact
                  src="/linux.lottie"
                  loop
                  autoplay
                  className='h-24'
                />
                <h1 className='text-3xl '>Ocean Linux</h1>
              </div>
            </div>
            <CardHeader>
              <CardTitle className="text-2xl mt-4">Login</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="email@example.com"
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Login
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <p className="mt-4 text-sm">
            Don't have an account?{" "}
            <a href="/" className="text-blue-600 hover:underline">
              Sign up here
            </a>
          </p>
        </div>
      </div>
    </>
  );
}

export default Login;
