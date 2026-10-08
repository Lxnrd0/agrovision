/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { cpus: 2 },
  ...(process.env.SITE_EXPORT === "1"
    ? { output: "export", images: { unoptimized: true } }
    : {}),
};
export default config;
