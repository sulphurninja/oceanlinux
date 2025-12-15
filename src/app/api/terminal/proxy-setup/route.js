import { NextResponse } from 'next/server';
import { NodeSSH } from 'node-ssh';

// POST - Setup proxy on server via SSH
export async function POST(request) {
  const ssh = new NodeSSH();
  
  try {
    const { ip, username, password, proxyUsername, proxyPassword, action } = await request.json();

    // Validate required fields
    if (!ip || !username || !password) {
      return NextResponse.json(
        { success: false, message: 'IP, username, and password are required' },
        { status: 400 }
      );
    }

    console.log(`[PROXY-SETUP] Connecting to ${ip} as ${username}`);

    // Connect to server via SSH
    await ssh.connect({
      host: ip,
      username: username,
      password: password,
      readyTimeout: 30000,
      tryKeyboard: true,
    });

    console.log(`[PROXY-SETUP] Connected successfully to ${ip}`);

    // Detect OS
    const osResult = await ssh.execCommand('cat /etc/os-release | grep -E "^ID=" | cut -d= -f2 | tr -d \'"\'');
    const osId = osResult.stdout.trim().toLowerCase();
    console.log(`[PROXY-SETUP] Detected OS: ${osId}`);

    let result;

    if (action === 'detect') {
      // Just detect OS and check if Squid is installed
      const squidCheck = await ssh.execCommand('which squid || which squid3 || echo "not_found"');
      const isSquidInstalled = !squidCheck.stdout.includes('not_found');
      
      ssh.dispose();
      
      return NextResponse.json({
        success: true,
        os: osId,
        isSquidInstalled,
        message: `Detected ${osId} - Squid ${isSquidInstalled ? 'is installed' : 'not installed'}`
      });
    }

    if (action === 'install') {
      // Install Squid proxy
      let installCommands;
      
      if (osId === 'ubuntu' || osId === 'debian') {
        installCommands = [
          'export DEBIAN_FRONTEND=noninteractive',
          'apt-get update -y',
          'apt-get install -y squid apache2-utils',
          'systemctl enable squid',
          'systemctl start squid'
        ];
      } else if (osId === 'centos' || osId === 'rhel' || osId === 'rocky' || osId === 'almalinux') {
        installCommands = [
          'yum install -y squid httpd-tools',
          'systemctl enable squid',
          'systemctl start squid'
        ];
      } else {
        ssh.dispose();
        return NextResponse.json({
          success: false,
          message: `Unsupported OS: ${osId}. Only Ubuntu/Debian and CentOS/RHEL are supported.`
        }, { status: 400 });
      }

      console.log(`[PROXY-SETUP] Installing Squid on ${osId}...`);
      
      for (const cmd of installCommands) {
        console.log(`[PROXY-SETUP] Running: ${cmd}`);
        const cmdResult = await ssh.execCommand(cmd, { execOptions: { pty: true } });
        if (cmdResult.code !== 0 && cmdResult.code !== null) {
          console.error(`[PROXY-SETUP] Command failed: ${cmd}`, cmdResult.stderr);
        }
      }

      result = { step: 'install', message: 'Squid installed successfully' };
    }

    if (action === 'configure' || action === 'install') {
      // Configure Squid for basic auth
      console.log(`[PROXY-SETUP] Configuring Squid...`);

      const squidConfPath = osId === 'ubuntu' || osId === 'debian' 
        ? '/etc/squid/squid.conf' 
        : '/etc/squid/squid.conf';

      const passwdPath = '/etc/squid/passwd';

      // Create password file
      await ssh.execCommand(`touch ${passwdPath}`);
      await ssh.execCommand(`chmod 640 ${passwdPath}`);
      
      // Set ownership
      if (osId === 'ubuntu' || osId === 'debian') {
        await ssh.execCommand(`chown proxy:proxy ${passwdPath}`);
      } else {
        await ssh.execCommand(`chown squid:squid ${passwdPath}`);
      }

      // Backup original config
      await ssh.execCommand(`cp ${squidConfPath} ${squidConfPath}.backup 2>/dev/null || true`);

      // Create new Squid configuration
      const squidConfig = `
# OceanLinux Squid Proxy Configuration
# Port 3128
http_port 3128

# Authentication
auth_param basic program /usr/lib/squid/basic_ncsa_auth ${passwdPath}
auth_param basic children 5
auth_param basic realm OceanLinux Proxy Server
auth_param basic credentialsttl 2 hours

# ACL definitions
acl authenticated proxy_auth REQUIRED
acl localnet src 10.0.0.0/8
acl localnet src 172.16.0.0/12
acl localnet src 192.168.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 21
acl Safe_ports port 443
acl Safe_ports port 70
acl Safe_ports port 210
acl Safe_ports port 1025-65535
acl Safe_ports port 280
acl Safe_ports port 488
acl Safe_ports port 591
acl Safe_ports port 777
acl CONNECT method CONNECT

# Access rules
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow authenticated
http_access deny all

# Disable caching
cache deny all

# Hide client IP
forwarded_for delete
request_header_access Via deny all
request_header_access X-Forwarded-For deny all
request_header_access Proxy-Connection deny all

# Disable logging (optional - for privacy)
access_log none
cache_log /dev/null

# Performance
dns_v4_first on
`;

      // Write config
      await ssh.execCommand(`cat > ${squidConfPath} << 'SQUIDEOF'
${squidConfig}
SQUIDEOF`);

      // Fix basic_ncsa_auth path based on OS
      if (osId === 'centos' || osId === 'rhel' || osId === 'rocky' || osId === 'almalinux') {
        await ssh.execCommand(`sed -i 's|/usr/lib/squid/basic_ncsa_auth|/usr/lib64/squid/basic_ncsa_auth|g' ${squidConfPath}`);
      }

      result = { step: 'configure', message: 'Squid configured successfully' };
    }

    if (action === 'adduser') {
      // Add proxy user
      if (!proxyUsername || !proxyPassword) {
        ssh.dispose();
        return NextResponse.json({
          success: false,
          message: 'Proxy username and password are required'
        }, { status: 400 });
      }

      console.log(`[PROXY-SETUP] Adding user: ${proxyUsername}`);
      
      const passwdPath = '/etc/squid/passwd';
      
      // Add user using htpasswd
      const addUserResult = await ssh.execCommand(
        `htpasswd -b ${passwdPath} "${proxyUsername}" "${proxyPassword}"`
      );

      if (addUserResult.code !== 0) {
        // Try creating file first
        await ssh.execCommand(`touch ${passwdPath}`);
        await ssh.execCommand(
          `htpasswd -bc ${passwdPath} "${proxyUsername}" "${proxyPassword}"`
        );
      }

      // Restart Squid
      await ssh.execCommand('systemctl restart squid');

      result = { 
        step: 'adduser', 
        message: `User ${proxyUsername} added successfully`,
        proxyDetails: {
          ip: ip,
          port: 3128,
          username: proxyUsername,
          password: proxyPassword
        }
      };
    }

    if (action === 'full-setup') {
      // Complete setup in one go
      if (!proxyUsername || !proxyPassword) {
        ssh.dispose();
        return NextResponse.json({
          success: false,
          message: 'Proxy username and password are required for full setup'
        }, { status: 400 });
      }

      console.log(`[PROXY-SETUP] Starting full setup on ${osId}...`);

      // Step 1: Install
      let installCommands;
      if (osId === 'ubuntu' || osId === 'debian') {
        installCommands = [
          'export DEBIAN_FRONTEND=noninteractive',
          'apt-get update -y',
          'apt-get install -y squid apache2-utils'
        ];
      } else {
        installCommands = [
          'yum install -y squid httpd-tools'
        ];
      }

      for (const cmd of installCommands) {
        console.log(`[PROXY-SETUP] Running: ${cmd}`);
        await ssh.execCommand(cmd, { execOptions: { pty: true } });
      }

      // Step 2: Configure
      const squidConfPath = '/etc/squid/squid.conf';
      const passwdPath = '/etc/squid/passwd';
      
      await ssh.execCommand(`touch ${passwdPath}`);
      
      const basicAuthPath = (osId === 'ubuntu' || osId === 'debian')
        ? '/usr/lib/squid/basic_ncsa_auth'
        : '/usr/lib64/squid/basic_ncsa_auth';

      const squidConfig = `
http_port 3128
auth_param basic program ${basicAuthPath} ${passwdPath}
auth_param basic children 5
auth_param basic realm OceanLinux Proxy
auth_param basic credentialsttl 2 hours
acl authenticated proxy_auth REQUIRED
acl SSL_ports port 443
acl Safe_ports port 80 21 443 70 210 1025-65535 280 488 591 777
acl CONNECT method CONNECT
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow authenticated
http_access deny all
cache deny all
forwarded_for delete
request_header_access Via deny all
request_header_access X-Forwarded-For deny all
access_log none
`;

      await ssh.execCommand(`cat > ${squidConfPath} << 'EOF'
${squidConfig}
EOF`);

      // Step 3: Add user
      await ssh.execCommand(`htpasswd -bc ${passwdPath} "${proxyUsername}" "${proxyPassword}"`);

      // Step 4: Start service
      await ssh.execCommand('systemctl enable squid');
      await ssh.execCommand('systemctl restart squid');

      // Step 5: Open firewall port
      await ssh.execCommand('firewall-cmd --permanent --add-port=3128/tcp 2>/dev/null || true');
      await ssh.execCommand('firewall-cmd --reload 2>/dev/null || true');
      await ssh.execCommand('ufw allow 3128/tcp 2>/dev/null || true');

      // Verify
      const statusResult = await ssh.execCommand('systemctl is-active squid');
      const isRunning = statusResult.stdout.trim() === 'active';

      result = {
        step: 'full-setup',
        success: isRunning,
        message: isRunning ? 'Proxy setup completed successfully!' : 'Setup completed but service may need attention',
        proxyDetails: {
          ip: ip,
          port: 3128,
          username: proxyUsername,
          password: proxyPassword,
          format: `${ip}:3128:${proxyUsername}:${proxyPassword}`
        }
      };
    }

    ssh.dispose();

    return NextResponse.json({
      success: true,
      os: osId,
      ...result
    });

  } catch (error) {
    console.error('[PROXY-SETUP] Error:', error);
    ssh.dispose();
    
    let errorMessage = error.message;
    if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused. Check if the IP is correct and SSH is running.';
    } else if (error.message.includes('ETIMEDOUT')) {
      errorMessage = 'Connection timed out. Server may be unreachable.';
    } else if (error.message.includes('Authentication failed')) {
      errorMessage = 'Authentication failed. Check username and password.';
    }

    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 500 });
  }
}
