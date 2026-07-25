import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { enforceRateLimit } from '@/lib/rateLimit';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `You are an AI assistant for OceanLinux, a premium yet affordable Linux hosting provider. Here's key information about the company:

SERVICES & PRICING:
- Most affordable Linux VPS hosting in the market
- Premium rotating IP servers (Gold Series 103.183.xx)
- Nova Linux series (163.227) - High performance
- Power Linux series (149.13) - Maximum power  
- Titan Series (103.15.xx) - Enterprise grade
- Pricing starts from ₹599/month with significant discounts
- Full root access and control
- Enterprise-grade security
- Instant setup and deployment

OPERATING SYSTEMS:
- Ubuntu 22 (default and most popular)
- CentOS 7
- Windows 2022 64-bit

SUPPORT:
- 24/7 expert support
- Live chat available
- Email: hello@oceanlinux.com
- 99.99% uptime guarantee
- Less than 5-minute response time

PAYMENT:
- Secure payments through Razorpay, Cashfree, and UPI Gateway
- Multiple payment methods accepted
- Instant payment processing

FEATURES:
- Premium quality at budget-friendly prices
- VPS sourced from trusted upstream providers, managed and supported by OceanLinux (we do not operate our own data centers)
- Bank-grade encryption and security
- Professional management tools
- Scalable solutions

Be helpful, friendly, and focus on the affordability and quality aspects. If someone asks about specific technical details you're unsure about, suggest they contact the support team directly. Always emphasize the value proposition of getting premium Linux hosting at the most affordable prices.`;

export async function POST(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, { max: 20, windowMs: 60_000, scope: 'ip' });
  if (rateLimited) return rateLimited;

  try {
    const { messages } = await req.json();

    // This endpoint is unauthenticated and spends real OpenAI credit, so the
    // conversation is clamped: bounded size, and no client-supplied `system`
    // turns that could repurpose the assistant into a general-purpose LLM.
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
    }

    const safeMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-10)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content ?? '').slice(0, 2000),
      }))
      .filter((m) => m.content.length > 0);

    if (safeMessages.length === 0) {
      return NextResponse.json({ error: 'No valid message content provided' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...safeMessages
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const message = response.choices[0]?.message?.content || 'Sorry, I could not process your request.';

    return NextResponse.json({ message });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to process your message. Please try again.' },
      { status: 500 }
    );
  }
}