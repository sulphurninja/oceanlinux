'use client'

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

interface Request {
  _id: string;
  name: string;
  username: string;
  plan: string;
  os_type: string;
  password: string;
  ip_address?: string;
  vps_password?: string;
  status?: string;
}

export default function RequestComponent() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [ipAddress, setIpAddress] = useState("");
  const [vpsPassword, setVpsPassword] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/request/get');
      const result = await response.json();
      if (response.ok) {
        setRequests(result.data);
      } else {
        console.error("Error fetching requests!");
      }
    } catch {
      console.error("Error fetching requests!");
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSaveChanges = async () => {
    if (!selectedRequest) return;

    try {
      const response = await fetch(`/api/request/update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedRequest._id,
          ip_address: ipAddress,
          vps_password: vpsPassword,
        }),
      });


      const result = await response.json();
      if (response.ok) {
        console.log("Request updated successfully!", result);
        fetchRequests(); // Refresh the requests list
        setIsDialogOpen(false); // Close the dialog
      } else {
        console.error("Error updating request!", result);
      }
    } catch (error) {
      console.error("Error updating request!", error);
    }
  };


  useEffect(() => {
    if (selectedRequest) {
      setIpAddress(selectedRequest.ip_address || "");
      setVpsPassword(selectedRequest.vps_password || "");
    }
  }, [selectedRequest]);

  console.log(selectedRequest, 'selected request')

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8 lg:p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Request</h1>
      </div>
      <div className="grid gap-4">
        {requests.map((request) => (
          <Card key={request._id} onClick={() => setSelectedRequest(request)}>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src="/placeholder-user.jpg" />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="grid gap-0.5">
                    <div className="font-medium">{request.name}</div>
                    <div className="text-sm text-muted-foreground">@{request.username}</div>
                    <div className="font-medium">{request.password}</div>
                  </div>
                </div>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </SheetTrigger>
                  {selectedRequest && selectedRequest._id === request._id && (
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Request Details</SheetTitle>
                      </SheetHeader>
                      <div className="grid gap-4 p-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="font-medium">Name:</div>
                          <div>{selectedRequest.name}</div>
                          <div className="font-medium">Username:</div>
                          <div>@{selectedRequest.username}</div>
                          <div className="font-medium">Plan:</div>
                          <div>{selectedRequest.plan}</div>
                          <div className="font-medium">OS Type:</div>
                          <div>{selectedRequest.os_type}</div>
                          <div className="font-medium">Password:</div>
                          <div>{selectedRequest.password}</div>
                          <div className="font-medium">IP Address:</div>
                          <div>{selectedRequest.ip_address}</div>
                          <div className="font-medium">VPS Password:</div>
                          <div>{selectedRequest.vps_password}</div>
                        </div>

                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                          <DialogTrigger asChild>
                            <Button>Update</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Update User Credentials</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 p-4">
                              <div className="grid grid-cols-2 gap-2">
                                <Label htmlFor="ip_address">IP Address</Label>
                                <Input
                                  id="ip_address"
                                  value={ipAddress}
                                  onChange={(e) => setIpAddress(e.target.value)}
                                />
                                <Label htmlFor="vps_password">VPS Password</Label>
                                <Input
                                  id="vps_password"
                                  value={vpsPassword}
                                  onChange={(e) => setVpsPassword(e.target.value)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button type="button" onClick={handleSaveChanges}>Save Changes</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                      </div>

                    </SheetContent>
                  )}
                </Sheet>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
