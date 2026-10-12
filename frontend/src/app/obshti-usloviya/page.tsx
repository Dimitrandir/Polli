import type { Metadata } from "next";

import { ContentPage } from "@/components/site/ContentPage";

export const metadata: Metadata = { title: "Общи условия" };

export default function TermsPage() {
  return (
    <ContentPage
      slug="obshti-usloviya"
      title="Общи условия"
      fallback={<p>Общите условия ще бъдат публикувани тук.</p>}
    />
  );
}
