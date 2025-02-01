'use client'

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import axios from 'axios'
import { toast, Toaster } from 'sonner';
import { useRouter } from "next/navigation";

export default function Request() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState("");
  const [osType, setOsType] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const response = await axios.post("/api/request/create", {
        name,
        username,
        password,
        plan,
        os_type: osType,
      });
      if (response.status === 200) {
        toast.success("Request created successfully!");
        setName("");
        setUsername("");
        setPassword("");
        setPlan("");
        setOsType("");
      }
    } catch (error: any) {
      toast.error("An error occurred while creating the request.");
      console.log(error || "An error occurred");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="container mx-auto  w-screen ml-64  p-4 ">
      <h1 className="text-2xl font-bold mb-4">Request Direct Vps</h1>
      <Toaster />
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="Plan">Plan</Label>
                <Select
           
                  value={plan}
                  onValueChange={(value) => setPlan(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2 RAM - Rs.750">2 RAM - Rs.750</SelectItem>
                    <SelectItem value="4 RAM - Rs.1250">4 RAM - Rs.1250</SelectItem>
                    <SelectItem value="8 RAM - Rs.2250">8 RAM - Rs.2250</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="osType">OS Type</Label>
                <Select
           
                  value={osType}
                  onValueChange={(value) => setOsType(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select OS Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Windows Server 2022">Windows Server 2022</SelectItem>
                    <SelectItem value="Ubuntu 20.04">Ubuntu 20.04</SelectItem>
                    <SelectItem value="CentOS 8">CentOS 8</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => router.push('/')}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Request'}
              </Button>
            </CardFooter>
          </Card>

        </div>

      </form>
    </div>
  );
}
