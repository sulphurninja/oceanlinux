'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from 'sonner';

const scripts = {
    ubuntu: [
        {
            heading: "Ubuntu Script (3128 Port)",
            code: `wget https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid3-install.sh
squid-add-user`
        },
        {
            heading: "5515 Port",
            code: `wget -O squid5515-install.sh https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid5515-install.sh
sudo sed -i 's/http_port 3128/http_port 5515/g' /etc/squid/squid.conf
sudo systemctl restart squid
squid-add-user`
        },
        {
            heading: "8000 Port",
            code: `wget -O squid8000-install.sh https://raw.githubusercontent.com/serverok/squid-proxy-installer/master/squid3-install.sh
sudo bash squid8000-install.sh
sudo sed -i 's/http_port 3128/http_port 8000/g' /etc/squid/squid.conf
sudo systemctl restart squid
squid-add-user`
        }
    ],
    centos: [
        {
            heading: "3128 Port",
            code: `sudo curl -o /etc/yum.repos.d/CentOS-Base.repo https://raw.githubusercontent.com/XSUP4EME/cents/main/CentOS-Base.repo
sudo yum install wget
wget https://raw.githubusercontent.com/icharisofcc/proxy/master/spi
chmod +x spi
sudo ./spi -rhel7`
        }
    ]
};

// Copy-to-clipboard function
const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
};

const ScriptsPage = () => {
    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4">Proxy Setup Scripts</h1>
            <Tabs defaultValue="ubuntu" className="w-full">
                <TabsList className="flex gap-2  ">
                    <TabsTrigger value="ubuntu" className='text-md'>Ubuntu 22</TabsTrigger>
                    <TabsTrigger value="centos" className='text-md'>CentOS 7</TabsTrigger>
                    <TabsTrigger value="terminal" className='text-md'>Terminal</TabsTrigger>
                    <TabsTrigger value="tutorial" className='text-md'>Tutorial</TabsTrigger>
                </TabsList>

                {/* Ubuntu 22 Tab */}
                <TabsContent value="ubuntu">
                    {scripts.ubuntu.map((script, index) => (
                        <Card key={index} className="mb-4">
                            <CardContent className="p-4">
                                <h2 className="text-lg font-medium mb-2">{script.heading}</h2>
                                <pre className="bg-gray-900 text-white p-3 rounded relative">
                                    <code className="whitespace-pre-wrap">{script.code}</code>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="absolute top-2 right-2"
                                        onClick={() => copyToClipboard(script.code)}
                                    >
                                        <Copy size={16} />
                                    </Button>
                                </pre>
                            </CardContent>
                        </Card>
                    ))}
                </TabsContent>
                <TabsContent value="terminal">
                    <div className='h-screen'>
                        <iframe
                            src="https://sshterminal.advps.store/"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="SSH Terminal"
                        />
                    </div>
                </TabsContent>
                <TabsContent value="tutorial">
                    <Card className="mb-4 p-6">
                        <p>
                            PUTTY SE IP KAISE BANATE HAIN IS VIDEO ME AAP SIKH JAOGE JAISE JAISE IS VIDEO ME BATAYA GAYA HAI WAISE STEPS FOLLOW KIJIYE

                            ONLY 3 STEP DALO AAPKA IP BAN JAEGA

                            SABSE PEHLE PUTTY SOFTWARE DOWNLOAD KARE

                            PHIR PUTTY SOFTWARE OPEN KARE

                            USKE BAAD IP ADDRESS ME JO AAPKO IP DIYA GAYA HAI WO DALKE OPEN BUTTON PE CLICK KARDE

                            PHIR WAHA PE USERNAME MANGEGA

                            USERNAME:= root

                            PHIR WAHA PE PASSWORD MANGEGA TO AAPKO JO LINUX MILA HAI USME PASSWORD DIYA GAYA HAI WAHI PASSWORD COPY KARKE PUTTY ME KAHI BH EK BAAR RIGHT CLICK KARKE ENTER KARDE

                            PHIR USKE BAAD YE 3 STEP DALKE IP BANA LE

                            SCRIPT Apko Panel Me Diya Gaya he
                        </p>
                        <video src='/tutorial.mp4' controls autoPlay className='h-screen w-full' />
                    </Card>
                </TabsContent>
                {/* CentOS 7 Tab */}
                <TabsContent value="centos">
                    {scripts.centos.map((script, index) => (
                        <Card key={index} className="mb-4">
                            <CardContent className="p-4">
                                <h2 className="text-lg font-medium mb-2">{script.heading}</h2>
                                <pre className="bg-gray-900 text-white p-3 rounded relative">
                                    <code className="whitespace-pre-wrap">{script.code}</code>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="absolute top-2 right-2"
                                        onClick={() => copyToClipboard(script.code)}
                                    >
                                        <Copy size={16} />
                                    </Button>
                                </pre>
                            </CardContent>
                        </Card>
                    ))}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default ScriptsPage;
