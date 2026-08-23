import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PaymentCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-20 dark:bg-gray-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-900 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-amber-800 dark:text-amber-300">Payment not completed</h1>
        <p className="mt-4 text-gray-700 dark:text-gray-300">
          No booking confirmation has been issued. You can use the payment link again before its deadline, or contact us for help.
        </p>
        {reference && <p className="mt-4 font-mono font-semibold text-gray-900 dark:text-white">Reference: {reference}</p>}
        <p className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          Η πληρωμή δεν ολοκληρώθηκε και η κράτησή σας δεν έχει επιβεβαιωθεί.
        </p>
      </section>
    </main>
  );
}
