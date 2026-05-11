const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://localcoder.ai" : `https://${stage}.localcoder.ai`,
  console: stage === "production" ? "https://localcoder.ai/auth" : `https://${stage}.localcoder.ai/auth`,
  email: "contact@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/localcoder",
  discord: "https://localcoder.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
