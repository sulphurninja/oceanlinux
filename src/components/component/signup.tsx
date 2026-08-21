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

function Signup({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (response.ok) {
      // Redirect to login page after successful signup
      router.push('/dashboard');
    } else {
      // Handle errors, such as user already exists
      setError(data.message || 'An error occurred during signup.');
    }
  };

  useEffect(() => {
    // Check if the user is already logged in
    const checkUser = async () => {
      const response = await fetch('/api/users/me');
      if (response.ok) {
        router.push('/dashboard');
      }
    };

    checkUser();
  }, []);


  return (
    <>
      {/* <h1 className='items-center text-center p-4 text-xl font-bold flex gap-2 justify-center'>
        <LucideWaves />
        Welcome to Ocean Linux
      </h1> */}
      <img src='/bg.gif' className='absolute opacity-30 bg-black w-screen h-screen z-[10]' />
      <div className='flex justify-center'>
        <div className={cn("flex flex-col z-[10]  absolute items-center justify-center min-h-screen", className)} {...props}>
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
              <CardTitle className="text-2xl">Register</CardTitle>
              <CardDescription>
                Create your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      type="text"
                      required
                      placeholder="Enter Your Name"
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
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
                    Sign Up
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <p className="mt-4 text-sm">
            Already have an account?{" "}
            <a href="/login" className="text-blue-600 hover:underline">
              Login here
            </a>
          </p>
        </div>
      </div>
    </>
  );
}

export default Signup;
