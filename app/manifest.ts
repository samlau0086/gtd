import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GTD Flow — 把想法变成下一步",
    short_name: "GTD Flow",
    description: "融合 GTD、可视化排期与 AI 任务拆分的个人效率工作台。",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#111516",
    theme_color: "#111516",
    lang: "zh-CN",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "打开今天",
        short_name: "今天",
        description: "查看今天需要推进的行动",
        url: "/?view=today&source=shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "打开收集箱",
        short_name: "收集箱",
        description: "快速处理刚刚收集的想法",
        url: "/?view=inbox&source=shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
