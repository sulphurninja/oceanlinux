
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

export default function Requestvps() {
  return (
    <div className="container mx-auto max-w-2xl p-4">
      <h1 className="text-3xl font-bold mb-4">Request Direct Vps</h1>
      <div className="bg-red-600 text-white p-2 mb-4">
        <strong>Payment Upi Id :</strong> plz request from new portal - fastvps.online
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Enter your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="Enter your username" defaultValue="annacraw56" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" placeholder="Enter your password" defaultValue="ZQhfJ^Tjt{" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="Plan">Plan</Label>
                <Select>
                  <SelectTrigger id="Plan">
                    <SelectValue placeholder="Select Plan" defaultValue="4 Plan - Rs.1250" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2 RAM - Rs.750">2 RAM - Rs.750</SelectItem>
                    <SelectItem value="4 RAM - Rs.1250">4 RAM - Rs.1250</SelectItem>
                    <SelectItem value="8 RAM - Rs.2250">8 RAM - Rs.2250</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="os-type">OS Type</Label>
                <Select>
                  <SelectTrigger id="os-type">
                    <SelectValue placeholder="Select OS Type" defaultValue="Windows Server 2022" />
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
              <Button variant="outline">Cancel</Button>
              <Button>Create Request</Button>
            </CardFooter>
          </Card>
        </div>
        <div className="flex justify-center items-center">
          <img src="/placeholder.svg" alt="Payment QR Code" className="max-w-full" />
        </div>
      </div>
    </div>
  )
}
