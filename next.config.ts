
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Added to address findDOMNode error
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // This allows the Next.js development server (running on localhost:9003 via 'npm run dev')
  // to serve assets (like HMR updates) to pages loaded from the specified cloud workstation origin.
  allowedDevOrigins: ['https://9003-firebase-studio-1748970364029.cluster-l6vkdperq5ebaqo3qy4ksvoqom.cloudworkstations.dev'],
};

export default nextConfig;
