"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Save, Settings, Phone, MessageSquare, Mail, RefreshCw } from 'lucide-react';

interface SettingValue {
  value: string;
  description: string;
  updatedAt: string | null;
  isDefault: boolean;
}

interface SettingsData {
  [key: string]: SettingValue;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ [key: string]: string }>({});

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
        
        // Initialize form data
        const initial: { [key: string]: string } = {};
        for (const [key, setting] of Object.entries(data.settings as SettingsData)) {
          initial[key] = setting.value;
        }
        setFormData(initial);
      } else {
        toast.error('Failed to fetch settings');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (key: string) => {
    try {
      setSaving(key);
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value: formData[key],
          description: getDescription(key)
        })
      });

      if (response.ok) {
        toast.success(`${getLabel(key)} updated successfully`);
        fetchSettings();
      } else {
        toast.error('Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to update setting');
    } finally {
      setSaving(null);
    }
  };

  const getLabel = (key: string) => {
    switch (key) {
      case 'WHATSAPP_NUMBER': return 'WhatsApp Number';
      case 'WHATSAPP_MESSAGE': return 'Default WhatsApp Message';
      case 'SUPPORT_EMAIL': return 'Support Email';
      default: return key;
    }
  };

  const getDescription = (key: string) => {
    switch (key) {
      case 'WHATSAPP_NUMBER': return 'WhatsApp number for customer support (include country code)';
      case 'WHATSAPP_MESSAGE': return 'Default message shown when user clicks WhatsApp';
      case 'SUPPORT_EMAIL': return 'Primary support email address';
      default: return '';
    }
  };

  const getIcon = (key: string) => {
    switch (key) {
      case 'WHATSAPP_NUMBER': return Phone;
      case 'WHATSAPP_MESSAGE': return MessageSquare;
      case 'SUPPORT_EMAIL': return Mail;
      default: return Settings;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Site Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global site settings including contact information
          </p>
        </div>
        <Button variant="outline" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6">
        {/* WhatsApp Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-green-500/10">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-green-500">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              WhatsApp Settings
            </CardTitle>
            <CardDescription>
              Configure the WhatsApp widget that appears on your website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* WhatsApp Number */}
            <div className="space-y-2">
              <Label htmlFor="WHATSAPP_NUMBER" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                WhatsApp Number
              </Label>
              <div className="flex gap-2">
                <Input
                  id="WHATSAPP_NUMBER"
                  value={formData.WHATSAPP_NUMBER || ''}
                  onChange={(e) => setFormData({ ...formData, WHATSAPP_NUMBER: e.target.value })}
                  placeholder="+91 80042 77632"
                  className="flex-1"
                />
                <Button 
                  onClick={() => handleSave('WHATSAPP_NUMBER')}
                  disabled={saving === 'WHATSAPP_NUMBER'}
                >
                  {saving === 'WHATSAPP_NUMBER' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Include country code (e.g., +91 for India). Current: {settings.WHATSAPP_NUMBER?.value}
                {settings.WHATSAPP_NUMBER?.isDefault && <span className="text-amber-500 ml-1">(default)</span>}
              </p>
            </div>

            {/* WhatsApp Message */}
            <div className="space-y-2">
              <Label htmlFor="WHATSAPP_MESSAGE" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Default Message
              </Label>
              <div className="flex gap-2">
                <Textarea
                  id="WHATSAPP_MESSAGE"
                  value={formData.WHATSAPP_MESSAGE || ''}
                  onChange={(e) => setFormData({ ...formData, WHATSAPP_MESSAGE: e.target.value })}
                  placeholder="Hi! I need help with OceanLinux services."
                  className="flex-1 min-h-[80px]"
                />
                <Button 
                  onClick={() => handleSave('WHATSAPP_MESSAGE')}
                  disabled={saving === 'WHATSAPP_MESSAGE'}
                  className="self-start"
                >
                  {saving === 'WHATSAPP_MESSAGE' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pre-filled message when users click the WhatsApp button
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Support Email Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              Support Email
            </CardTitle>
            <CardDescription>
              Primary email address for customer support
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="SUPPORT_EMAIL" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email Address
              </Label>
              <div className="flex gap-2">
                <Input
                  id="SUPPORT_EMAIL"
                  type="email"
                  value={formData.SUPPORT_EMAIL || ''}
                  onChange={(e) => setFormData({ ...formData, SUPPORT_EMAIL: e.target.value })}
                  placeholder="support@oceanlinux.com"
                  className="flex-1"
                />
                <Button 
                  onClick={() => handleSave('SUPPORT_EMAIL')}
                  disabled={saving === 'SUPPORT_EMAIL'}
                >
                  {saving === 'SUPPORT_EMAIL' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {settings.SUPPORT_EMAIL?.value}
                {settings.SUPPORT_EMAIL?.isDefault && <span className="text-amber-500 ml-1">(default)</span>}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Widget Preview</CardTitle>
            <CardDescription className="text-gray-400">
              See how your WhatsApp widget will appear on the site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="relative flex flex-col items-center gap-3">
                {/* WhatsApp Button Preview */}
                <button className="h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center border-2 border-green-300/50 hover:scale-110 transition-transform">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </button>
                
                {/* Support Button Preview */}
                <button className="h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center border-2 border-blue-200/30 hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-white">
                    <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
                  </svg>
                </button>

                <p className="text-sm text-gray-400 mt-2">Bottom-right corner of every page</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
