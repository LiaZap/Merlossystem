/** @type {import('next').NextConfig} */
const nextConfig = {
  // Imagem de producao enxuta: o Next monta em `.next/standalone` um servidor
  // com so as dependencias que ele rastreou. O Dockerfile depende disto — sem
  // `standalone` nao existe o `server.js` que o CMD executa.
  output: "standalone",

  images: {
    // A midia do sistema e servida por /api/media/[id]/raw, que e mesma origem
    // e nao precisa de remotePattern. O Cloudinary saiu no ADR 0006.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
    ],
  },
};

export default nextConfig;
