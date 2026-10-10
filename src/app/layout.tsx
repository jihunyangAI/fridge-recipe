import type { Metadata } from "next";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "냉장고부탁해",
  description: "냉장고 사진으로 재료를 인식하고 레시피를 추천받는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* 헤더는 현재 경로(usePathname)를 읽으므로, 동적 경로에서도 셸을 막지 않도록 Suspense 안에 둔다 */}
          <Suspense fallback={<div className="h-[53px] border-b border-zinc-200 dark:border-zinc-800" />}>
            <SiteHeader />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
