import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "냉장고부탁해",
  description: "냉장고 사진으로 재료를 인식하고 레시피를 추천받는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
