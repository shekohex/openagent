export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
  callbacks: {
    redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      return baseUrl;
    },
  },
};
