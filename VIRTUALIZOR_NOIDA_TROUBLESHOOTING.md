# Virtualizor Noida Server Troubleshooting Guide

## 🔴 Issue: Noida Server Not Responding

### Current Problem
The Noida Virtualizor server (`17221-10310.hostycare.in:4083`) is consistently failing with "fetch failed" errors after 3 retry attempts, while the Lucknow and Mumbai servers work perfectly.

### Error Details
```
[VirtualizorAPI][Account 0] Attempt 1 failed: fetch failed
[VirtualizorAPI][Account 0] Waiting 5000ms before retry...
[VirtualizorAPI][Account 0] Attempt 2 failed: fetch failed
[VirtualizorAPI][Account 0] Waiting 10000ms before retry...
[VirtualizorAPI][Account 0] Attempt 3 failed: fetch failed
[VirtualizorAPI][Account 0] All 3 attempts failed, giving up
```

### Configuration
```env
VIRTUALIZOR_HOST_1=17221-10310.hostycare.in
VIRTUALIZOR_PORT_1=4083
VIRTUALIZOR_API_KEY_1=IIGP7KMWLMFNFLLO
VIRTUALIZOR_API_PASSWORD_1=wvtZREN3WsR49FZcNzLJk2NUmIY7LMX1
```

## 🔍 Diagnostic Steps

### 1. Test Server Connectivity

#### Check if server is reachable:
```bash
# Test DNS resolution
nslookup 17221-10310.hostycare.in

# Test ping (if ICMP is allowed)
ping 17221-10310.hostycare.in

# Test if port 4083 is open
telnet 17221-10310.hostycare.in 4083
# OR using PowerShell:
Test-NetConnection -ComputerName 17221-10310.hostycare.in -Port 4083
```

#### Check SSL Certificate:
```bash
# Using curl to check SSL
curl -v https://17221-10310.hostycare.in:4083/

# Check certificate details
openssl s_client -connect 17221-10310.hostycare.in:4083 -showcerts
```

### 2. Test API Endpoint Manually

#### Using curl:
```bash
curl -k "https://17221-10310.hostycare.in:4083/index.php?api=json&apikey=IIGP7KMWLMFNFLLO&apipass=wvtZREN3WsR49FZcNzLJk2NUmIY7LMX1&act=listvs&page=1&reslen=10"
```

#### Using PowerShell:
```powershell
$uri = "https://17221-10310.hostycare.in:4083/index.php?api=json&apikey=IIGP7KMWLMFNFLLO&apipass=wvtZREN3WsR49FZcNzLJk2NUmIY7LMX1&act=listvs&page=1&reslen=10"
Invoke-WebRequest -Uri $uri -SkipCertificateCheck
```

### 3. Check Browser Access
Try accessing directly in browser:
```
https://17221-10310.hostycare.in:4083/
```

## 🛠️ Possible Solutions

### Solution 1: SSL Certificate Issues

If the server has a self-signed or invalid SSL certificate, Node.js might reject it.

**Temporary Fix (Development Only)**:
Add to your `.env` file:
```env
NODE_TLS_REJECT_UNAUTHORIZED=0
```

**⚠️ Warning**: Only use this in development! Never in production!

### Solution 2: Change Protocol to HTTP

If HTTPS is causing issues, try HTTP (if the server supports it):

Update `.env`:
```env
VIRTUALIZOR_PROTOCOL_1=http
VIRTUALIZOR_HOST_1=17221-10310.hostycare.in
VIRTUALIZOR_PORT_1=4082  # HTTP port might be different
```

### Solution 3: Firewall/Network Issue

The server might be blocking your application's IP address.

**Action Required**:
- Contact Hostycare support
- Provide your server's IP address
- Ask them to whitelist it for the Noida panel

### Solution 4: DNS Resolution Problem

The hostname might not be resolving correctly.

**Try using IP address instead**:
```env
VIRTUALIZOR_HOST_1=<IP_ADDRESS>  # Get IP from: nslookup 17221-10310.hostycare.in
```

### Solution 5: Server is Down

The Noida server might actually be down or under maintenance.

**Action Required**:
- Check Hostycare status page
- Contact Hostycare support
- Verify server is online via their control panel

### Solution 6: Update Retry Logic

Increase timeout and retries for this specific server:

The code already has:
- 2-minute timeout per request
- 3 retry attempts with exponential backoff
- Max 30-second wait between retries

## 🔧 Code Changes Made

### Enhanced Logging
Added detailed error logging to help diagnose the issue:
- Full URL logging
- Error type and stack trace
- Specific checks for network errors
- Suggestions for common issues

### User-Agent Header
Added User-Agent header to help with some servers that block requests without it.

## 📊 Comparison with Working Servers

### Lucknow (Working ✅)
- Host: `10365-10351.hostycare.in:4083`
- Returns 195 VMs successfully
- Average response time: ~26 seconds
- No connection issues

### Mumbai (Working ✅)
- Host: `server103245.hostycare.in:4083`
- Likely working (was being checked in logs)
- No reported failures

### Noida (Not Working ❌)
- Host: `17221-10310.hostycare.in:4083`
- "fetch failed" immediately
- All 3 retry attempts fail
- No response received at all

## 🎯 Recommended Actions

### Immediate Actions (Priority Order):

1. **Test connectivity manually** using curl or browser
   - This will confirm if it's a network issue or API issue

2. **Check with Hostycare support**
   - Ask about the Noida server status
   - Verify your IP is whitelisted
   - Check if there are any firewall rules

3. **Try HTTP instead of HTTPS**
   - Some servers have SSL misconfigured

4. **Enable NODE_TLS_REJECT_UNAUTHORIZED temporarily**
   - Only for testing
   - Will bypass SSL certificate validation

5. **Get the direct IP address**
   - DNS might be the issue
   - Use IP instead of hostname

### Long-term Solution:

Once you identify the issue:
- If it's SSL: Get proper certificates installed
- If it's firewall: Whitelist your application server
- If it's server down: Wait for Hostycare to fix it
- If it's permanent issue: Consider migrating Noida VMs to Lucknow/Mumbai panels

## 📝 Testing Checklist

- [ ] Can ping/reach the server?
- [ ] Does DNS resolve correctly?
- [ ] Is port 4083 open?
- [ ] Does HTTPS work in browser?
- [ ] Does curl/wget work?
- [ ] Is the SSL certificate valid?
- [ ] Are the API credentials correct?
- [ ] Is the server under maintenance?
- [ ] Is your IP whitelisted?
- [ ] Does HTTP work (instead of HTTPS)?

## 🆘 Contact Support

**Hostycare Support**:
- Email: support@hostycare.com
- Website: https://www.hostycare.com/contact-us

**Information to provide**:
- Account: Account 0 (Noida)
- Host: 17221-10310.hostycare.in
- Port: 4083
- Issue: "fetch failed" - cannot connect to Virtualizor API
- Your server IP: [Your application server IP]
- Error logs: [Attach the relevant logs]

---

**Last Updated**: November 19, 2024
**Status**: 🔴 UNRESOLVED - Awaiting connectivity fix





