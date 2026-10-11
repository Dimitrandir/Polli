import type { Metadata } from "next";

export const metadata: Metadata = { title: "Политика за поверителност" };

// Placeholder until the salon provides the final text.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-8">
      <h1 className="font-display text-5xl font-semibold text-ink">Политика за поверителност</h1>
      <p className="mt-6 leading-relaxed text-ink-soft">
        Използваме вашето име, телефон и имейл само за управление на резервациите ви и за връзка с вас относно тях.
        Пълният текст на политиката ще бъде публикуван тук.
      </p>
    </main>
  );
}
