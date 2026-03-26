import type { NextConfig } from "next";

const allowedDevOrigins = process.env.DEV_ALLOWED_HOSTNAMES!.split(",").map((hostname) => hostname.trim())

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	allowedDevOrigins
};

export default nextConfig;
