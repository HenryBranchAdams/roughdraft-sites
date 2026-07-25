import type { Metadata } from "next";
import { headers } from "next/headers";
import "./roughdraft-ui/style.css";
import "./globals.css";

const DESCRIPTION =
  "An unofficial community fork of Lex Roughdraft for Sites-hosted Markdown collaboration.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "roughdraft-skill-codex-macos.madebyhenry.chatgpt.site";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: {
      default: "Roughdraft community fork — Sites collaboration",
      template: "%s — Roughdraft community fork",
    },
    description: DESCRIPTION,
    applicationName: "Roughdraft community fork",
    openGraph: {
      title: "Roughdraft community fork — Sites collaboration",
      description:
        "Unofficial MIT-licensed fork for Sites-hosted Markdown review with explicit import and export.",
      type: "website",
      url: origin,
      images: [
        {
          url: socialImage,
          width: 1731,
          height: 909,
          alt: "Roughdraft shared Markdown review",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Roughdraft community fork — Sites collaboration",
      description:
        "Unofficial MIT-licensed fork for Sites-hosted Markdown review with explicit import and export.",
      images: [socialImage],
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
