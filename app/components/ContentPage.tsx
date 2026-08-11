interface ContentPageProps {
  children: React.ReactNode;
}

export default function ContentPage({ children }: ContentPageProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        {children}
      </div>
    </div>
  );
}

interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentCard({ children, className = "" }: ContentCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed ${className}`}>
      {children}
    </div>
  );
}
