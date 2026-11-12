import { SiteFooter, SiteHeader } from "@/components/site/site-header";

/** The public HCC Production site: no sign-in needed, no app sidebar. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
