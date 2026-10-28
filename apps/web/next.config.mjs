/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@workspace/ui', '@workspace/types'],
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
