import type { Metadata } from "next";

import { ContentPage } from "@/components/site/ContentPage";

export const metadata: Metadata = { title: "Политика за поверителност" };

export default function PrivacyPage() {
  return (
    <ContentPage
      slug="poveritelnost"
      title="Политика за поверителност"
      fallback={
        <p>
          Използваме вашето име, телефон и имейл само за управление на резервациите ви и за връзка с вас относно тях.
          Пълният текст на политиката ще бъде публикуван тук.
        </p>
      }
    />
  );
}
