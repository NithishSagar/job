/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Only lint application code; the scraper/ folder is a separate (Python/Node) project.
    dirs: ['app', 'components', 'lib'],
  },
};

export default nextConfig;
