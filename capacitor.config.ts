import type { CapacitorConfig } from '@capacitor/cli';

/**
 * OceanLinux Android/iOS shell — loads the live site in a native WebView.
 * Local dev: CAPACITOR_SERVER_URL=http://10.0.2.2:3000 bun run cap:sync
 */
const config: CapacitorConfig = {
  appId: 'com.oceanlinux.app',
  appName: 'OceanLinux',
  webDir: 'mobile',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://oceanlinux.com',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0ea5e9',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#0ea5e9',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0369a1',
    },
  },
};

export default config;
