'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function InvoiceTool() {
  const [txId, setTxId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    setMsg(null);
    if (!txId.trim()) {
      setMsg('Enter a Razorpay Payment ID (e.g., pay_XXXXXXXXXXXXXX).');
      return;
    }
    try {
      setLoading(true);
      // If you configured INVOICE_ADMIN_KEY on the API, append &key=...
      const url = `/api/invoices/generate?txId=${encodeURIComponent(txId.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to generate');
      }
      const blob = await res.blob();
      const fileName = `invoice-${txId.trim()}.pdf`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMsg('Invoice downloaded.');
    } catch (e: any) {
      setMsg(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Generate Invoice by Razorpay Payment ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tx">Razorpay Payment ID</Label>
            <Input
              id="tx"
              placeholder="pay_REdD7vNTJZ9Gce"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
            />
          </div>

          <Button onClick={generate} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Generating…' : 'Generate & Download PDF'}
          </Button>

          {msg ? (
            <p className="text-sm text-muted-foreground">{msg}</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Tip: Paste a Payment ID from Razorpay (e.g., <code>pay_RES7xfV3H3F72K</code>).
            The PDF uses order details from your database for that payment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
