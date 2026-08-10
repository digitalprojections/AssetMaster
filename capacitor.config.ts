import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'link.created.assetmaster',
  appName: 'AssetMaster',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
